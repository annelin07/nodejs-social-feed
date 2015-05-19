let passport = require('passport')
let LocalStrategy = require('passport-local').Strategy
let FacebookStrategy = require('passport-facebook').Strategy
let TwitterStrategy = require('passport-twitter').Strategy
let nodeifyit = require('nodeifyit')
let User = require('../models/user')
let GoogleStrategy = require('passport-google-oauth').OAuth2Strategy
//let GoogleStrategy = require('passport-google-oauth').Strategy


//TODO:
// let configAuth = require('../../config/auth').dev


require('songbird')

function useExternalPassportStrategy(OauthStrategy, config, accountType) {
    config.passReqToCallback = true

    passport.use(new OauthStrategy(config, nodeifyit(authCB, {
        spread: true
    })))
    console.log("useExternalPassportStrategy", config, accountType)

    async
    function authCB(req, token, _ignored_, account) {
        let accountID = account.id
        let idCol = accountType + ".id"
        console.log("authCB account, idCol", account, idCol)

        let user = await User.promise.findOne({
                 idCol: accountID
             })
        if (!user) {
            user = new User({})
        }
        user[accountType].id = accountID
        user[accountType].token = token
        user[accountType].secret = _ignored_
        user[accountType].name = account.displayName

        return await user.save()
    }
}


function configure(configAuth) {
    // Required for session support / persistent login sessions
    passport.serializeUser(nodeifyit(async(user) => user.id))
    passport.deserializeUser(nodeifyit(async(id) => {
        return await User.promise.findById(id)
    }))

    console.log("configAuth", configAuth.twitter)

    useExternalPassportStrategy(FacebookStrategy, {
        clientID: configAuth.facebook.consumerKey,
        clientSecret: configAuth.facebook.consumerSecret,
        callbackURL: configAuth.facebook.callbackUrl
    }, 'facebook')

    useExternalPassportStrategy(TwitterStrategy, {
        consumerKey: configAuth.twitter.consumerKey,
        consumerSecret: configAuth.twitter.consumerSecret,
        callbackURL: configAuth.twitter.callbackUrl
    }, 'twitter')

    useExternalPassportStrategy(GoogleStrategy, {
        clientID: configAuth.google.clientID,
        clientSecret: configAuth.google.clientSecret,
        callbackURL: configAuth.google.callbackUrl
    }, 'google')

    return passport
}

passport.use("local", new LocalStrategy({
    usernameField: 'username',
    failureFlash: true

}, nodeifyit(async(username, password) => {
    let user

    let email
    if (username.indexOf('@') >= 0) {

        email = username.toLowerCase()
        let query = {
            'local.email': email
        }

        user = await User.promise.findOne({
            query
        })
    } else {

        let regexp = new RegExp(username, 'i')
        user = await User.promise.findOne({
            username: {
                $regex: regexp
            }
        })

    }

    if (!email) {
        if (!user || username != user.username) {
            return [false, {
                message: 'Invalid username'
            }]
        }
    } else {
        if (!user || email != user.local.email) {
            return [false, {
                message: 'Invalid email'
            }]
        }
    }
    if (!await user.validatePassword(password)) {
        return [false, {
            message: 'Invalid password'
        }]
    }
    return user
}, {
    spread: true
})))

passport.use('local-signup', new LocalStrategy({
    usernameField: 'email',
    failureFlash: true,
    passReqToCallback: true
}, nodeifyit(async(req, email, password) => {

    /* Do email query */
    email = (email || '').toLowerCase()
    if (await User.promise.findOne({
            email
        })) {
        return [false, "That email is already taken."]
    }

    let user = new User()
    user.local.email = email


    user.local.password = password
    try {
        return await user.save()

    } catch (e) {
        //console.log(util.inspect(e))
        return [false, {
            message: e.message
        }]
    }

    return await user.save()
}, {
    spread: true
})))

module.exports = {
    passport, configure
}
