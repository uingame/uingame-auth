// Determine Redis URL: prefer env var, then local for dev, then cloud fallback
const isDev = process.env.NODE_ENV !== 'production'
const redisUrl = process.env.REDISCLOUD_URL || 
                 process.env.REDIS_URL || 
                 (isDev ? 'redis://localhost:6379' : 'redis://p82ac107755c622e093015c4022e6e47305e381829c4de983bc7261246d79ab4f@ec2-54-217-208-106.eu-west-1.compute.amazonaws.com:18180')

module.exports = {
  // Common Settings
  port: process.env.PORT || 8080,
  redisUrl: redisUrl,
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
  acmeChallengeValue: process.env.ACME_CHALLENGE_VALUE,

  // LRS (MoE xAPI) Settings
  // Optional settings (have defaults)
  lrsEnabled: process.env.LRS_ENABLED === 'true',  // default: false (safe until configured)
  lrsActivityId: process.env.LRS_ACTIVITY_ID || 'https://www.uingame.co.il',
  lrsEcatItemUri: process.env.LRS_ECAT_ITEM_URI || undefined,  // optional - obtain from MoE if required
  lrsDedupeTtl: parseInt(process.env.LRS_DEDUPE_TTL, 10) || 300,  // default: 5 minutes
  lrsLogUserKeys: process.env.LRS_LOG_USER_KEYS === 'true',  // default: false

  // MUST configure (no defaults) - required when LRS_ENABLED=true
  // NOTE: LRS credentials (CLIENT_ID, CLIENT_SECRET, ECAT_ITEM_URI) must be obtained from MoE
  // Contact: [MoE Integration Team / Portal URL - TO BE DOCUMENTED]
  lrsBaseUrl: process.env.LRS_BASE_URL,  // e.g. https://lrs-stg.education.gov.il
  lrsClientId: process.env.LRS_CLIENT_ID,  // Obtain from MoE integration portal/team
  lrsClientSecret: process.env.LRS_CLIENT_SECRET,  // Obtain from MoE integration portal/team
  lrsScope: process.env.LRS_SCOPE,  // 'lrs' (staging) or 'lrsprod' (prod)
  lrsCookieSecret: process.env.LRS_COOKIE_SECRET  // for signing session cookie
}
