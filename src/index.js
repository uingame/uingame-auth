// Load .env file only in non-production environments (staging/development)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const querystring = require('query-string')
const randtoken = require('rand-token')
const passport = require('passport')
const cors = require('cors')

const createSamlStartegy = require('./samlAuthenticationStrategy')
const redis = require('./redis')
const config = require('./config')
const lrs = require('./lrs')


init().catch(err => {
  console.error('FATAL ERROR!')
  console.error(err)
})

async function init() {
  const app = express()
  app.use(bodyParser.urlencoded({ extended: true }))
  app.use(bodyParser.json())
  
  // Cookie parser for LRS session tracking
  if (config.lrsCookieSecret) {
    app.use(cookieParser(config.lrsCookieSecret))
  }

  passport.serializeUser(function (user, done) {
    done(null, user);
  });
  passport.deserializeUser(function (user, done) {
    done(null, user);
  });
  const samlStrategy = await createSamlStartegy()
  passport.use(samlStrategy)
  app.use(passport.initialize())

  app.get('/login',
    async (req, res, next) => {
      let userIP = req.headers['x-forwarded-for'] || req.ip;
      if (userIP.includes(',')) {
        userIP = userIP.split(',')[0].trim();
      }
      let referer = req.get('Referer') != undefined ? req.get('Referer') : (!!req.query.rf != undefined && req.query.rf == 'space') ? 'https://space.uingame.co.il/' : 'https://www.uingame.co.il/' ;
      try {
        await redis.set(userIP, JSON.stringify({referer}));
        await redis.expire(userIP, 3600 * 24);
      }
      catch (err) {
        console.error(`Error while saving in redis: ${err}`)
        res.redirect('/login/fail')
      }
      req.query.RelayState = req.params.referer = {referer};
      passport.authenticate('saml', {
        failureRedirect: '/login/fail',
        additionalParams: { callbackReferer: referer }
      })(req, res, next);
    }
  );

  app.post('/login/callback',
    passport.authenticate('saml', { failureRedirect: '/login/fail' }),
    async (req, res, next) => {
      let userIP = req.headers['x-forwarded-for'] || req.ip;
      if (userIP.includes(',')) {
        userIP = userIP.split(',')[0].trim();
      }
      const siteInfo = JSON.parse(await redis.get(userIP));
      if (req.isAuthenticated()) {
        console.log(req.isAuthenticated());
        const token = randtoken.generate(16);
        const keyName = `TOKEN:${token}`
        try {
          await redis.set(keyName, JSON.stringify(req.user))
          await redis.expire(keyName, config.tokenExpiration)
          await redis.expire(userIP, 1);
          res.redirect(`${siteInfo.referer+'/createsession'}?${querystring.stringify({ token })}`)
        } catch (err) {
          console.error(`Error while saving in redis: ${err}`)
          res.redirect('/login/fail')
        }
      } else {
        res.redirect('/login/fail')
      }
    }
  )

  app.get('/login/verify',
    cors({
      origin: [config.corsOrigin,'https://space.uingame.co.il']
    }),
    async (req, res, next) => {
      const { token } = req.query
      if (!token) {
        return res.status(400).send('Bad Request')
      }
      const keyName = `TOKEN:${token}`
      try {
        const user = JSON.parse(await redis.get(keyName))
        if (!user) {
          return res.status(404).send('Not Found')
        } else {
          res.send(user);
        }
      } catch (err) {
        console.error(`Error while getting from redis: ${err}`)
        res.status(500).send('Internal Server Error')
      }
    }
  )

  app.get('/login/fail',
    (req, res) => {
      res.status(401).send('Login failed')
    }
  )

  // LRS connect endpoint - called by Wix after license confirmation
  const lrsCorsOptions = {
    origin: [config.corsOrigin, 'https://space.uingame.co.il'],
    credentials: true
  }

  app.options('/lrs/connect', cors(lrsCorsOptions))

  app.post('/lrs/connect',
    cors(lrsCorsOptions),
    async (req, res) => {
      try {
        const { token, pageUrl, buttonId, clientTs } = req.body

        if (!token) {
          return res.status(400).json({ ok: false, error: 'Token required' })
        }

        // Validate token and get user (server-side verification)
        const keyName = `TOKEN:${token}`
        let user
        try {
          const raw = await redis.get(keyName)
          if (!raw) {
            return res.status(401).json({ ok: false, error: 'Invalid or expired token' })
          }
          user = JSON.parse(raw)
        } catch (err) {
          console.error('[LRS Connect] Token lookup error:', err.message)
          return res.status(500).json({ ok: false, error: 'Internal error' })
        }

        // Emit connect event
        console.log('[LRS Connect] Calling emitConnect for user:', user.id || user.email || 'unknown')
        const result = await lrs.emitConnect(user, { pageUrl, buttonId, clientTs })
        console.log('[LRS Connect] emitConnect result:', { success: result.success, sessionId: result.sessionId, skipped: result.skipped, error: result.error })

        // Set session cookie for logout tracking (even if LRS send failed)
        if (result.actorId && config.lrsCookieSecret) {
          const sessionData = {
            actorId: result.actorId,
            actor: result.actor,
            sessionId: result.sessionId,
            loginAt: result.loginAt || Date.now()
          }
          res.cookie('lrs_session', JSON.stringify(sessionData), {
            domain: '.uingame.co.il',
            path: '/',
            httpOnly: true,
            secure: true,
            signed: true,
            sameSite: 'none',
            maxAge: 86400000 // 24 hours
          })
        }

        res.json({ ok: true, sessionId: result.sessionId })
      } catch (err) {
        console.error('[LRS Connect] Unexpected error:', err.message)
        res.status(200).json({ ok: true, warning: 'LRS error' })
      }
    }
  )

  app.get('/logout',
    async (req, res) => {
      // Emit LRS disconnect event if session cookie exists
      if (config.lrsEnabled && config.lrsCookieSecret && req.signedCookies) {
        const rawSession = req.signedCookies.lrs_session
        if (rawSession) {
          try {
            const sessionData = JSON.parse(rawSession)
            // Fire-and-forget - don't block logout
            lrs.emitDisconnect(sessionData).catch(err => {
              console.error('[LRS Logout] Error:', err.message)
            })
          } catch (err) {
            console.warn('[LRS Logout] Invalid session cookie:', err.message)
          }

          // Clear the session cookie
          res.clearCookie('lrs_session', {
            domain: '.uingame.co.il',
            path: '/',
            httpOnly: true,
            secure: true,
            signed: true,
            sameSite: 'none'
          })
        }
      }

      let referer = req.get('Referer') != undefined ? req.get('Referer') : (!!req.query.rf != undefined && req.query.rf == 'space') ? 'https://space.uingame.co.il/' : 'https://www.uingame.co.il/' ;
      res.redirect(`${config.logoutUrl}?logoutURL=${referer}`)
    }
  )

  app.get('/no-license-logout',
  (req, res) => {
    let referer = req.get('Referer') != undefined ? req.get('Referer') : (!!req.query.rf != undefined && req.query.rf == 'space') ? 'https://space.uingame.co.il/' : 'https://www.uingame.co.il/' ;
    res.redirect(`${config.logoutUrl}?logoutURL=${referer}/no-license/`)
  }
)

  app.get('/saml/metadata',
    (req, res, next) => {
      try {
        res.type('application/xml')
        res.status(200).send(samlStrategy.generateServiceProviderMetadata(config.certificate))
      } catch (err) {
        next(err)
      }
    }
  )

  if (config.acmeChallengeValue && config.acmeChallengeToken) {
    app.get(`/.well-known/acme-challenge/${config.acmeChallengeToken}`, (req, res, next) => {
      res.send(config.acmeChallengeValue)
    })
    app.get(`/.well-known/pki-validation/${config.acmeChallengeToken}`, (req, res, next) => {
      res.send(config.acmeChallengeValue)
    })
  }

  //general error handler
  app.use(function (err, req, res, next) {
    console.log("Fatal error: " + JSON.stringify(err))
    next(err)
  })

  app.listen(config.port, () => {
    console.log(`Auth server listening on port ${config.port}...`)
  })

}
