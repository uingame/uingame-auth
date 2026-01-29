// Polyfill fetch for Node 16.x
// Node 16 doesn't have native fetch, so we use node-fetch
// This file is imported at the top of files that need fetch

if (!globalThis.fetch) {
  const fetch = require('node-fetch')
  globalThis.fetch = fetch
  globalThis.Headers = fetch.Headers
  globalThis.Request = fetch.Request
  globalThis.Response = fetch.Response
}

module.exports = globalThis.fetch
