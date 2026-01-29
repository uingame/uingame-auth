// Polyfill fetch for Node 16
require('./fetch-polyfill')

const fs = require('fs')
const path = require('path')
const { Strategy: SamlStrategy } = require('@node-saml/passport-saml')
const config = require('./config')

/**
 * Fetches and parses SAML IdP metadata XML
 */
async function fetchMetadata(metadataUrl) {
  console.log('Fetching Identity Provider metadata from:', metadataUrl)
  
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
  
  // Parse XML to extract IdP SSO URL and certificate
  // Handle namespaced XML (md:, ds: prefixes)
  // Look for SingleSignOnService with HTTP-POST binding (preferred) or HTTP-Redirect
  const idpSsoMatch = xml.match(/<md:SingleSignOnService[^>]*Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"[^>]*Location="([^"]+)"/i) ||
                      xml.match(/<md:SingleSignOnService[^>]*Location="([^"]+)"/i) ||
                      xml.match(/<[^:]*:SingleSignOnService[^>]*Location="([^"]+)"/i)
  
  // Look for X509Certificate (can be in ds: namespace or without)
  const certMatch = xml.match(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/i) ||
                    xml.match(/<[^:]*:X509Certificate>([^<]+)<\/[^:]*:X509Certificate>/i) ||
                    xml.match(/<X509Certificate>([^<]+)<\/X509Certificate>/i)
  
  if (!idpSsoMatch) {
    console.error('XML snippet:', xml.substring(0, 500))
    throw new Error('Invalid SAML metadata: missing IdP SSO URL (SingleSignOnService not found)')
  }
  
  if (!certMatch) {
    console.error('XML snippet:', xml.substring(0, 500))
    throw new Error('Invalid SAML metadata: missing IdP certificate (X509Certificate not found)')
  }

  const idpSsoTargetUrl = idpSsoMatch[1]
  // Clean certificate (remove whitespace, newlines) and format properly
  const certContent = certMatch[1].replace(/\s+/g, '').trim()
  const idpCert = `-----BEGIN CERTIFICATE-----\n${certContent}\n-----END CERTIFICATE-----`

  return {
    idpSsoTargetUrl,
    idpCert
  }
}

async function createSamlStartegy() {
  console.log('Getting Identity Provider metadata...')
  const metadata = await fetchMetadata(config.idpMetadataUrl)
  console.log('Identity Provider metadata parsed sucessfully')
  // Build callback URL (required by @node-saml/passport-saml)
  const callbackUrl = `https://${config.host}/login/callback`

  // Try to validate private key, skip signing if invalid
  let privateKeyOptions = {}
  if (config.privateKey) {
    try {
      const crypto = require('crypto')
      crypto.createPrivateKey(config.privateKey)
      // Key is valid, use it for signing
      privateKeyOptions = {
        privateKey: config.privateKey,
        decryptionPvk: config.privateKey,
        signatureAlgorithm: 'sha256'
      }
      console.log('[SAML] Private key is valid, signing enabled')
    } catch (err) {
      console.warn('[SAML] Private key is invalid, signing DISABLED:', err.message)
      console.warn('[SAML] Continuing without request signing (less secure)')
    }
  } else {
    console.warn('[SAML] No private key configured, signing disabled')
  }

  return new SamlStrategy({
    callbackUrl: callbackUrl,
    entryPoint: metadata.idpSsoTargetUrl,
    issuer: config.issuer,
    idpCert: metadata.idpCert,  // Required by @node-saml/passport-saml
    ...privateKeyOptions,  // Only include key options if key is valid
    wantAuthnRequestsSigned: false,  // Don't require signed requests
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
    validateInResponseTo: 'never',  // Changed from false to 'never' (new API requires string)
    disableRequestedAuthnContext: true,
    passReqToCallback: true,
    additionalParams: {'RelayState': 'default'}
  }, (req, profile, done,) => {
    const user = {
      displayName: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/displayname'],
      id: profile['http://schemas.education.gov.il/ws/2015/01/identity/claims/zehut'],
      mosad: profile['http://schemas.education.gov.il/ws/2015/01/identity/claims/orgrolesyeshuyot'],
      mosad_2: profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/shibutznosaf'],
      mosad_3: profile['http://schemas.education.gov.il/ws/2015/01/identity/claims/studentmosad'],
      isStudent: profile['http://schemas.education.gov.il/ws/2015/01/identity/claims/isstudent'] === 'Yes',
      kita: profile['http://schemas.education.gov.il/ws/2015/01/identity/claims/studentkita']
    }
    console.log(`Logged in 2: ${JSON.stringify(user, ' ', 2)}`)


    return done(null, user)
  })
}

module.exports = createSamlStartegy
