// Polyfill fetch for Node 16
require('./fetch-polyfill')

const { v4: uuidv4 } = require('uuid')
const config = require('./config')
const redis = require('./redis')

const MOE_BASE = 'https://lxp.education.gov.il/xapi/moe'

// Timeout for LRS requests (2 seconds) - prevents blocking user flow if LRS is unreachable
const LRS_TIMEOUT_MS = 2000

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), LRS_TIMEOUT_MS)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return response
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout after ${LRS_TIMEOUT_MS}ms`)
    }
    throw err
  }
}

const VERBS = {
  enter: {
    id: `${MOE_BASE}/verbs/enter`,
    display: { 'en': 'entered', 'he': 'נכנס' }
  },
  exit: {
    id: `${MOE_BASE}/verbs/exit`,
    display: { 'en': 'exited', 'he': 'יצא' }
  }
}

const ACTIVITY_TYPES = {
  lms: `${MOE_BASE}/activities/lms`,
  course: `${MOE_BASE}/activities/course`
}

const IDENTITY_HOME_PAGES = {
  idnumber: `${MOE_BASE}/identity/idnumber`,
  exidentifier: `${MOE_BASE}/identity/exidentifier`
}

const ID_NUMBER_FIELDS = ['idNumber', 'misparZehut', 'id', 'ID', 'zehut', 'nationalId', 'tz']

const EXT_IDENTIFIER_FIELDS = ['studentId', 'teacherId', 'userId', 'email', 'mail']

//
// TOKEN CACHE (in-memory)
//

let cachedToken = null
let hasLoggedUserKeys = false

//
// ACTOR RESOLUTION
//

/**
 * Resolves the actor identifier from the SAML user object.
 * Returns { value, kind } where kind is "idnumber" or "exidentifier".
 * 
 * @param {Object} user - The verified SAML user object
 * @returns {{ value: string, kind: string } | null}
 */
function resolveActorId(user) {
  if (!user || typeof user !== 'object') {
    console.error('[LRS] resolveActorId: invalid user object')
    return null
  }

  // Log user object keys once for debugging
  if (config.lrsLogUserKeys && !hasLoggedUserKeys) {
    console.log('[LRS] User object keys:', Object.keys(user))
    hasLoggedUserKeys = true
  }

  // Check ID number fields first (higher priority)
  for (const field of ID_NUMBER_FIELDS) {
    const value = user[field]
    if (value && typeof value === 'string' && value.trim()) {
      return { value: value.trim(), kind: 'idnumber' }
    }
  }

  // Check external identifier fields
  for (const field of EXT_IDENTIFIER_FIELDS) {
    const value = user[field]
    if (value && typeof value === 'string' && value.trim()) {
      return { value: value.trim(), kind: 'exidentifier' }
    }
  }

  console.warn('[LRS] resolveActorId: no valid identifier found')
  return null
}

/**
 * Builds an xAPI actor object from the resolved user identifier.
 * 
 * @param {Object} user - The verified SAML user object
 * @returns {{ actor: Object, actorId: string, kind: string } | null}
 */
function buildActor(user) {
  const resolved = resolveActorId(user)
  if (!resolved) return null

  return {
    actorId: resolved.value,
    kind: resolved.kind,
    actor: {
      objectType: 'Agent',
      account: {
        homePage: IDENTITY_HOME_PAGES[resolved.kind],
        name: resolved.value
      }
    }
  }
}

//
// OAUTH TOKEN
//

/**
 * Gets a valid OAuth access token, fetching new one if needed.
 * @returns {Promise<string>}
 */
async function getAccessToken() {
  // Return cached token if still valid
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken
  }

  const tokenUrl = `${config.lrsBaseUrl}/auth/oauth/v2/token`

  // Build form data
  const formData = new URLSearchParams()
  formData.append('grant_type', 'client_credentials')
  formData.append('client_id', config.lrsClientId)
  formData.append('client_secret', config.lrsClientSecret)

  // Include scope only if configured
  if (config.lrsScope) {
    formData.append('scope', config.lrsScope)
  }

  const response = await fetchWithTimeout(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OAuth token fetch failed: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  const expiresIn = data.expires_in || 3600
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (expiresIn * 1000) - 60000 // 60s buffer
  }

  console.log('[LRS] ✅ OAuth token fetched successfully, expires in', expiresIn, 's')
  return cachedToken.accessToken
}

/**
 * Clears the cached token (for retry on 401).
 */
function clearTokenCache() {
  cachedToken = null
}

//
// STATEMENT BUILDERS
//

/**
 * Builds the activity object for all statements.
 */
function buildObject() {
  return {
    objectType: 'Activity',
    id: config.lrsActivityId,
    definition: {
      type: ACTIVITY_TYPES.lms,
      name: { 'he': 'UINGame' }
    }
  }
}

/**
 * Builds context with registration and required grouping entries per MoE spec.
 * @param {string} sessionId - The session registration UUID
 * @param {boolean} includeGrouping - Whether to include grouping (required for enter/exit)
 */
function buildContext(sessionId, includeGrouping = true) {
  const context = {
    registration: sessionId
  }

  if (includeGrouping) {
    const grouping = []
    
    // 7a) LMS identity entry (ALWAYS required in every statement)
    grouping.push({
      objectType: 'Activity',
      id: config.lrsActivityId,
      definition: {
        type: ACTIVITY_TYPES.lms,
        name: { 'he': 'UINGame', 'en': 'UINGame', 'ar': 'UINGame' },
        description: { 'he': 'מערכת UINGame', 'en': 'UINGame System', 'ar': 'نظام UINGame' }
      }
    })
    
    // 7b) eCat item entry (REQUIRED in every statement - fail if missing)
    if (!config.lrsEcatItemUri) {
      throw new Error('LRS_ECAT_ITEM_URI is required for MoE compliance - must be set in environment variables')
    }
    grouping.push({
      objectType: 'Activity',
      id: config.lrsEcatItemUri,
      definition: {
        type: ACTIVITY_TYPES.course
      }
    })
    
    console.log('[LRS] Context grouping - LMS:', config.lrsActivityId, 'eCat:', config.lrsEcatItemUri)
    
    context.contextActivities = { grouping }
    
    // 8) Category/domain tagging (if curriculum.json domain IDs available)
    // TODO: Add when curriculum.json domain IDs are provided by MoE
    // Uncomment and configure when domain IDs are available:
    // context.contextActivities.category = [{
    //   objectType: 'Activity',
    //   id: 'https://lxp.education.gov.il/xapi/moe/curriculum/domain/{DOMAIN_ID}',
    //   definition: { type: 'https://lxp.education.gov.il/xapi/moe/activities/domain' }
    // }]
  }

  return context
}

/**
 * Builds an xAPI "enter" statement for connect events.
 */
function buildEnterStatement(actor, sessionId) {
  return {
    id: uuidv4(),
    actor,
    verb: VERBS.enter,
    object: buildObject(),
    context: buildContext(sessionId, true),
    timestamp: new Date().toISOString()
  }
}

/**
 * Builds an xAPI "exit" statement for disconnect events.
 */
function buildExitStatement(actor, sessionId, durationMs) {
  const statement = {
    id: uuidv4(),
    actor,
    verb: VERBS.exit,
    object: buildObject(),
    context: buildContext(sessionId, true),  // Exit also requires grouping per MoE spec
    timestamp: new Date().toISOString()
  }

  // Add duration if available
  if (durationMs && durationMs > 0) {
    statement.result = {
      duration: `PT${Math.floor(durationMs / 1000)}S`
    }
  }

  return statement
}

//
// STATEMENT SENDER
//

/**
 * Sends an xAPI statement to the LRS.
 * Handles 401 with one retry after token refresh.
 * 
 * @param {Object} statement - The xAPI statement
 * @param {boolean} isRetry - Whether this is a retry attempt
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function sendStatement(statement, isRetry = false) {
  try {
    console.log('[LRS] Sending statement to:', `${config.lrsBaseUrl}/xAPI/statements`)
    console.log('[LRS] Statement structure - actor:', statement.actor.account.name, 'verb:', statement.verb.id, 'object:', statement.object.id)
    if (statement.context?.contextActivities?.grouping) {
      const groupingIds = statement.context.contextActivities.grouping.map(g => g.id)
      console.log('[LRS] Context grouping IDs:', groupingIds)
    }
    
    const token = await getAccessToken()
    const statementsUrl = `${config.lrsBaseUrl}/xAPI/statements`

    console.log('[LRS] POST request to LRS:', statementsUrl, 'statement ID:', statement.id, 'verb:', statement.verb.id)
    const response = await fetchWithTimeout(statementsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Experience-API-Version': '1.0.3'
      },
      body: JSON.stringify(statement)
    })

    // Handle 401 with retry
    if (response.status === 401 && !isRetry) {
      console.warn('[LRS] Got 401, refreshing token and retrying')
      clearTokenCache()
      return sendStatement(statement, true)
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`LRS statement send failed: ${response.status} ${errorText}`)
    }

    // Read LRS response body
    const responseText = await response.text()
    let lrsResponse = null
    try {
      lrsResponse = responseText ? JSON.parse(responseText) : null
    } catch (err) {
      console.error('[LRS] Failed to parse LRS response:', err.message)
      lrsResponse = responseText || '(empty)'
    }

    // Success logging for testing
    console.log('========================================')
    console.log('[LRS] ✅ REQUEST TO LRS PASSED SUCCESSFULLY')
    console.log('[LRS]   Statement ID:', statement.id)
    console.log('[LRS]   Verb:', statement.verb.id)
    console.log('[LRS]   Actor:', statement.actor.account.name)
    console.log('[LRS]   HTTP Status:', response.status)
    console.log('[LRS]   LRS URL:', statementsUrl)
    console.log('[LRS]   LRS Response:', JSON.stringify(lrsResponse))
    console.log('========================================')
    
    return { success: true }
  } catch (err) {
    console.error('[LRS] Statement send failed:', statement.id, 'error:', err.message, 'status:', err.statusCode || 'N/A')
    return { success: false, error: err.message }
  }
}

//
// REDIS DEDUPE
//

/**
 * Checks if this actor has a recent connect (dedupe).
 * Returns true if duplicate, false otherwise.
 * On Redis error, returns false (allow send).
 */
async function checkDedupe(actorId) {
  try {
    const key = `LRS:DEDUPE:${actorId}`
    const exists = await redis.get(key)
    return !!exists
  } catch (err) {
    console.warn('[LRS] Dedupe check failed, allowing send:', err.message)
    return false
  }
}

/**
 * Sets dedupe key after successful send.
 * Best-effort, errors logged only.
 */
async function setDedupe(actorId) {
  try {
    const key = `LRS:DEDUPE:${actorId}`
    await redis.set(key, '1')
    await redis.expire(key, config.lrsDedupeTtl)
  } catch (err) {
    console.warn('[LRS] Failed to set dedupe key:', err.message)
  }
}

/**
 * Clears dedupe key on logout.
 * Best-effort, errors logged only.
 */
async function clearDedupe(actorId) {
  try {
    const key = `LRS:DEDUPE:${actorId}`
    await redis.del(key)
  } catch (err) {
    console.warn('[LRS] Failed to clear dedupe key:', err.message)
  }
}

//
// PUBLIC API
//

/**
 * Emits a "connect" (enter) event to the LRS.
 * 
 * @param {Object} user - The verified SAML user object
 * @param {Object} meta - Optional metadata (pageUrl, buttonId, clientTs)
 * @returns {Promise<{ success: boolean, sessionId?: string, actorId?: string, actor?: Object, loginAt?: number, duplicate?: boolean, error?: string }>}
 */
async function emitConnect(user, meta = {}) {
  try {
    console.log('[LRS] emitConnect called, enabled:', config.lrsEnabled, 'baseUrl:', config.lrsBaseUrl)
    
    // Check if LRS is enabled
    if (!config.lrsEnabled) {
      console.log('[LRS] LRS disabled, skipping connect')
      return { success: true, skipped: true }
    }

    // Check if LRS is configured
    if (!config.lrsBaseUrl || !config.lrsClientId) {
      console.log('[LRS] Not configured, skipping connect (baseUrl:', config.lrsBaseUrl, 'clientId:', config.lrsClientId ? 'SET' : 'MISSING', ')')
      return { success: true, skipped: true }
    }

    // Build actor
    const actorData = buildActor(user)
    if (!actorData) {
      return { success: false, error: 'Cannot resolve actor identity' }
    }
    const { actor, actorId } = actorData

    // Check dedupe
    const isDuplicate = await checkDedupe(actorId)
    if (isDuplicate) {
      console.log('[LRS] Duplicate connect detected, skipping:', actorId)
      return { success: true, duplicate: true, actorId }
    }

    // Generate session
    const sessionId = uuidv4()
    const loginAt = Date.now()

    // Build and send statement
    const statement = buildEnterStatement(actor, sessionId)
    console.log('[LRS] Built enter statement:', statement.id, 'for actor:', actorId)
    const result = await sendStatement(statement)

    // Set dedupe key only after successful send
    if (result.success) {
      await setDedupe(actorId)
    }

    const returnValue = {
      success: result.success,
      sessionId,
      actorId,
      actor,
      loginAt,
      error: result.error
    }
    
    console.log('[LRS] emitConnect returning:', JSON.stringify({ success: returnValue.success, sessionId: returnValue.sessionId, actorId: returnValue.actorId, hasActor: !!returnValue.actor }))
    
    return returnValue
  } catch (err) {
    console.error('[LRS] emitConnect failed:', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Emits a "disconnect" (exit) event to the LRS.
 * 
 * @param {Object} sessionData - Session data from cookie { actorId, actor, sessionId, loginAt }
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function emitDisconnect(sessionData) {
  try {
    console.log('[LRS] emitDisconnect called, enabled:', config.lrsEnabled, 'baseUrl:', config.lrsBaseUrl)
    
    // Check if LRS is enabled
    if (!config.lrsEnabled) {
      console.log('[LRS] LRS disabled, skipping disconnect')
      return { success: true, skipped: true }
    }

    // Check if LRS is configured
    if (!config.lrsBaseUrl || !config.lrsClientId) {
      console.log('[LRS] Not configured, skipping disconnect (baseUrl:', config.lrsBaseUrl, 'clientId:', config.lrsClientId ? 'SET' : 'MISSING', ')')
      return { success: true, skipped: true }
    }

    // Validate session data
    if (!sessionData || !sessionData.actor || !sessionData.sessionId) {
      console.warn('[LRS] emitDisconnect: invalid session data')
      return { success: false, error: 'Invalid session data' }
    }

    const { actor, actorId, sessionId, loginAt } = sessionData

    // Compute duration
    const durationMs = loginAt ? Date.now() - loginAt : 0
    const durationSeconds = Math.floor(durationMs / 1000)

    console.log('[LRS] Disconnect details - actorId:', actorId, 'sessionId:', sessionId, 'duration:', durationSeconds, 's')

    // Build and send statement
    const statement = buildExitStatement(actor, sessionId, durationMs)
    console.log('[LRS] Built exit statement:', statement.id, 'for actor:', actorId)
    const result = await sendStatement(statement)

    // Clear dedupe key (best-effort)
    if (actorId) {
      await clearDedupe(actorId)
      console.log('[LRS] Cleared dedupe key for actor:', actorId)
    }

    if (result.success) {
      console.log('[LRS] ✅ Disconnect completed successfully')
    } else {
      console.error('[LRS] ❌ Disconnect failed:', result.error)
    }

    return { success: result.success, error: result.error }
  } catch (err) {
    console.error('[LRS] emitDisconnect failed:', err.message)
    return { success: false, error: err.message }
  }
}

module.exports = {
  emitConnect,
  emitDisconnect
}
