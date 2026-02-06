/**
 * JWT Utilities for Session Management
 *
 * This file provides functions for creating, verifying, and decoding JWTs
 * using a Cloudflare Workers-compatible JWT library.
 */

/**
 * JWT Payload Interface
 */
export interface JWTPayload {
  user_id: number
  email: string
  display_name: string
  avatar_url?: string
  oauth_provider: string
  iat: number  // Issued at (seconds since epoch)
  exp: number  // Expiration (seconds since epoch)
}

/**
 * Generate a JWT token for a user
 * @param user - User data to encode in the token
 * @param secret - JWT signing secret
 * @param expiresInSeconds - Token expiration time in seconds (default: 30 days)
 * @returns JWT token string
 */
export async function generateJWT(
  user: {
    id: number
    email: string
    display_name: string
    avatar_url?: string
    oauth_provider: string
  },
  secret: string,
  expiresInSeconds: number = 30 * 24 * 60 * 60 // 30 days
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const payload: JWTPayload = {
    user_id: user.id,
    email: user.email,
    display_name: user.display_name || '',
    avatar_url: user.avatar_url,
    oauth_provider: user.oauth_provider,
    iat: now,
    exp: now + expiresInSeconds
  }

  // Use Web Crypto API to create JWT (Cloudflare Workers compatible)
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))

  const signature = await sign(`${encodedHeader}.${encodedPayload}`, secret)

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

/**
 * Verify and decode a JWT token
 * @param token - JWT token to verify
 * @param secret - JWT signing secret
 * @returns Decoded payload if valid, null if invalid
 */
export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const [encodedHeader, encodedPayload, signature] = parts

    // Verify signature
    const expectedSignature = await sign(`${encodedHeader}.${encodedPayload}`, secret)
    if (signature !== expectedSignature) {
      return null
    }

    // Decode payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JWTPayload

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return null
    }

    return payload
  } catch (error) {
    console.error('JWT verification error:', error)
    return null
  }
}

/**
 * Decode a JWT token without verification (use for debugging only)
 * @param token - JWT token to decode
 * @returns Decoded payload or null
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const payload = JSON.parse(base64UrlDecode(parts[1])) as JWTPayload
    return payload
  } catch (error) {
    return null
  }
}

/**
 * Create HMAC-SHA256 signature using Web Crypto API
 * @param data - Data to sign
 * @param secret - Signing secret
 * @returns Base64-URL encoded signature
 */
async function sign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(data)

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', key, messageData)

  return base64UrlEncode(signature)
}

/**
 * Base64-URL encode a string or ArrayBuffer
 * @param input - String or ArrayBuffer to encode
 * @returns Base64-URL encoded string
 */
function base64UrlEncode(input: string | ArrayBuffer): string {
  let base64: string

  if (typeof input === 'string') {
    base64 = btoa(input)
  } else {
    const bytes = new Uint8Array(input)
    const binaryString = Array.from(bytes)
      .map(byte => String.fromCharCode(byte))
      .join('')
    base64 = btoa(binaryString)
  }

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Base64-URL decode to string
 * @param input - Base64-URL encoded string
 * @returns Decoded string
 */
function base64UrlDecode(input: string): string {
  // Replace URL-safe characters
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/')

  // Add padding if needed
  while (base64.length % 4 !== 0) {
    base64 += '='
  }

  return atob(base64)
}

/**
 * Check if a JWT token is expired
 * @param token - JWT token to check
 * @returns true if expired, false otherwise
 */
export function isJWTExpired(token: string): boolean {
  const payload = decodeJWT(token)
  if (!payload || !payload.exp) {
    return true
  }

  const now = Math.floor(Date.now() / 1000)
  return payload.exp < now
}
