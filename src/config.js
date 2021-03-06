module.exports = {
  // Common Settings
  port: process.env.PORT || 8080,
  redisUrl: process.env.REDISTOGO_URL || '127.0.0.1',
  tokenExpiration: process.env.TOKEN_EXPIRATION || 300, // 5 minutes
  corsOrigin: process.env.CORS_ORIGIN || 'https://www.uingame.co.il',

  // Auth Redirection
  successRedirect: process.env.SUCCESS_REDIRECT || 'https://www.uingame.co.il/createsession',
  logoutRedirectUrl: process.env.LOGOUT_REDIRECT || 'https://www.uingame.co.il',

  // SAML Settings
  host: 'auth.uingame.co.il',
  idpMetadataUrl: process.env.IDP_METADATA_URL || 'https://lgn.edu.gov.il/nidp/saml2/metadata',
  logoutUrl: process.env.LOGOUT_URL || 'https://lgn.edu.gov.il/nidp/jsp/logoutSuccess.jsp',
  issuer: 'http://auth.uingame.co.il',
  privateKey: process.env.SAML_PRIVATE_KEY,
  certificate: process.env.SAML_CERT,

  // For Getting an SSL Certificate
  acmeChallengeToken: process.env.ACME_CHALLENGE_TOKEN,
  acmeChallengeValue: process.env.ACME_CHALLENGE_VALUE
}
