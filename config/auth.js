// config/auth.js
// !Important. DO NOT USE MY AUTH KEY!
module.exports = {
    'development': {
        'facebook': {
            'consumerKey': '1609523435928726',
            'consumerSecret': 'b9ad8bd7a483e76d64a3023e94cf17a3',
            'callbackUrl': 'http://socialauthenticator.com:8000/auth/facebook/callback'
        },
        'twitter': {
            'consumerKey': 'Ipp9I3Ky5GVjCbhvL6Mz5QOxN',
            'consumerSecret': 'Hn05FY65jVeOj0LsOila4CWeTPXcNfEXXCnPTJkh6yc268VmBo',
            'callbackUrl': 'http://socialauthenticator.com:8000/auth/twitter/callback'
        },
        'google': {
            'consumerKey': '937472572686-8hknabteklrev9169381tpb47mj3g0bb.apps.googleusercontent.com',
            'consumerSecret': 'bTrI3Xrh2Dj7OeZF5tb2Wp9E',
            'callbackUrl': 'http://socialauthenticator.com:8000/auth/google/callback'
        }
    }
}