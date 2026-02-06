/**
 * Authentication Middleware
 *
 * This middleware verifies JWT tokens from cookies and attaches user information
 * to the request context for protected routes.
 */

import { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { verifyJWT, JWTPayload } from '../utils/jwt'

/**
 * Authentication middleware for protected routes
 * Verifies JWT token from cookie and attaches user to context
 *
 * Usage:
 *   app.use('/api/trees/*', authMiddleware)
 *   app.use('/api/nodes/*', authMiddleware)
 *
 * @param c - Hono context
 * @param next - Next middleware function
 * @returns 401 if unauthorized, otherwise proceeds to next middleware
 */
export async function authMiddleware(c: Context, next: Next) {
  // Get token from cookie
  const token = getCookie(c, 'session')

  if (!token) {
    return c.json(
      {
        success: false,
        error: 'Unauthorized: No session token found'
      },
      401
    )
  }

  // Verify token
  const jwtSecret = c.env.JWT_SECRET
  if (!jwtSecret) {
    console.error('JWT_SECRET environment variable is not set')
    return c.json(
      {
        success: false,
        error: 'Server configuration error'
      },
      500
    )
  }

  const payload = await verifyJWT(token, jwtSecret)

  if (!payload) {
    return c.json(
      {
        success: false,
        error: 'Unauthorized: Invalid or expired token'
      },
      401
    )
  }

  // Attach user to context for use in route handlers
  c.set('user', payload)

  await next()
}

/**
 * Optional authentication middleware
 * Attaches user to context if token exists, but doesn't require it
 *
 * Usage:
 *   app.use('/api/public/*', optionalAuthMiddleware)
 *
 * @param c - Hono context
 * @param next - Next middleware function
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  const token = getCookie(c, 'session')

  if (token) {
    const jwtSecret = c.env.JWT_SECRET
    if (jwtSecret) {
      const payload = await verifyJWT(token, jwtSecret)
      if (payload) {
        c.set('user', payload)
      }
    }
  }

  await next()
}

/**
 * Get current user from context
 * Throws error if user is not authenticated
 *
 * @param c - Hono context
 * @returns JWT payload with user information
 * @throws Error if user is not authenticated
 */
export function getCurrentUser(c: Context): JWTPayload {
  const user = c.get('user') as JWTPayload | undefined

  if (!user) {
    throw new Error('User not authenticated')
  }

  return user
}

/**
 * Check if user is authenticated (optional check)
 * Returns null if not authenticated instead of throwing
 *
 * @param c - Hono context
 * @returns JWT payload or null
 */
export function getOptionalUser(c: Context): JWTPayload | null {
  return c.get('user') as JWTPayload | null
}
