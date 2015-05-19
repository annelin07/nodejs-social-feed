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
            console.log("timeline")
            let twitterClient = new Twitter({
                consumer_key: twitterConfig.consumerKey,
                consumer_secret: twitterConfig.consumerSecret,
                access_token_key: req.user.twitter.token,
                access_token_secret: req.user.twitter.secret
            })
            let [tweets, ] = await twitterClient.promise.get('/statuses/home_timeline')
            tweets = tweets.map(tweet => {
                return {
                    id: tweet.id_str,
                    image: tweet.user.profile_image_url,
                    text: tweet.text,
                    name: tweet.user.name,
                    username: "@" + tweet.user.screen_name,
                    liked: tweet.favorited,
                    network: networks.twitter
                }
            })

            let fbResponse = await new Promise((resolve, reject) => FB.api('/me/home', {limit: 10, access_token: req.user.facebook.token},  resolve))
            let fbPosts = fbResponse.data
            let fbPostsProcessed = []
            for (let post of fbPosts) {
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
                    network: networks.facebook

                })
            }

            let aggregatedPosts = _.union(fbPostsProcessed, tweets)
            res.render('timeline.ejs', {
                posts: aggregatedPosts
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
        console.log("req.body", req.body)
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
        console.log("/compose, postTo", postTo)
        //TODO use async promise.all
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
    app.get('/reply/:id', isLoggedIn, then(async(req, res) => {
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
            post: tweet
        })
    }))

    app.post('/reply/:id', isLoggedIn, then(async(req, res) => {
        let twitterClient = new Twitter({
            consumer_key: twitterConfig.consumerKey,
            consumer_secret: twitterConfig.consumerSecret,
            access_token_key: req.user.twitter.token,
            access_token_secret: req.user.twitter.secret
        })
        let id = req.params.id
        let text = req.body.reply
        if (text.length > 140) {
            return req.flash('error', 'status is over 140 chars')
        }
        if (!text.length) {
            return req.flash('error', 'status is empty')
        }

        await twitterClient.promise.post('statuses/update', {
            status: text,
            in_reply_to_status_id: id
        })
        return res.redirect('/timeline')
    }))


    app.get('/share/:id', isLoggedIn, then(async(req, res) => {
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
            post: tweet
        })
    }))
    app.post('/share/:id', isLoggedIn, then(async(req, res) => {
        let twitterClient = new Twitter({
            consumer_key: twitterConfig.consumerKey,
            consumer_secret: twitterConfig.consumerSecret,
            access_token_key: req.user.twitter.token,
            access_token_secret: req.user.twitter.secret
        })
        let id = req.params.id
        let text = req.body.share
        if (text.length > 140) {
            return req.flash('error', 'status is over 140 chars')
        }
        if (!text.length) {
            return req.flash('error', 'status is empty')
        }
        try {

            await twitterClient.promise.post('statuses/retweet/' + id, {text})
        } catch (e) {
            console.log("Error", e)
        }
        return res.redirect('/timeline')
    }))

    app.get('/auth/twitter', passport.authenticate('twitter'))

    app.get('/auth/twitter/callback', passport.authenticate('twitter', {
        successRedirect: '/profile',
        failureRedirect: '/login',
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