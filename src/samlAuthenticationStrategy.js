// Polyfill fetch for Node < 18
if (!globalThis.fetch) {
  const fetch = require('node-fetch')
  globalThis.fetch = fetch
}

const fs = require('fs')
const path = require('path')
const { Strategy: SamlStrategy } = require('@node-saml/passport-saml')
const config = require('./config')

/**
 * Fetches and parses SAML IdP metadata XML
 */
async function fetchMetadata(metadataUrl) {
  console.log('[SAML] Fetching Identity Provider metadata from:', metadataUrl)
  
  const response = await fetch(metadataUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/xml, text/xml'
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`)
  }

  const xml = await response.text()
  console.log('[SAML] Metadata fetched, length:', xml.length)
  
  // Parse XML to extract IdP SSO URL and certificate
  // Look for SingleSignOnService with HTTP-Redirect binding (preferred for login redirects)
  const idpSsoMatchRedirect = xml.match(/<md:SingleSignOnService[^>]*Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"[^>]*Location="([^"]+)"/i)
  const idpSsoMatchPost = xml.match(/<md:SingleSignOnService[^>]*Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"[^>]*Location="([^"]+)"/i)
  const idpSsoMatch = idpSsoMatchRedirect || idpSsoMatchPost ||
                      xml.match(/<md:SingleSignOnService[^>]*Location="([^"]+)"/i) ||
                      xml.match(/<[^:]*:SingleSignOnService[^>]*Location="([^"]+)"/i)
  
  // Look for ALL X509Certificates
  const certRegex = /<(?:[^:]*:)?X509Certificate>([^<]+)<\/(?:[^:]*:)?X509Certificate>/gi
  const certMatches = [...xml.matchAll(certRegex)]
  
  if (!idpSsoMatch) {
    console.error('[SAML] XML snippet:', xml.substring(0, 1000))
    throw new Error('Invalid SAML metadata: missing IdP SSO URL (SingleSignOnService not found)')
  }
  
  if (certMatches.length === 0) {
    console.error('[SAML] XML snippet:', xml.substring(0, 1000))
    throw new Error('Invalid SAML metadata: missing IdP certificate (X509Certificate not found)')
  }

  const idpSsoTargetUrl = idpSsoMatch[1]
  console.log('[SAML] IdP SSO URL:', idpSsoTargetUrl)
  
  // Extract ALL certificates and format them properly
  const idpCerts = certMatches.map(match => {
    const certContent = match[1].replace(/\s+/g, '').trim()
    return `-----BEGIN CERTIFICATE-----\n${certContent}\n-----END CERTIFICATE-----`
  })
  
  // Remove duplicates
  const uniqueCerts = [...new Set(idpCerts)]
  console.log(`[SAML] Found ${certMatches.length} certificates, ${uniqueCerts.length} unique`)
  
  // Log first 50 chars of each unique cert for debugging
  uniqueCerts.forEach((cert, i) => {
    const certBody = cert.replace('-----BEGIN CERTIFICATE-----\n', '').substring(0, 50)
    console.log(`[SAML] Cert ${i + 1}: ${certBody}...`)
  })

  return {
    idpSsoTargetUrl,
    idpCert: uniqueCerts.length === 1 ? uniqueCerts[0] : uniqueCerts
  }
}

async function createSamlStartegy() {
  console.log('[SAML] Initializing SAML Strategy...')
  console.log('[SAML] Node version:', process.version)
  console.log('[SAML] OpenSSL version:', process.versions.openssl)
  
  const metadata = await fetchMetadata(config.idpMetadataUrl)
  console.log('[SAML] Identity Provider metadata parsed successfully')
  
  // Build callback URL
  const callbackUrl = `https://${config.host}/login/callback`
  console.log('[SAML] Callback URL:', callbackUrl)
  console.log('[SAML] Issuer:', config.issuer)
  
  // Note: We're NOT using a private key for signing requests
  // The app worked for years without one - MoE doesn't require signed AuthnRequests
  console.log('[SAML] Request signing: DISABLED (not required by IdP)')

  const strategyOptions = {
    callbackUrl: callbackUrl,
    entryPoint: metadata.idpSsoTargetUrl,
    issuer: config.issuer,
    idpCert: metadata.idpCert,  // For validating IdP signatures (can be string or array)
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
    validateInResponseTo: 'never',
    disableRequestedAuthnContext: true,
    wantAssertionsSigned: true,  // We want to validate IdP's signature
    wantAuthnResponseSigned: false,  // Response itself may not be signed, just assertions
    passReqToCallback: true,
    additionalParams: { 'RelayState': 'default' }
  }
  
  console.log('[SAML] Strategy options:', JSON.stringify({
    ...strategyOptions,
    idpCert: Array.isArray(strategyOptions.idpCert) 
      ? `[${strategyOptions.idpCert.length} certificates]` 
      : '[1 certificate]'
  }, null, 2))

  return new SamlStrategy(strategyOptions, (req, profile, done) => {
    console.log('[SAML] Login callback received!')
    console.log('[SAML] Profile keys:', Object.keys(profile || {}))
    
    const user = {
      displayName: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/displayname'],
      id: profile['http://schemas.education.gov.il/ws/2015/01/identity/claims/zehut'],
      mosad: profile['http://schemas.education.gov.il/ws/2015/01/identity/claims/orgrolesyeshuyot'],
      mosad_2: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/shibutznosaf'],
      mosad_3: profile['http://schemas.education.gov.il/ws/2015/01/identity/claims/studentmosad'],
      isStudent: profile['http://schemas.education.gov.il/ws/2015/01/identity/claims/isstudent'] === 'Yes',
      kita: profile['http://schemas.education.gov.il/ws/2015/01/identity/claims/studentkita']
    }
    console.log('[SAML] User parsed:', JSON.stringify(user, null, 2))

    return done(null, user)
  })
}

module.exports = createSamlStartegy
