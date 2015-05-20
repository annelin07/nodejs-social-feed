let _ = require('lodash')
let Twitter = require('twitter')
let then = require('express-then')
let isLoggedIn = require('./middlewares/isLoggedIn')
let posts = require('../data/posts')
let FB = require('fb')

let networks = {
    twitter: {
        icon: 'twitter',
        name: 'twitter',
        class: 'btn-info'
    },
    facebook: {
        icon: 'facebook',
        name: 'facebook',
        class: 'btn-primary'
    }
}

module.exports = (app) => {
    let passport = app.passport
        // Scope specifies the desired data fields from the user account
    let scope = 'email, user_posts, read_stream, user_likes, publish_actions'
    let twitterConfig = app.config.auth.twitter
    let fbConfig = app.config.auth.facebook

    FB.options({
        appId: fbConfig.consumerKey,
        appSecret: fbConfig.consumerSecret,
        redirectUri: fbConfig.redirectUri
    })

    app.get('/', (req, res) => res.render('index.ejs'))

    app.get('/profile', isLoggedIn, (req, res) => {
        res.render('profile.ejs', {
            user: req.user,
            message: req.flash('error')
        })
    })

    app.get('/logout', (req, res) => {
        req.logout()
        res.redirect('/')
    })

    app.get('/login', (req, res) => {
        res.render('login.ejs', {
            message: req.flash('error')
        })
    })

    app.post('/login', passport.authenticate('local', {
        successRedirect: '/timeline',
        failureRedirect: '/login',
        failureFlash: true
    }))


    app.get('/signup', (req, res) => {
        res.render('signup.ejs', {
            message: req.flash('error')
        })
    })

    app.post('/signup', passport.authenticate('local-signup', {
        successRedirect: '/timeline',
        failureRedirect: '/signup',
        failureFlash: true
    }))


    app.get('/timeline', isLoggedIn, then(async(req, res) => {
        try {
            let twitterClient = new Twitter({
                consumer_key: twitterConfig.consumerKey,
                consumer_secret: twitterConfig.consumerSecret,
                access_token_key: req.user.twitter.token,
                access_token_secret: req.user.twitter.secret
            })
            let [tweets, ] = await twitterClient.promise.get('/statuses/home_timeline')
            tweets = tweets.map(tweet => {
                //console.log('tweet', tweet)
                return {
                    id: tweet.id_str,
                    image: tweet.user.profile_image_url,
                    text: tweet.text,
                    name: tweet.user.name,
                    username: "@" + tweet.user.screen_name,
                    liked: tweet.favorited,
                    date: new Date(tweet.created_at),
                    network: networks.twitter
                }
            })

            let fbResponse = await new Promise((resolve, reject) => FB.api('/me/home', {limit: 10, access_token: req.user.facebook.token},  resolve))
            let fbPosts = fbResponse.data
            let fbPostsProcessed = []
            for (let post of fbPosts) {
                //console.log("FB post", post)
                let userId = post.from.id
                let picUri = '/' + userId + '/picture'
                let fbResponse = await new Promise((resolve, reject) => FB.api(picUri, {redirect: false}, resolve))
                let userPicture = fbResponse.data
                //list of likes is coming from the api.
                let likes = post.likes ? post.likes.data : []
                //find if likes array contains this user.
                let liked = _.findIndex(likes, {
                        'id': req.user.facebook.id
                    }) >= 0

                fbPostsProcessed.push({
                    id: post.id,
                    image: userPicture.url, //post.picture,
                    text: post.story || post.message,
                    name: '@' + post.from.name,
                    pic: post.picture,
                    liked: liked,
                    date: new Date(post.created_time),
                    network: networks.facebook

                })
            }

            let aggregatedPosts = _.union(fbPostsProcessed, tweets)
            res.render('timeline.ejs', {
                posts: aggregatedPosts.slice(0, 20)
            })
        } catch (e) {
            console.log(e)
        }
    }))

    app.get('/compose', isLoggedIn, (req, res) => {
        res.render('compose.ejs', {
            message: req.flash('error')
        })
    })

   app.post('/compose', isLoggedIn, then(async(req, res) => {
        let text = req.body.reply
        let postTo = req.body.postTo
        if (postTo.length == 0) {
            return req.flash('error', 'You have to at least pick one network')
        }

        if (text.length > 140) {
            return req.flash('error', 'status is over 140 chars')
        }
        if (!text.length) {
            return req.flash('error', 'status is empty')
        }
        let twitterClient = new Twitter({
            consumer_key: twitterConfig.consumerKey,
            consumer_secret: twitterConfig.consumerSecret,
            access_token_key: req.user.twitter.token,
            access_token_secret: req.user.twitter.secret
        })
        if (postTo.indexOf('twitter') >= 0) {
            try {
                await twitterClient.promise.post('statuses/update', {
                    status: text
                })
            } catch (e) {
                console.log("twitter e", e)
            }
        }
        if (postTo.indexOf('facebook') >= 0) {
            await new Promise((resolve, reject) => FB.api(`${req.user.facebook.id}/feed`, 'post', {
                    access_token: req.user.facebook.token,
                    message: text},  resolve))
        }
        return res.redirect('/timeline')
    }))

    app.post('/twitter/like/:id', isLoggedIn, then(async(req, res) => {
        let twitterClient = new Twitter({
            consumer_key: twitterConfig.consumerKey,
            consumer_secret: twitterConfig.consumerSecret,
            access_token_key: req.user.twitter.token,
            access_token_secret: req.user.twitter.secret
        })
        let id = req.params.id

        await twitterClient.promise.post('favorites/create', {
            id
        })

        res.end()
    }))

    app.post('/twitter/unlike/:id', isLoggedIn, then(async(req, res) => {
        let twitterClient = new Twitter({
            consumer_key: twitterConfig.consumerKey,
            consumer_secret: twitterConfig.consumerSecret,
            access_token_key: req.user.twitter.token,
            access_token_secret: req.user.twitter.secret
        })
        let id = req.params.id

        await twitterClient.promise.post('favorites/destroy', {id})

        res.end()
    }))

    app.post('/facebook/like/:id', isLoggedIn, then(async(req, res) => {
        let id = req.params.id
        let uri = `/${id}/likes`
        await new Promise((resolve, reject) => FB.api(uri, 'post', {
                    access_token: req.user.facebook.token},  resolve))
        res.end()
    }))
    app.post('/facebook/unlike/:id', isLoggedIn, then(async(req, res) => {
        let id = req.params.id
        let uri = `/${id}/likes`
        await new Promise((resolve, reject) => FB.api(uri, 'delete', {
                access_token: req.user.facebook.token}, resolve))
          res.end()
    }))


    app.get('/twitter/reply/:id', isLoggedIn, then(async(req, res) => {
        let twitterClient = new Twitter({
            consumer_key: twitterConfig.consumerKey,
            consumer_secret: twitterConfig.consumerSecret,
            access_token_key: req.user.twitter.token,
            access_token_secret: req.user.twitter.secret
        })
        let id = req.params.id
        let [tweet, ] = await twitterClient.promise.get('/statuses/show/' + id)

        tweet = {
            id: tweet.id_str,
            image: tweet.user.profile_image_url,
            text: tweet.text,
            name: tweet.user.name,
            username: "@" + tweet.user.screen_name,
            liked: tweet.favorited,
            network: networks.twitter
        }

        res.render('reply.ejs', {
            post: tweet,
            acctType: 'twitter'
        })
    }))

    app.post('/twitter/reply/:id', isLoggedIn, then(async(req, res) => {
        let twitterClient = new Twitter({
            consumer_key: twitterConfig.consumerKey,
            consumer_secret: twitterConfig.consumerSecret,
            access_token_key: req.user.twitter.token,
            access_token_secret: req.user.twitter.secret
        })
        let id = req.params.id
        let text = req.body.reply
        if (text.length > 140) {
            return req.flash('error', 'reply text is over 140 chars')
        }
        if (!text.length) {
            return req.flash('error', 'reply text is empty')
        }

        await twitterClient.promise.post('statuses/update', {
            status: text,
            in_reply_to_status_id: id
        })
        return res.redirect('/timeline')
    }))

    app.get('/facebook/reply/:id', isLoggedIn, then(async(req, res) => {
        let id = req.params.id
        let post
        post = {
            id: id,
            // image: , //post.picture,
            text: req.query.text, //post.story || post.message,
            name: req.query.name, //post.from.name,
            image: decodeURIComponent(req.query.img) + '',
            // username: "@" + tweet.user.screen_name,
            network: networks.facebook
        }
        console.log("post.pic", )

        res.render('reply.ejs', {
            post: post,
            acctType: 'facebook'
        })
    }))

    app.post('/facebook/reply/:id', isLoggedIn, then(async(req, res) => {
        let id = req.params.id
        if (!req.body.reply.length) {
            return req.flash('error', 'reply text is empty')
        }
        let uri = `/${id}/comments`
        await new Promise((resolve, reject) => FB.api(uri, 'post', {
                message: req.body.reply,
                access_token: req.user.facebook.token}, resolve))
        return res.redirect('/timeline')
    }))


    app.get('/twitter/share/:id', isLoggedIn, then(async(req, res) => {
        let twitterClient = new Twitter({
            consumer_key: twitterConfig.consumerKey,
            consumer_secret: twitterConfig.consumerSecret,
            access_token_key: req.user.twitter.token,
            access_token_secret: req.user.twitter.secret
        })
        let id = req.params.id
        let [tweet, ] = await twitterClient.promise.get('/statuses/show/' + id)

        tweet = {
            id: tweet.id_str,
            image: tweet.user.profile_image_url,
            text: tweet.text,
            name: tweet.user.name,
            username: "@" + tweet.user.screen_name,
            liked: tweet.favorited,
            network: networks.twitter
        }

        res.render('share.ejs', {
            post: tweet,
            acctType: 'twitter'
        })
    }))
    app.post('/twitter/share/:id', isLoggedIn, then(async(req, res) => {
        let twitterClient = new Twitter({
            consumer_key: twitterConfig.consumerKey,
            consumer_secret: twitterConfig.consumerSecret,
            access_token_key: req.user.twitter.token,
            access_token_secret: req.user.twitter.secret
        })
        let id = req.params.id
        let text = req.body.share
        if (text.length > 140) {
            return req.flash('error', 'share text is over 140 chars')
        }
        if (!text.length) {
            return req.flash('error', 'share text is empty')
        }
        try {
            await twitterClient.promise.post('statuses/retweet/' + id, {text})
        } catch (e) {
            console.log("Error", e)
        }
        return res.redirect('/timeline')
    }))

    app.get('/facebook/share/:id', isLoggedIn, then(async(req, res) => {
        let id = req.params.id
        let post
        post = {
            id: id,
            // image: , //post.picture,
            text: req.query.text, //post.story || post.message,
            name: req.query.name, //post.from.name,
            image: decodeURIComponent(req.query.img) + '',
            network: networks.facebook
        }

        res.render('share.ejs', {
            post: post,
            acctType: 'facebook'
        })
    }))

  app.post('/facebook/share/:id', isLoggedIn, then(async(req, res) => {
        let id = req.params.id
        let text = req.body.share
        if (!text.length) {
            return req.flash('error', 'share text is empty')
        }
        // construct id of 112345678_987654321 into
        // https://www.facebook.com/12345678/posts/987654321
        let id_fragments = id.split('_')
        let link = "https://www.facebook.com/" + id_fragments[0] +'/posts/' +  id_fragments[1]
        console.log("share link", link)
        await new Promise((resolve, reject) => FB.api('/me/links', 'post', {
                link: link,
                access_token: req.user.facebook.token}, resolve))
        return res.redirect('/timeline')
    }))


    app.get('/auth/twitter', passport.authenticate('twitter'))

    app.get('/auth/twitter/callback', passport.authenticate('twitter', {
        successRedirect: '/profile',
        failureRedirect: '/login',
        failureFlash: true
    }))

  // Authorization route & Callback URL
    app.get('/connect/twitter', passport.authorize('twitter'))
    app.get('/connect/twitter/callback', passport.authorize('twitter', {
        successRedirect: '/profile',
        failureRedirect: '/profile',
        failureFlash: true
    }))

    // Facebook
    app.get('/auth/facebook', passport.authenticate('facebook', {
        scope
    }))
    app.get('/auth/facebook/callback', passport.authenticate('facebook', {
        successRedirect: '/profile',
        failureRedirect: '/login',
        failureFlash: true
    }))

    // Authorization route & Callback URL
    app.get('/connect/facebook', passport.authorize('facebook', {
        scope
    }))
    app.get('/connect/facebook/callback', passport.authorize('facebook', {
        successRedirect: '/profile',
        failureRedirect: '/profile',
        failureFlash: true
    }))


    // Google
    app.get('/auth/google', passport.authenticate('google', {
        scope: ['https://www.googleapis.com/auth/plus.login']
    }))
    app.get('/auth/google/callback', passport.authenticate('google', {
        successRedirect: '/profile',
        failureRedirect: '/login',
        failureFlash: true
    }))

    // Authorization route & Callback URL
    let googleScope = 'email'
    app.get('/connect/google', passport.authorize('google', {googleScope}))
    app.get('/connect/google/callback', passport.authorize('google', {
        successRedirect: '/profile',
        failureRedirect: '/profile',
        failureFlash: true
    }))
}