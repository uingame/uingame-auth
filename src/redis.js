const redis = require('redis')
const config = require('./config')

// Parse Redis URL using modern URL API
let redisUrl
try {
  redisUrl = new URL(config.redisUrl)
} catch (err) {
  console.error('Invalid Redis URL:', config.redisUrl)
  throw err
}

console.log('RED URL', config.redisUrl)

// Create Redis client (v4 API)
const client = redis.createClient({
  url: config.redisUrl,
  socket: {
    tls: redisUrl.protocol === 'rediss:',
    rejectUnauthorized: false,
    connectTimeout: 5000, // 5 second timeout for local dev
    reconnectStrategy: (retries) => {
      if (retries > 3) {
        console.error('Redis: Max reconnection attempts reached')
        return new Error('Redis connection failed after max retries')
      }
      return Math.min(retries * 100, 3000) // Exponential backoff, max 3s
    }
  }
})

let isConnected = false

client.on('connect', () => {
  console.log('-->> REDIS CONNECTED')
  isConnected = true
})

client.on('error', (err) => {
  console.error('Error in redis client:', err.message)
  isConnected = false
})

client.on('reconnecting', () => {
  console.log('Redis reconnecting...')
})

client.on('ready', () => {
  console.log('Redis ready')
  isConnected = true
})

// Connect to Redis (required in v4)
// Don't throw on connection failure - allow app to start without Redis in dev
client.connect().catch(err => {
  console.error('Redis connection failed:', err.message)
  console.warn('App will continue but Redis operations will fail')
  isConnected = false
})

// Wrapper functions that handle connection errors gracefully
async function safeRedisOp(operation, key, ...args) {
  if (!isConnected) {
    throw new Error('Redis not connected')
  }
  try {
    return await operation(key, ...args)
  } catch (err) {
    // If connection lost, mark as disconnected
    if (err.message.includes('Connection') || err.message.includes('closed')) {
      isConnected = false
    }
    throw err
  }
}

// Export promisified commands (v4 methods are already async)
// Wrapped to handle connection errors gracefully
module.exports = {
  get: (key) => safeRedisOp(client.get.bind(client), key),
  set: (key, value) => safeRedisOp(client.set.bind(client), key, value),
  expire: (key, seconds) => safeRedisOp(client.expire.bind(client), key, seconds),
  del: (key) => safeRedisOp(client.del.bind(client), key),
  isConnected: () => isConnected
}
