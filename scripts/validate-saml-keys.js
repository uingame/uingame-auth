#!/usr/bin/env node
/**
 * SAML Key Validation Script
 * Run: node scripts/validate-saml-keys.js
 * Or on Heroku: heroku run node scripts/validate-saml-keys.js --app uingame-auth
 */

const crypto = require('crypto')

console.log('='.repeat(60))
console.log('SAML Key Validation')
console.log('='.repeat(60))
console.log('')

// Get raw values
const rawPrivateKey = process.env.SAML_PRIVATE_KEY
const rawCert = process.env.SAML_CERT

// Check if variables exist
console.log('1. Environment Variables Present:')
console.log('   SAML_PRIVATE_KEY:', rawPrivateKey ? `YES (${rawPrivateKey.length} chars)` : 'NO')
console.log('   SAML_CERT:', rawCert ? `YES (${rawCert.length} chars)` : 'NO')
console.log('')

if (!rawPrivateKey || !rawCert) {
  console.error('ERROR: Missing environment variables')
  process.exit(1)
}

// Normalize newlines
const privateKey = rawPrivateKey.replace(/\\n/g, '\n')
const cert = rawCert.replace(/\\n/g, '\n')

// Check headers
console.log('2. Key Format Check:')
console.log('   Private Key Header:', privateKey.split('\n')[0])
console.log('   Private Key Footer:', privateKey.split('\n').filter(l => l.trim()).pop())
console.log('   Cert Header:', cert.split('\n')[0])
console.log('   Cert Footer:', cert.split('\n').filter(l => l.trim()).pop())
console.log('')

// Check if they're the same (the bug we found)
const pkBody = privateKey.replace(/-----.*-----/g, '').replace(/\s/g, '')
const certBody = cert.replace(/-----.*-----/g, '').replace(/\s/g, '')
if (pkBody === certBody) {
  console.error('ERROR: SAML_PRIVATE_KEY and SAML_CERT contain IDENTICAL data!')
  console.error('       The private key variable likely contains a certificate, not a key.')
  console.error('       You need to obtain the actual private key.')
  process.exit(1)
}
console.log('3. Content Check: Private key and cert are DIFFERENT (good)')
console.log('')

// Validate private key
console.log('4. Validating Private Key...')
try {
  const keyObject = crypto.createPrivateKey(privateKey)
  console.log('   ✅ Private key is VALID')
  console.log('   Type:', keyObject.asymmetricKeyType)
  console.log('   Details:', keyObject.asymmetricKeyDetails)
} catch (err) {
  console.error('   ❌ Private key is INVALID')
  console.error('   Error:', err.message)
  if (err.opensslErrorStack) {
    console.error('   OpenSSL Stack:', err.opensslErrorStack.join(' -> '))
  }
}
console.log('')

// Validate certificate
console.log('5. Validating Certificate...')
try {
  const certObject = crypto.createPublicKey(cert)
  console.log('   ✅ Certificate is VALID')
  console.log('   Type:', certObject.asymmetricKeyType)
} catch (err) {
  console.error('   ❌ Certificate is INVALID')
  console.error('   Error:', err.message)
}
console.log('')

// Node version info
console.log('6. Environment Info:')
console.log('   Node Version:', process.version)
console.log('   OpenSSL Version:', process.versions.openssl)
console.log('   Platform:', process.platform)
console.log('')
console.log('='.repeat(60))
