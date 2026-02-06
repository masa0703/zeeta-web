import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { setCookie, getCookie } from 'hono/cookie'
import { getOAuthConfig, normalizeGoogleUser, normalizeGitHubUser, OAuthUserInfo } from './config/oauth'
import { generateJWT } from './utils/jwt'
import { upsertOAuthUser, createSession, deleteSession } from './utils/database'
import { authMiddleware, getCurrentUser } from './middleware/auth'
import { getUserTrees, getTreeById, createTree, updateTree, deleteTree, getTreeStats } from './utils/trees'
import {
  canViewTree,
  canEditTree,
  canUpdateTreeMetadata,
  canDeleteTree,
  canManageMembers,
  getTreeMembers,
  addTreeMember,
  removeTreeMember,
  updateMemberRole
} from './utils/permissions'
import {
  createInvitation,
  getInvitationByToken,
  acceptInvitation,
  getTreeInvitations
} from './utils/invitations'
import { sendInvitationEmail } from './services/email'

// ビルド番号のグローバル型定義
declare const __BUILD_NUMBER__: string

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  APP_URL: string
  MAILGUN_API_KEY: string
  MAILGUN_DOMAIN: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

// 静的ファイル配信
app.use('/static/*', serveStatic({ root: './public' }))

// HTMLファイル配信
import loginHtml from '../public/login.html?raw'
import myPageHtml from '../public/my-page.html?raw'
import acceptInvitationHtml from '../public/accept-invitation.html?raw'
import profileHtml from '../public/profile.html?raw'

app.get('/login.html', (c) => c.html(loginHtml))
app.get('/my-page.html', (c) => c.html(myPageHtml))
app.get('/accept-invitation.html', (c) => c.html(acceptInvitationHtml))
app.get('/profile.html', (c) => c.html(profileHtml))

// ===============================
// API Routes
// ===============================

// バージョン情報取得
app.get('/api/version', (c) => {
  return c.json({
    success: true,
    data: {
      buildNumber: __BUILD_NUMBER__,
      version: `build #${__BUILD_NUMBER__}`
    }
  })
})

// ===============================
// Authentication Routes
// ===============================

// Initiate OAuth login flow
app.get('/auth/login/:provider', (c) => {
  const provider = c.req.param('provider') as 'google' | 'github'

  if (provider !== 'google' && provider !== 'github') {
    return c.json({ success: false, error: 'Invalid provider' }, 400)
  }

  const config = getOAuthConfig(c.env)[provider]

  // Generate CSRF state token
  const state = crypto.randomUUID()

  // Store state in cookie (10 minutes expiration)
  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 600,
    path: '/'
  })

  // Store redirect URL if provided (for returning after login)
  const redirectUrl = c.req.query('redirect')
  if (redirectUrl) {
    setCookie(c, 'oauth_redirect', redirectUrl, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 600,
      path: '/'
    })
  }

  // Build authorization URL
  const authUrl = new URL(config.authUrl)
  authUrl.searchParams.set('client_id', config.clientId)
  authUrl.searchParams.set('redirect_uri', config.redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', config.scope)
  authUrl.searchParams.set('state', state)

  // Redirect to OAuth provider
  return c.redirect(authUrl.toString())
})

// Handle OAuth callback
app.get('/auth/callback/:provider', async (c) => {
  try {
    const provider = c.req.param('provider') as 'google' | 'github'

    if (provider !== 'google' && provider !== 'github') {
      return c.json({ success: false, error: 'Invalid provider' }, 400)
    }

    const code = c.req.query('code')
    const state = c.req.query('state')
    const savedState = getCookie(c, 'oauth_state')

    // Validate state (CSRF protection)
    if (!state || !savedState || state !== savedState) {
      return c.json({ success: false, error: 'Invalid state parameter' }, 400)
    }

    if (!code) {
      return c.json({ success: false, error: 'No authorization code provided' }, 400)
    }

    const config = getOAuthConfig(c.env)[provider]

    // Exchange code for access token
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code'
      })
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token exchange failed:', errorText)
      return c.json({ success: false, error: 'Failed to exchange authorization code' }, 500)
    }

    const tokenData = await tokenResponse.json() as any
    const accessToken = tokenData.access_token

    if (!accessToken) {
      return c.json({ success: false, error: 'No access token received' }, 500)
    }

    // Fetch user info from OAuth provider
    const userResponse = await fetch(config.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    })

    if (!userResponse.ok) {
      return c.json({ success: false, error: 'Failed to fetch user information' }, 500)
    }

    const userInfo = await userResponse.json() as any

    // Normalize user info based on provider
    let oauthUser: OAuthUserInfo
    if (provider === 'google') {
      oauthUser = normalizeGoogleUser(userInfo)
    } else {
      oauthUser = normalizeGitHubUser(userInfo)
    }

    // Create or update user in database
    const user = await upsertOAuthUser(c.env.DB, oauthUser)

    // Generate JWT
    const token = await generateJWT(
      {
        id: user.id,
        email: user.email,
        display_name: user.display_name || '',
        avatar_url: user.avatar_url || undefined,
        oauth_provider: user.oauth_provider
      },
      c.env.JWT_SECRET
    )

    // Create session record
    await createSession(c.env.DB, user.id, token, 30 * 24 * 60 * 60) // 30 days

    // Set session cookie
    setCookie(c, 'session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/'
    })

    // Get redirect URL if stored (for invitation flow etc.)
    const redirectUrl = getCookie(c, 'oauth_redirect')

    // Clear OAuth cookies
    setCookie(c, 'oauth_state', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 0,
      path: '/'
    })
    setCookie(c, 'oauth_redirect', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 0,
      path: '/'
    })

    // Redirect to stored URL or My Page
    return c.redirect(redirectUrl || '/my-page.html')
  } catch (error) {
    console.error('OAuth callback error:', error)
    return c.json({ success: false, error: 'Authentication failed' }, 500)
  }
})

// Logout
app.post('/auth/logout', async (c) => {
  const token = getCookie(c, 'session')

  if (token) {
    // Delete session from database
    await deleteSession(c.env.DB, token)
  }

  // Clear session cookie
  c.header('Set-Cookie', 'session=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/')

  return c.json({ success: true })
})

// Get current user info
app.get('/auth/me', authMiddleware, async (c) => {
  try {
    const jwtUser = getCurrentUser(c)

    // Fetch latest user data from database
    const user = await c.env.DB
      .prepare('SELECT id, email, display_name, avatar_url, oauth_provider FROM users WHERE id = ?')
      .bind(jwtUser.user_id)
      .first()

    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        oauth_provider: user.oauth_provider
      }
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================
// Profile Management APIs
// ============================================

// Get user profile
app.get('/api/profile', authMiddleware, async (c) => {
  try {
    const jwtUser = getCurrentUser(c)

    // Fetch latest user data from database
    const user = await c.env.DB
      .prepare('SELECT id, email, display_name, avatar_url, oauth_provider FROM users WHERE id = ?')
      .bind(jwtUser.user_id)
      .first()

    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404)
    }

    return c.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        oauth_provider: user.oauth_provider
      }
    })
  } catch (error) {
    console.error('Failed to get profile:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Update user profile
app.put('/api/profile', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const body = await c.req.json()
    const { display_name } = body

    // Validate display_name
    if (display_name !== undefined) {
      if (typeof display_name !== 'string') {
        return c.json({ success: false, error: 'Display name must be a string' }, 400)
      }
      if (display_name.trim().length === 0) {
        return c.json({ success: false, error: 'Display name cannot be empty' }, 400)
      }
      if (display_name.length > 100) {
        return c.json({ success: false, error: 'Display name must be 100 characters or less' }, 400)
      }
    }

    // Update display_name
    const updatedUser = await c.env.DB
      .prepare(`
        UPDATE users
        SET display_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        RETURNING id, email, display_name, avatar_url, oauth_provider
      `)
      .bind(display_name.trim(), user.user_id)
      .first()

    if (!updatedUser) {
      return c.json({ success: false, error: 'Failed to update profile' }, 500)
    }

    return c.json({
      success: true,
      data: updatedUser
    })
  } catch (error) {
    console.error('Failed to update profile:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ===============================
// Test-Only Endpoints (Development/Test Environment Only)
// ===============================

// Test-only endpoint for E2E testing (skip OAuth)
app.get('/auth/test-login', async (c) => {
  // Only allow in development/test
  const appUrl = c.env.APP_URL || ''
  if (!appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')) {
    return c.json({ success: false, error: 'Test login only available in development' }, 403)
  }

  try {
    const userId = c.req.query('user_id') || '1'
    const testUserId = parseInt(userId)
    const providerId = `test-${testUserId}`

    // Get or create test user by oauth_provider and oauth_provider_id
    let user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE oauth_provider = ? AND oauth_provider_id = ?'
    ).bind('test', providerId).first()

    if (user) {
      // Update last_login_at for existing user
      await c.env.DB.prepare(
        'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(user.id).run()

      // Delete old sessions for this user
      await c.env.DB.prepare(
        'DELETE FROM sessions WHERE user_id = ?'
      ).bind(user.id).run()
    } else {
      // Create test user with explicit ID for testing consistency
      try {
        user = await c.env.DB.prepare(
          `INSERT INTO users (id, oauth_provider, oauth_provider_id, email, display_name, avatar_url, last_login_at)
           VALUES (?, 'test', ?, ?, ?, NULL, CURRENT_TIMESTAMP)
           RETURNING *`
        )
          .bind(testUserId, providerId, `test-user-${testUserId}@example.com`, `Test User ${testUserId}`)
          .first()
      } catch (insertError) {
        // If ID already exists, check if user exists with different provider_id
        console.warn('Failed to insert with explicit ID:', insertError)
        user = await c.env.DB.prepare(
          'SELECT * FROM users WHERE oauth_provider = ? AND oauth_provider_id = ?'
        ).bind('test', providerId).first()

        if (!user) {
          // Try insert without explicit ID as last resort
          user = await c.env.DB.prepare(
            `INSERT INTO users (oauth_provider, oauth_provider_id, email, display_name, avatar_url, last_login_at)
             VALUES ('test', ?, ?, ?, NULL, CURRENT_TIMESTAMP)
             RETURNING *`
          )
            .bind(providerId, `test-user-${testUserId}@example.com`, `Test User ${testUserId}`)
            .first()
        }
      }
    }

    if (!user) {
      return c.json({ success: false, error: 'Failed to create test user' }, 500)
    }

    // Generate JWT
    const token = await generateJWT(
      {
        id: user.id,
        email: user.email,
        display_name: user.display_name || '',
        avatar_url: user.avatar_url || undefined,
        oauth_provider: user.oauth_provider
      },
      c.env.JWT_SECRET
    )

    // Create session record
    await createSession(c.env.DB, user.id, token, 30 * 24 * 60 * 60)

    // Set session cookie
    setCookie(c, 'session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/'
    })

    return c.redirect('/my-page.html')
  } catch (error) {
    console.error('Test login error:', error)
    return c.json({ success: false, error: 'Test login failed' }, 500)
  }
})

// Test-only endpoint to clear all data
app.delete('/api/test/clear', async (c) => {
  // Only allow in development/test
  const appUrl = c.env.APP_URL || ''
  if (!appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')) {
    return c.json({ success: false, error: 'Clear data only available in development' }, 403)
  }

  try {
    // Delete in reverse order of dependencies
    await c.env.DB.prepare('DELETE FROM node_relations').run()
    await c.env.DB.prepare('DELETE FROM nodes').run()
    await c.env.DB.prepare('DELETE FROM sessions').run()
    await c.env.DB.prepare('DELETE FROM invitations').run()
    await c.env.DB.prepare('DELETE FROM notifications').run()
    await c.env.DB.prepare('DELETE FROM tree_members').run()
    await c.env.DB.prepare('DELETE FROM trees').run()
    await c.env.DB.prepare('DELETE FROM users').run()

    return c.json({ success: true, message: 'All test data cleared' })
  } catch (error) {
    console.error('Clear data error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ===============================
// Tree Management API Routes
// ===============================

// Get all trees accessible by the current user
app.get('/api/trees', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const trees = await getUserTrees(c.env.DB, user.user_id)

    return c.json({
      success: true,
      data: trees
    })
  } catch (error) {
    console.error('Failed to get trees:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Create a new tree
app.post('/api/trees', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const body = await c.req.json()

    const { name, description } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return c.json({ success: false, error: 'Tree name is required' }, 400)
    }

    const tree = await createTree(
      c.env.DB,
      name.trim(),
      description || null,
      user.user_id
    )

    return c.json({
      success: true,
      data: tree
    }, 201)
  } catch (error) {
    console.error('Failed to create tree:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ===============================
// Tree Member Management API Routes
// (Must be defined before /api/trees/:id to avoid route conflicts)
// ===============================

// Get all members of a tree
app.get('/api/trees/:id/members', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Check if user has access to this tree
    const hasAccess = await canViewTree(c.env.DB, treeId, user.user_id)
    if (!hasAccess) {
      return c.json({ success: false, error: 'Access denied' }, 403)
    }

    const members = await getTreeMembers(c.env.DB, treeId)

    return c.json({
      success: true,
      data: members
    })
  } catch (error) {
    console.error('Failed to get tree members:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Add a member to a tree
app.post('/api/trees/:id/members', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Check if user can manage members (owner or editor)
    const canManage = await canManageMembers(c.env.DB, treeId, user.user_id)
    if (!canManage) {
      return c.json({ success: false, error: 'You do not have permission to manage members' }, 403)
    }

    // Parse request body
    const body = await c.req.json()
    const { user_id, role } = body

    if (!user_id || !role) {
      return c.json({ success: false, error: 'user_id and role are required' }, 400)
    }

    const targetUserId = parseInt(user_id)
    if (isNaN(targetUserId)) {
      return c.json({ success: false, error: 'Invalid user_id' }, 400)
    }

    if (role !== 'owner' && role !== 'editor' && role !== 'viewer') {
      return c.json({ success: false, error: 'Invalid role. Must be owner, editor, or viewer' }, 400)
    }

    // Check if user exists
    const targetUser = await c.env.DB
      .prepare('SELECT id FROM users WHERE id = ?')
      .bind(targetUserId)
      .first()

    if (!targetUser) {
      return c.json({ success: false, error: 'User not found' }, 404)
    }

    // Check if user is already a member
    const existingMember = await c.env.DB
      .prepare('SELECT id FROM tree_members WHERE tree_id = ? AND user_id = ?')
      .bind(treeId, targetUserId)
      .first()

    if (existingMember) {
      return c.json({ success: false, error: 'User is already a member of this tree' }, 400)
    }

    // Add member
    await addTreeMember(c.env.DB, treeId, targetUserId, role, user.user_id)

    return c.json({
      success: true,
      message: 'Member added successfully'
    })
  } catch (error) {
    console.error('Failed to add member:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Remove a member from a tree
app.delete('/api/trees/:id/members/:userId', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('id'))
    const targetUserId = parseInt(c.req.param('userId'))

    if (isNaN(treeId) || isNaN(targetUserId)) {
      return c.json({ success: false, error: 'Invalid tree ID or user ID' }, 400)
    }

    // Check if user can manage members
    const canManage = await canManageMembers(c.env.DB, treeId, user.user_id)
    if (!canManage) {
      return c.json({ success: false, error: 'You do not have permission to manage members' }, 403)
    }

    // Cannot remove the owner
    const tree = await getTreeById(c.env.DB, treeId)
    if (!tree) {
      return c.json({ success: false, error: 'Tree not found' }, 404)
    }

    if (targetUserId === tree.owner_user_id) {
      return c.json({ success: false, error: 'Cannot remove the owner from the tree' }, 400)
    }

    await removeTreeMember(c.env.DB, treeId, targetUserId)

    return c.json({
      success: true,
      message: 'Member removed successfully'
    })
  } catch (error) {
    console.error('Failed to remove member:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Update a member's role
app.put('/api/trees/:id/members/:userId/role', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('id'))
    const targetUserId = parseInt(c.req.param('userId'))

    if (isNaN(treeId) || isNaN(targetUserId)) {
      return c.json({ success: false, error: 'Invalid tree ID or user ID' }, 400)
    }

    // Only owner can change roles
    const isOwner = await canUpdateTreeMetadata(c.env.DB, treeId, user.user_id)
    if (!isOwner) {
      return c.json({ success: false, error: 'Only the owner can change member roles' }, 403)
    }

    const body = await c.req.json()
    const { role } = body

    if (!role || !['owner', 'editor', 'viewer'].includes(role)) {
      return c.json({ success: false, error: 'Invalid role. Must be owner, editor, or viewer' }, 400)
    }

    // Cannot change the owner's role
    const tree = await getTreeById(c.env.DB, treeId)
    if (!tree) {
      return c.json({ success: false, error: 'Tree not found' }, 404)
    }

    if (targetUserId === tree.owner_user_id && role !== 'owner') {
      return c.json({ success: false, error: 'Cannot change the owner\'s role' }, 400)
    }

    await updateMemberRole(c.env.DB, treeId, targetUserId, role)

    return c.json({
      success: true,
      message: 'Member role updated successfully'
    })
  } catch (error) {
    console.error('Failed to update member role:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ===============================
// Invitation Routes
// ===============================

// Create an invitation to a tree
app.post('/api/trees/:id/invitations', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Only owner and editors can invite
    const canInvite = await canManageMembers(c.env.DB, treeId, user.user_id)
    if (!canInvite) {
      return c.json({ success: false, error: 'Permission denied. Only owner and editors can invite members' }, 403)
    }

    const body = await c.req.json()
    const { email, role } = body

    if (!email || typeof email !== 'string') {
      return c.json({ success: false, error: 'Invalid email address' }, 400)
    }

    if (!role || !['editor', 'viewer'].includes(role)) {
      return c.json({ success: false, error: 'Invalid role. Must be editor or viewer' }, 400)
    }

    // Check if user with this email already exists and is a member
    const existingUser = await c.env.DB
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first<{ id: number }>()

    if (existingUser) {
      const existingMember = await c.env.DB
        .prepare('SELECT id FROM tree_members WHERE tree_id = ? AND user_id = ?')
        .bind(treeId, existingUser.id)
        .first()

      if (existingMember) {
        return c.json({ success: false, error: 'User is already a member of this tree' }, 400)
      }
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await c.env.DB
      .prepare(
        `SELECT id FROM invitations
         WHERE tree_id = ? AND invitee_email = ? AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP`
      )
      .bind(treeId, email)
      .first()

    if (existingInvitation) {
      return c.json({ success: false, error: 'An active invitation already exists for this email' }, 400)
    }

    // Create invitation
    const invitation = await createInvitation(c.env.DB, treeId, user.user_id, email, role as 'editor' | 'viewer')

    // Get tree and inviter information for email
    const tree = await getTreeById(c.env.DB, treeId)
    const inviter = await c.env.DB
      .prepare('SELECT display_name, email FROM users WHERE id = ?')
      .bind(user.user_id)
      .first<{ display_name: string; email: string }>()

    if (!tree || !inviter) {
      // Invitation created but email couldn't be sent
      return c.json({
        success: true,
        data: {
          id: invitation.id,
          token: invitation.token,
          email,
          role,
          message: 'Invitation created but email could not be sent'
        }
      }, 201)
    }

    // Get invitation details to retrieve expires_at
    const invitationDetails = await getInvitationByToken(c.env.DB, invitation.token)

    // Send invitation email (synchronous to ensure logging)
    if (!c.env.MAILGUN_API_KEY || !c.env.MAILGUN_DOMAIN) {
      console.warn('⚠️  MAILGUN_API_KEY or MAILGUN_DOMAIN not configured. Invitation email will NOT be sent.')
      console.log('📧 Would send invitation email to:', email)
    } else if (!invitationDetails) {
      console.error('❌ Invitation details not found. Email cannot be sent.')
    } else {
      console.log('📧 Sending invitation email to:', email)
      try {
        const emailResult = await sendInvitationEmail(
          { apiKey: c.env.MAILGUN_API_KEY, domain: c.env.MAILGUN_DOMAIN },
          {
            to: email,
            inviterName: inviter.display_name || inviter.email,
            treeName: tree.name,
            role: role as 'editor' | 'viewer',
            token: invitation.token,
            appUrl: c.env.APP_URL,
            expiresAt: invitationDetails.expires_at
          }
        )

        if (emailResult.success) {
          console.log('✅ Invitation email sent successfully to:', email)
          console.log('   Email ID:', emailResult.id)
        } else {
          console.error('❌ Failed to send invitation email:', emailResult.error)
        }
      } catch (error) {
        console.error('❌ Exception while sending invitation email:', error)
        // Don't fail the API call if email fails
      }
    }

    // Create notification if invitee is an existing user
    if (existingUser) {
      await createNotification(
        c.env.DB,
        existingUser.id,
        'invitation',
        'ツリーへの招待',
        `${inviter.display_name || inviter.email} さんがあなたを「${tree.name}」ツリーに招待しました`,
        `/accept-invitation.html?token=${invitation.token}`
      )
    }

    return c.json({
      success: true,
      data: {
        id: invitation.id,
        token: invitation.token,
        email,
        role,
        message: 'Invitation created successfully'
      }
    }, 201)
  } catch (error) {
    console.error('Failed to create invitation:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get invitation details by token (public, no auth required)
app.get('/api/invitations/:token', async (c) => {
  try {
    const token = c.req.param('token')

    if (!token) {
      return c.json({ success: false, error: 'Invalid token' }, 400)
    }

    const invitation = await getInvitationByToken(c.env.DB, token)

    if (!invitation) {
      return c.json({ success: false, error: 'Invitation not found' }, 404)
    }

    // Check if invitation has expired
    const now = new Date()
    const expiresAt = new Date(invitation.expires_at)
    const isExpired = now > expiresAt

    // Check if invitation is still pending
    if (invitation.status !== 'pending') {
      return c.json({ success: false, error: 'Invitation has already been used or cancelled' }, 400)
    }

    if (isExpired) {
      return c.json({ success: false, error: 'Invitation has expired' }, 400)
    }

    return c.json({
      success: true,
      data: {
        tree_name: invitation.tree_name,
        inviter_name: invitation.inviter_name,
        role: invitation.role,
        expires_at: invitation.expires_at,
        invitee_email: invitation.invitee_email
      }
    })
  } catch (error) {
    console.error('Failed to get invitation:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Accept an invitation
app.post('/api/invitations/:token/accept', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const token = c.req.param('token')

    if (!token) {
      return c.json({ success: false, error: 'Invalid token' }, 400)
    }

    // Verify invitation matches user's email
    const invitation = await getInvitationByToken(c.env.DB, token)
    if (!invitation) {
      return c.json({ success: false, error: 'Invitation not found' }, 404)
    }

    // Check if the logged-in user's email matches the invitation email
    const currentUser = await c.env.DB
      .prepare('SELECT email FROM users WHERE id = ?')
      .bind(user.user_id)
      .first<{ email: string }>()

    if (!currentUser || currentUser.email !== invitation.invitee_email) {
      return c.json({
        success: false,
        error: 'This invitation is for a different email address. Please log in with the invited email.'
      }, 403)
    }

    // Accept invitation
    const result = await acceptInvitation(c.env.DB, token, user.user_id)

    // Get tree and user information for notification
    const tree = await getTreeById(c.env.DB, result.treeId)
    const acceptingUser = await c.env.DB
      .prepare('SELECT display_name, email FROM users WHERE id = ?')
      .bind(user.user_id)
      .first<{ display_name: string; email: string }>()

    // Create notification for the inviter
    if (tree && acceptingUser && invitation.inviter_user_id) {
      await createNotification(
        c.env.DB,
        invitation.inviter_user_id,
        'invitation_accepted',
        '招待が受諾されました',
        `${acceptingUser.display_name || acceptingUser.email} さんが「${tree.name}」ツリーへの招待を受諾しました`,
        `/index.html?tree=${result.treeId}`
      )
    }

    return c.json({
      success: true,
      data: {
        tree_id: result.treeId,
        role: result.role,
        message: 'Invitation accepted successfully'
      }
    })
  } catch (error) {
    console.error('Failed to accept invitation:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return c.json({ success: false, error: errorMessage }, 400)
  }
})

// Get all invitations for a tree (owner/editor only)
app.get('/api/trees/:id/invitations', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Only owner and editors can view invitations
    const canView = await canManageMembers(c.env.DB, treeId, user.user_id)
    if (!canView) {
      return c.json({ success: false, error: 'Permission denied' }, 403)
    }

    const invitations = await getTreeInvitations(c.env.DB, treeId)

    return c.json({
      success: true,
      data: invitations
    })
  } catch (error) {
    console.error('Failed to get invitations:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ============================================
// Notification Management APIs
// ============================================

// Get all notifications for the current user
app.get('/api/notifications', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)

    const notifications = await c.env.DB
      .prepare(`
        SELECT id, type, title, message, link, is_read, created_at
        FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 50
      `)
      .bind(user.user_id)
      .all()

    return c.json({
      success: true,
      data: notifications.results || []
    })
  } catch (error) {
    console.error('Failed to get notifications:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Mark a specific notification as read
app.put('/api/notifications/:id/read', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const notificationId = parseInt(c.req.param('id'))

    if (isNaN(notificationId)) {
      return c.json({ success: false, error: 'Invalid notification ID' }, 400)
    }

    // Check if notification belongs to the user
    const notification = await c.env.DB
      .prepare('SELECT user_id FROM notifications WHERE id = ?')
      .bind(notificationId)
      .first<{ user_id: number }>()

    if (!notification) {
      return c.json({ success: false, error: 'Notification not found' }, 404)
    }

    if (notification.user_id !== user.user_id) {
      return c.json({ success: false, error: 'Access denied' }, 403)
    }

    // Mark as read
    await c.env.DB
      .prepare('UPDATE notifications SET is_read = 1 WHERE id = ?')
      .bind(notificationId)
      .run()

    return c.json({
      success: true,
      message: 'Notification marked as read'
    })
  } catch (error) {
    console.error('Failed to mark notification as read:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Mark all notifications as read for the current user
app.put('/api/notifications/read-all', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)

    await c.env.DB
      .prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
      .bind(user.user_id)
      .run()

    return c.json({
      success: true,
      message: 'All notifications marked as read'
    })
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Helper function to create a notification
async function createNotification(
  db: D1Database,
  userId: number,
  type: string,
  title: string,
  message: string,
  link?: string
) {
  await db
    .prepare(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(userId, type, title, message, link || null)
    .run()
}

// Get a specific tree
app.get('/api/trees/:id', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Check if tree exists first (404 before 403)
    const tree = await getTreeById(c.env.DB, treeId)
    if (!tree) {
      return c.json({ success: false, error: 'Tree not found' }, 404)
    }

    // Check if user has access to this tree
    const hasAccess = await canViewTree(c.env.DB, treeId, user.user_id)
    if (!hasAccess) {
      return c.json({ success: false, error: 'Access denied' }, 403)
    }

    // Get tree statistics
    const stats = await getTreeStats(c.env.DB, treeId)

    return c.json({
      success: true,
      data: {
        ...tree,
        stats
      }
    })
  } catch (error) {
    console.error('Failed to get tree:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Update tree metadata (name, description)
app.put('/api/trees/:id', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Check if user can update tree metadata (owner only)
    const canUpdate = await canUpdateTreeMetadata(c.env.DB, treeId, user.user_id)
    if (!canUpdate) {
      return c.json({ success: false, error: 'Only the owner can update tree metadata' }, 403)
    }

    const body = await c.req.json()
    const { name, description } = body

    const updates: { name?: string; description?: string } = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return c.json({ success: false, error: 'Invalid tree name' }, 400)
      }
      updates.name = name.trim()
    }

    if (description !== undefined) {
      updates.description = description
    }

    const updatedTree = await updateTree(c.env.DB, treeId, updates)

    return c.json({
      success: true,
      data: updatedTree
    })
  } catch (error) {
    console.error('Failed to update tree:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Delete a tree
app.delete('/api/trees/:id', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Check if user can delete tree (owner only)
    const canDelete = await canDeleteTree(c.env.DB, treeId, user.user_id)
    if (!canDelete) {
      return c.json({ success: false, error: 'Only the owner can delete the tree' }, 403)
    }

    await deleteTree(c.env.DB, treeId)

    return c.json({
      success: true,
      message: 'Tree deleted successfully'
    })
  } catch (error) {
    console.error('Failed to delete tree:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ===============================
// Tree-Scoped Node API Routes
// ===============================

// Get all nodes in a tree
app.get('/api/trees/:tree_id/nodes', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('tree_id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Check if tree exists first (404 before 403)
    const tree = await getTreeById(c.env.DB, treeId)
    if (!tree) {
      return c.json({ success: false, error: 'Tree not found' }, 404)
    }

    // Check if user has access to this tree
    const hasAccess = await canViewTree(c.env.DB, treeId, user.user_id)
    if (!hasAccess) {
      return c.json({ success: false, error: 'Access denied' }, 403)
    }

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM nodes WHERE tree_id = ? ORDER BY root_position, created_at'
    )
      .bind(treeId)
      .all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Failed to get nodes:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get a specific node in a tree
app.get('/api/trees/:tree_id/nodes/:id', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('tree_id'))
    const nodeId = parseInt(c.req.param('id'))

    if (isNaN(treeId) || isNaN(nodeId)) {
      return c.json({ success: false, error: 'Invalid tree ID or node ID' }, 400)
    }

    // Check if user has access to this tree
    const hasAccess = await canViewTree(c.env.DB, treeId, user.user_id)
    if (!hasAccess) {
      return c.json({ success: false, error: 'Access denied' }, 403)
    }

    const node = await c.env.DB.prepare('SELECT * FROM nodes WHERE id = ? AND tree_id = ?')
      .bind(nodeId, treeId)
      .first()

    if (!node) {
      return c.json({ success: false, error: 'Node not found' }, 404)
    }

    return c.json({ success: true, data: node })
  } catch (error) {
    console.error('Failed to get node:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get child nodes (using relation table)
app.get('/api/trees/:tree_id/nodes/:id/children', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('tree_id'))
    const nodeId = parseInt(c.req.param('id'))

    if (isNaN(treeId) || isNaN(nodeId)) {
      return c.json({ success: false, error: 'Invalid tree ID or node ID' }, 400)
    }

    // Check if user has access to this tree
    const hasAccess = await canViewTree(c.env.DB, treeId, user.user_id)
    if (!hasAccess) {
      return c.json({ success: false, error: 'Access denied' }, 403)
    }

    const { results } = await c.env.DB.prepare(
      `SELECT n.* FROM nodes n
       INNER JOIN node_relations nr ON n.id = nr.child_node_id
       WHERE nr.parent_node_id = ? AND n.tree_id = ?
       ORDER BY nr.position, n.created_at`
    )
      .bind(nodeId, treeId)
      .all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Failed to get child nodes:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get parent nodes (multi-parent support)
app.get('/api/trees/:tree_id/nodes/:id/parents', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('tree_id'))
    const nodeId = parseInt(c.req.param('id'))

    if (isNaN(treeId) || isNaN(nodeId)) {
      return c.json({ success: false, error: 'Invalid tree ID or node ID' }, 400)
    }

    // Check if user has access to this tree
    const hasAccess = await canViewTree(c.env.DB, treeId, user.user_id)
    if (!hasAccess) {
      return c.json({ success: false, error: 'Access denied' }, 403)
    }

    const { results } = await c.env.DB.prepare(
      `SELECT n.* FROM nodes n
       INNER JOIN node_relations nr ON n.id = nr.parent_node_id
       WHERE nr.child_node_id = ? AND n.tree_id = ?
       ORDER BY n.created_at`
    )
      .bind(nodeId, treeId)
      .all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Failed to get parent nodes:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get root nodes (nodes without parents)
app.get('/api/trees/:tree_id/nodes/root', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('tree_id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Check if user has access to this tree
    const hasAccess = await canViewTree(c.env.DB, treeId, user.user_id)
    if (!hasAccess) {
      return c.json({ success: false, error: 'Access denied' }, 403)
    }

    const { results } = await c.env.DB.prepare(
      `SELECT * FROM nodes
       WHERE tree_id = ? AND id NOT IN (SELECT child_node_id FROM node_relations)
       ORDER BY root_position, created_at`
    )
      .bind(treeId)
      .all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Failed to get root nodes:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get all relations in a tree
app.get('/api/trees/:tree_id/relations', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('tree_id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Check if user has access to this tree
    const hasAccess = await canViewTree(c.env.DB, treeId, user.user_id)
    if (!hasAccess) {
      return c.json({ success: false, error: 'Access denied' }, 403)
    }

    // Get all relations for nodes in this tree
    const { results } = await c.env.DB.prepare(
      `SELECT nr.* FROM node_relations nr
       INNER JOIN nodes n ON nr.parent_node_id = n.id
       WHERE n.tree_id = ?
       ORDER BY nr.parent_node_id, nr.position`
    )
      .bind(treeId)
      .all()

    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('Failed to get relations:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Create a node in a tree
app.post('/api/trees/:tree_id/nodes', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('tree_id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Check if user can edit this tree
    const canEdit = await canEditTree(c.env.DB, treeId, user.user_id)
    if (!canEdit) {
      return c.json({ success: false, error: 'You do not have permission to edit this tree' }, 403)
    }

    const body = await c.req.json()
    const { title, content, author, root_position } = body

    if (!title || !author) {
      return c.json({ success: false, error: 'Title and author are required' }, 400)
    }

    // Calculate root_position if not specified
    let finalRootPosition = root_position
    if (finalRootPosition === undefined) {
      const maxPosResult = await c.env.DB.prepare(
        'SELECT COALESCE(MAX(root_position), -1) as max_pos FROM nodes WHERE tree_id = ?'
      )
        .bind(treeId)
        .first()
      finalRootPosition = (maxPosResult?.max_pos as number) + 1
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO nodes (tree_id, title, content, author, root_position, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
      .bind(treeId, title, content || '', author, finalRootPosition, user.user_id, user.user_id)
      .first()

    return c.json({ success: true, data: result }, 201)
  } catch (error) {
    console.error('Failed to create node:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Update a node in a tree
app.put('/api/trees/:tree_id/nodes/:id', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('tree_id'))
    const nodeId = parseInt(c.req.param('id'))

    if (isNaN(treeId) || isNaN(nodeId)) {
      return c.json({ success: false, error: 'Invalid tree ID or node ID' }, 400)
    }

    // Check if user can edit this tree
    const canEdit = await canEditTree(c.env.DB, treeId, user.user_id)
    if (!canEdit) {
      return c.json({ success: false, error: 'You do not have permission to edit this tree' }, 403)
    }

    const body = await c.req.json()
    const { title, content, author, version: clientVersion } = body

    // Get current node
    const existing = await c.env.DB.prepare('SELECT * FROM nodes WHERE id = ? AND tree_id = ?')
      .bind(nodeId, treeId)
      .first()

    if (!existing) {
      return c.json({ success: false, error: 'Node not found' }, 404)
    }

    // Optimistic locking: Check version if provided
    if (clientVersion !== undefined) {
      const currentVersion = existing.version || 1
      if (clientVersion !== currentVersion) {
        // Version conflict detected
        return c.json(
          {
            success: false,
            error: 'Version conflict',
            message: 'This node has been modified by another user. Please refresh and try again.',
            current_version: currentVersion,
            server_data: existing
          },
          409
        )
      }
    }

    // Update node with version increment
    const newVersion = (existing.version || 1) + 1
    await c.env.DB.prepare(
      `UPDATE nodes
       SET title = ?, content = ?, author = ?, updated_by_user_id = ?, version = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND tree_id = ?`
    )
      .bind(
        title !== undefined ? title : existing.title,
        content !== undefined ? content : existing.content,
        author !== undefined ? author : existing.author,
        user.user_id,
        newVersion,
        nodeId,
        treeId
      )
      .run()

    // Get updated node
    const updated = await c.env.DB.prepare('SELECT * FROM nodes WHERE id = ? AND tree_id = ?')
      .bind(nodeId, treeId)
      .first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('Failed to update node:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Delete a node in a tree
app.delete('/api/trees/:tree_id/nodes/:id', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('tree_id'))
    const nodeId = parseInt(c.req.param('id'))

    if (isNaN(treeId) || isNaN(nodeId)) {
      return c.json({ success: false, error: 'Invalid tree ID or node ID' }, 400)
    }

    // Check if user can edit this tree
    const canEdit = await canEditTree(c.env.DB, treeId, user.user_id)
    if (!canEdit) {
      return c.json({ success: false, error: 'You do not have permission to edit this tree' }, 403)
    }

    const result = await c.env.DB.prepare('DELETE FROM nodes WHERE id = ? AND tree_id = ?')
      .bind(nodeId, treeId)
      .run()

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Node not found' }, 404)
    }

    return c.json({ success: true, message: 'Node deleted' })
  } catch (error) {
    console.error('Failed to delete node:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Add a parent-child relation (with circular reference check and same-tree validation)
app.post('/api/trees/:tree_id/relations', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('tree_id'))

    if (isNaN(treeId)) {
      return c.json({ success: false, error: 'Invalid tree ID' }, 400)
    }

    // Check if user can edit this tree
    const canEdit = await canEditTree(c.env.DB, treeId, user.user_id)
    if (!canEdit) {
      return c.json({ success: false, error: 'You do not have permission to edit this tree' }, 403)
    }

    const body = await c.req.json()
    const { parent_node_id, child_node_id } = body

    if (!parent_node_id || !child_node_id) {
      return c.json({ success: false, error: 'parent_node_id and child_node_id are required' }, 400)
    }

    // Self-reference check
    if (parent_node_id === child_node_id) {
      return c.json({ success: false, error: 'Cannot create self-reference' }, 400)
    }

    // Verify both nodes belong to the same tree
    const parentNode = await c.env.DB.prepare('SELECT tree_id FROM nodes WHERE id = ?')
      .bind(parent_node_id)
      .first<{ tree_id: number }>()

    const childNode = await c.env.DB.prepare('SELECT tree_id FROM nodes WHERE id = ?')
      .bind(child_node_id)
      .first<{ tree_id: number }>()

    if (!parentNode || !childNode) {
      return c.json({ success: false, error: 'Parent or child node not found' }, 404)
    }

    if (parentNode.tree_id !== treeId || childNode.tree_id !== treeId) {
      return c.json(
        { success: false, error: 'Both nodes must belong to the same tree' },
        400
      )
    }

    // Circular reference check
    const hasCircular = await checkCircularReference(c.env.DB, parent_node_id, child_node_id)
    if (hasCircular) {
      return c.json({ success: false, error: 'Circular reference detected' }, 400)
    }

    // Check if relation already exists
    const existing = await c.env.DB.prepare(
      'SELECT * FROM node_relations WHERE parent_node_id = ? AND child_node_id = ?'
    )
      .bind(parent_node_id, child_node_id)
      .first()

    if (existing) {
      return c.json({ success: false, error: 'Relation already exists' }, 400)
    }

    // Calculate position (add to end of parent's children)
    const maxPosResult = await c.env.DB.prepare(
      'SELECT COALESCE(MAX(position), -1) as max_pos FROM node_relations WHERE parent_node_id = ?'
    )
      .bind(parent_node_id)
      .first()

    const newPosition = (maxPosResult?.max_pos as number) + 1

    // Add relation
    const result = await c.env.DB.prepare(
      'INSERT INTO node_relations (parent_node_id, child_node_id, position) VALUES (?, ?, ?) RETURNING *'
    )
      .bind(parent_node_id, child_node_id, newPosition)
      .first()

    return c.json({ success: true, data: result }, 201)
  } catch (error) {
    console.error('Failed to create relation:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Delete a parent-child relation
app.delete('/api/trees/:tree_id/relations/:parent_id/:child_id', authMiddleware, async (c) => {
  try {
    const user = getCurrentUser(c)
    const treeId = parseInt(c.req.param('tree_id'))
    const parentId = parseInt(c.req.param('parent_id'))
    const childId = parseInt(c.req.param('child_id'))

    if (isNaN(treeId) || isNaN(parentId) || isNaN(childId)) {
      return c.json({ success: false, error: 'Invalid tree ID, parent ID, or child ID' }, 400)
    }

    // Check if user can edit this tree
    const canEdit = await canEditTree(c.env.DB, treeId, user.user_id)
    if (!canEdit) {
      return c.json({ success: false, error: 'You do not have permission to edit this tree' }, 403)
    }

    // Verify nodes belong to the tree
    const parentNode = await c.env.DB.prepare('SELECT tree_id FROM nodes WHERE id = ?')
      .bind(parentId)
      .first<{ tree_id: number }>()

    if (!parentNode || parentNode.tree_id !== treeId) {
      return c.json({ success: false, error: 'Parent node not found in this tree' }, 404)
    }

    const result = await c.env.DB.prepare(
      'DELETE FROM node_relations WHERE parent_node_id = ? AND child_node_id = ?'
    )
      .bind(parentId, childId)
      .run()

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Relation not found' }, 404)
    }

    return c.json({ success: true, message: 'Relation deleted' })
  } catch (error) {
    console.error('Failed to delete relation:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ===============================
// Legacy Node API Routes (for backward compatibility)
// ===============================

// 全ノード取得
app.get('/api/nodes', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM nodes ORDER BY root_position, created_at'
    ).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// 特定ノード取得
app.get('/api/nodes/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM nodes WHERE id = ?'
    ).bind(id).all()

    if (results.length === 0) {
      return c.json({ success: false, error: 'Node not found' }, 404)
    }

    return c.json({ success: true, data: results[0] })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// 子ノード取得（リレーションテーブル使用）
app.get('/api/nodes/:id/children', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(
      `SELECT n.* FROM nodes n
       INNER JOIN node_relations nr ON n.id = nr.child_node_id
       WHERE nr.parent_node_id = ?
       ORDER BY nr.position, n.created_at`
    ).bind(id).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// 親ノード取得（複数親対応）
app.get('/api/nodes/:id/parents', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(
      `SELECT n.* FROM nodes n
       INNER JOIN node_relations nr ON n.id = nr.parent_node_id
       WHERE nr.child_node_id = ?
       ORDER BY n.created_at`
    ).bind(id).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ルートノード取得（親を持たないノード）
app.get('/api/nodes/root/list', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM nodes
       WHERE id NOT IN (SELECT child_node_id FROM node_relations)
       ORDER BY root_position, created_at`
    ).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// すべてのリレーション取得
app.get('/api/relations', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM node_relations ORDER BY parent_node_id, position'
    ).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ノード作成
app.post('/api/nodes', async (c) => {
  try {
    const body = await c.req.json()
    const { title, content, author, root_position } = body

    if (!title || !author) {
      return c.json({ success: false, error: 'Title and author are required' }, 400)
    }

    // root_positionが指定されていない場合、最大値+1を使用
    let finalRootPosition = root_position
    if (finalRootPosition === undefined) {
      const maxPosResult = await c.env.DB.prepare(
        'SELECT COALESCE(MAX(root_position), -1) as max_pos FROM nodes'
      ).first()
      finalRootPosition = (maxPosResult?.max_pos as number) + 1
    }

    const result = await c.env.DB.prepare(
      `INSERT INTO nodes (title, content, author, root_position) 
       VALUES (?, ?, ?, ?) RETURNING *`
    ).bind(
      title,
      content || '',
      author,
      finalRootPosition
    ).first()

    return c.json({ success: true, data: result }, 201)
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ノード更新
app.put('/api/nodes/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { title, content, author } = body

    // 現在のノード情報を取得
    const existing = await c.env.DB.prepare(
      'SELECT * FROM nodes WHERE id = ?'
    ).bind(id).first()

    if (!existing) {
      return c.json({ success: false, error: 'Node not found' }, 404)
    }

    // 更新
    await c.env.DB.prepare(
      `UPDATE nodes 
       SET title = ?, content = ?, author = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      title !== undefined ? title : existing.title,
      content !== undefined ? content : existing.content,
      author !== undefined ? author : existing.author,
      id
    ).run()

    // 更新後のデータを取得
    const updated = await c.env.DB.prepare(
      'SELECT * FROM nodes WHERE id = ?'
    ).bind(id).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ノード削除（リレーションも自動削除される）
app.delete('/api/nodes/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const result = await c.env.DB.prepare(
      'DELETE FROM nodes WHERE id = ?'
    ).bind(id).run()

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Node not found' }, 404)
    }

    return c.json({ success: true, message: 'Node deleted' })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// 親子関係を追加（循環参照チェック付き）
app.post('/api/relations', async (c) => {
  try {
    const body = await c.req.json()
    const { parent_node_id, child_node_id } = body

    if (!parent_node_id || !child_node_id) {
      return c.json({ success: false, error: 'parent_node_id and child_node_id are required' }, 400)
    }

    // 同じノード同士はNG
    if (parent_node_id === child_node_id) {
      return c.json({ success: false, error: 'Cannot create self-reference' }, 400)
    }

    // 循環参照チェック
    const hasCircular = await checkCircularReference(c.env.DB, parent_node_id, child_node_id)
    if (hasCircular) {
      return c.json({ success: false, error: 'Circular reference detected' }, 400)
    }

    // 既存のリレーションチェック
    const existing = await c.env.DB.prepare(
      'SELECT * FROM node_relations WHERE parent_node_id = ? AND child_node_id = ?'
    ).bind(parent_node_id, child_node_id).first()

    if (existing) {
      return c.json({ success: false, error: 'Relation already exists' }, 400)
    }

    // 新しいリレーションの位置を計算（親の最後に追加）
    const maxPosResult = await c.env.DB.prepare(
      'SELECT COALESCE(MAX(position), -1) as max_pos FROM node_relations WHERE parent_node_id = ?'
    ).bind(parent_node_id).first()

    const newPosition = (maxPosResult?.max_pos as number) + 1

    // リレーション追加
    const result = await c.env.DB.prepare(
      'INSERT INTO node_relations (parent_node_id, child_node_id, position) VALUES (?, ?, ?) RETURNING *'
    ).bind(parent_node_id, child_node_id, newPosition).first()

    return c.json({ success: true, data: result }, 201)
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// 親子関係を削除
app.delete('/api/relations/:parent_id/:child_id', async (c) => {
  try {
    const parentId = c.req.param('parent_id')
    const childId = c.req.param('child_id')

    const result = await c.env.DB.prepare(
      'DELETE FROM node_relations WHERE parent_node_id = ? AND child_node_id = ?'
    ).bind(parentId, childId).run()

    if (result.meta.changes === 0) {
      return c.json({ success: false, error: 'Relation not found' }, 404)
    }

    return c.json({ success: true, message: 'Relation deleted' })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// 循環参照チェック関数
async function checkCircularReference(db: D1Database, parentId: number, childId: number): Promise<boolean> {
  // childIdがparentIdの祖先かどうかをチェック
  const ancestors = await getAncestors(db, parentId)
  return ancestors.includes(childId)
}

// 祖先ノードをすべて取得（再帰的）
async function getAncestors(db: D1Database, nodeId: number): Promise<number[]> {
  const ancestors: number[] = []
  const visited = new Set<number>()

  const queue: number[] = [nodeId]

  while (queue.length > 0) {
    const currentId = queue.shift()!

    if (visited.has(currentId)) continue
    visited.add(currentId)

    const { results } = await db.prepare(
      'SELECT parent_node_id FROM node_relations WHERE child_node_id = ?'
    ).bind(currentId).all()

    for (const row of results) {
      const parentId = row.parent_node_id as number
      ancestors.push(parentId)
      queue.push(parentId)
    }
  }

  return ancestors
}

// リレーションのposition更新（ドラッグ&ドロップ用）
app.patch('/api/relations/:parent_id/:child_id/position', async (c) => {
  try {
    const parentId = c.req.param('parent_id')
    const childId = c.req.param('child_id')
    const body = await c.req.json()
    const { position } = body

    // リレーションの存在確認
    const existing = await c.env.DB.prepare(
      'SELECT * FROM node_relations WHERE parent_node_id = ? AND child_node_id = ?'
    ).bind(parentId, childId).first()

    if (!existing) {
      return c.json({ success: false, error: 'Relation not found' }, 404)
    }

    // positionを更新
    await c.env.DB.prepare(
      'UPDATE node_relations SET position = ? WHERE parent_node_id = ? AND child_node_id = ?'
    ).bind(position || 0, parentId, childId).run()

    const updated = await c.env.DB.prepare(
      'SELECT * FROM node_relations WHERE parent_node_id = ? AND child_node_id = ?'
    ).bind(parentId, childId).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ルートノードのroot_position更新（ドラッグ&ドロップ用）
app.patch('/api/nodes/:id/root-position', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { root_position } = body

    // ノードの存在確認
    const existing = await c.env.DB.prepare(
      'SELECT * FROM nodes WHERE id = ?'
    ).bind(id).first()

    if (!existing) {
      return c.json({ success: false, error: 'Node not found' }, 404)
    }

    // root_positionを更新
    await c.env.DB.prepare(
      'UPDATE nodes SET root_position = ? WHERE id = ?'
    ).bind(root_position || 0, id).run()

    const updated = await c.env.DB.prepare(
      'SELECT * FROM nodes WHERE id = ?'
    ).bind(id).first()

    return c.json({ success: true, data: updated })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// 検索
app.get('/api/search', async (c) => {
  try {
    const query = c.req.query('q')
    if (!query || query.trim() === '') {
      return c.json({ success: true, data: [] })
    }

    const searchTerm = `%${query}%`
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM nodes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC'
    ).bind(searchTerm, searchTerm).all()

    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ===============================
// Frontend
// ===============================

// Editor HTML generator
const getEditorHTML = () => `
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Zeeta Web</title>
        <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
        <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon.png">
        <link rel="apple-touch-icon" sizes="180x180" href="/static/favicon.png">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <!-- Marked.js (for EasyMDE) -->
        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <!-- EasyMDE -->
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.css">
        <script src="https://cdn.jsdelivr.net/npm/easymde/dist/easymde.min.js"></script>
        <style>
          .tree-item {
            cursor: move;
            user-select: none;
            line-height: 1.2;
          }
          .tree-item:hover {
            background-color: #f3f4f6;
          }
          .tree-item.active {
            background-color: #dbeafe;
            border-left: 3px solid #3b82f6;
          }
          .tree-item.duplicate-active {
            border: 1px dashed #c084fc;
            border-radius: 4px;
          }
          .tree-item.dragging {
            opacity: 0.5;
          }
          .tree-item.drag-over {
            border-top: 2px solid #3b82f6;
          }
          .tree-item.drop-target {
            background-color: #dbeafe !important;
            border: 2px dashed #3b82f6;
            border-radius: 4px;
          }
          .tree-children {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
          }
          .tree-children.expanded {
            max-height: 2000px;
          }
          #editor-panel {
            /* 高さは親要素に合わせる */
          }
          /* EasyMDE Preview Styles - GitHub Style */
          .editor-preview, .editor-preview-side {
            padding: 16px;
            background: #ffffff;
            font-size: 16px;
            line-height: 1.5;
            color: #24292e;
          }
          .editor-preview h1, .editor-preview-side h1 {
            font-size: 2em;
            font-weight: 600;
            margin-top: 24px;
            margin-bottom: 16px;
            border-bottom: 1px solid #eaecef;
            padding-bottom: 0.3em;
            line-height: 1.25;
          }
          .editor-preview h2, .editor-preview-side h2 {
            font-size: 1.5em;
            font-weight: 600;
            margin-top: 24px;
            margin-bottom: 16px;
            border-bottom: 1px solid #eaecef;
            padding-bottom: 0.3em;
            line-height: 1.25;
          }
          .editor-preview h3, .editor-preview-side h3 {
            font-size: 1.25em;
            font-weight: 600;
            margin-top: 24px;
            margin-bottom: 16px;
            line-height: 1.25;
          }
          .editor-preview h4, .editor-preview-side h4 {
            font-size: 1em;
            font-weight: 600;
            margin-top: 24px;
            margin-bottom: 16px;
            line-height: 1.25;
          }
          .editor-preview h5, .editor-preview-side h5 {
            font-size: 0.875em;
            font-weight: 600;
            margin-top: 24px;
            margin-bottom: 16px;
            line-height: 1.25;
          }
          .editor-preview h6, .editor-preview-side h6 {
            font-size: 0.85em;
            font-weight: 600;
            margin-top: 24px;
            margin-bottom: 16px;
            line-height: 1.25;
            color: #6a737d;
          }
          .editor-preview ul, .editor-preview-side ul {
            margin-top: 0;
            margin-bottom: 16px;
            padding-left: 2em;
            list-style-type: disc;
          }
          .editor-preview ol, .editor-preview-side ol {
            margin-top: 0;
            margin-bottom: 16px;
            padding-left: 2em;
            list-style-type: decimal;
          }
          .editor-preview li, .editor-preview-side li {
            margin-top: 0;
            margin-bottom: 0;
            line-height: 1.5;
          }
          .editor-preview li > p, .editor-preview-side li > p {
            margin-top: 0;
            margin-bottom: 8px;
          }
          .editor-preview li + li, .editor-preview-side li + li {
            margin-top: 4px;
          }
          .editor-preview p, .editor-preview-side p {
            margin-top: 0;
            margin-bottom: 10px;
          }
          .editor-preview code, .editor-preview-side code {
            background: rgba(27,31,35,0.05);
            padding: 0.2em 0.4em;
            margin: 0;
            font-size: 85%;
            border-radius: 3px;
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
          }
          .editor-preview pre, .editor-preview-side pre {
            background: #f6f8fa;
            padding: 16px;
            overflow: auto;
            font-size: 85%;
            line-height: 1.45;
            border-radius: 6px;
            margin-top: 0;
            margin-bottom: 16px;
          }
          .editor-preview pre code, .editor-preview-side pre code {
            background: transparent;
            padding: 0;
            margin: 0;
            font-size: 100%;
            border-radius: 0;
          }
          .editor-preview blockquote, .editor-preview-side blockquote {
            padding: 0 1em;
            color: #6a737d;
            border-left: 0.25em solid #dfe2e5;
            margin-top: 0;
            margin-bottom: 16px;
          }
          .editor-preview blockquote > :first-child, .editor-preview-side blockquote > :first-child {
            margin-top: 0;
          }
          .editor-preview blockquote > :last-child, .editor-preview-side blockquote > :last-child {
            margin-bottom: 0;
          }
          .editor-preview table, .editor-preview-side table {
            border-collapse: collapse;
            border-spacing: 0;
            margin-top: 0;
            margin-bottom: 16px;
          }
          .editor-preview th, .editor-preview-side th,
          .editor-preview td, .editor-preview-side td {
            border: 1px solid #dfe2e5;
            padding: 6px 13px;
          }
          .editor-preview th, .editor-preview-side th {
            background: #f6f8fa;
            font-weight: 600;
          }
          .editor-preview hr, .editor-preview-side hr {
            height: 0.25em;
            padding: 0;
            margin: 24px 0;
            background-color: #e1e4e8;
            border: 0;
          }
          .editor-preview a, .editor-preview-side a {
            color: #0366d6;
            text-decoration: none;
          }
          .editor-preview a:hover, .editor-preview-side a:hover {
            text-decoration: underline;
          }
          .editor-preview img, .editor-preview-side img {
            max-width: 100%;
            box-sizing: content-box;
          }
          .search-highlight {
            background-color: #fef08a;
            font-weight: 600;
          }
          .markdown-preview {
            line-height: 1.6;
            color: #333;
          }
          .markdown-preview h1 { font-size: 2em; font-weight: bold; margin-top: 0.67em; margin-bottom: 0.67em; }
          .markdown-preview h2 { font-size: 1.5em; font-weight: bold; margin-top: 0.83em; margin-bottom: 0.83em; }
          .markdown-preview h3 { font-size: 1.17em; font-weight: bold; margin-top: 1em; margin-bottom: 1em; }
          .markdown-preview p { margin-top: 1em; margin-bottom: 1em; }
          .markdown-preview ul, .markdown-preview ol { margin-left: 2em; margin-top: 1em; margin-bottom: 1em; }
          .markdown-preview li { margin-top: 0.5em; margin-bottom: 0.5em; }
          .markdown-preview code { background-color: #f4f4f4; padding: 2px 4px; border-radius: 3px; font-family: monospace; }
          .markdown-preview pre { background-color: #f4f4f4; padding: 1em; border-radius: 4px; overflow-x: auto; }
          .markdown-preview pre code { background-color: transparent; padding: 0; }
          .markdown-preview blockquote { border-left: 4px solid #ddd; padding-left: 1em; color: #666; margin: 1em 0; }
          .markdown-preview a { color: #3b82f6; text-decoration: underline; }
          .markdown-preview img { max-width: 100%; height: auto; }
          .markdown-preview table { border-collapse: collapse; width: 100%; margin: 1em 0; }
          .markdown-preview th, .markdown-preview td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .markdown-preview th { background-color: #f3f4f6; font-weight: bold; }
          .tab-btn { cursor: pointer; padding: 0.5rem 1rem; border-bottom: 2px solid transparent; }
          .tab-btn.active { border-bottom-color: #3b82f6; color: #3b82f6; font-weight: 600; }
          .tree-view-tab { cursor: pointer; transition: all 0.2s; }
          .tree-view-tab.active { border-bottom-color: #3b82f6 !important; color: #3b82f6; background-color: #eff6ff; }
          
          /* ローディングオーバーレイ */
          #loading-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9999;
            align-items: center;
            justify-content: center;
          }
          .loading-spinner {
            text-align: center;
            color: white;
          }
          .spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .loading-text {
            font-size: 16px;
            font-weight: 500;
          }
          
          /* トースト通知 */
          .toast {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            gap: 12px;
            z-index: 10000;
            min-width: 320px;
            transform: translateX(400px);
            transition: transform 0.3s ease-out;
          }
          .toast.show {
            transform: translateX(0);
          }
          .toast-success {
            background: #10b981;
            color: white;
          }
          .toast-error {
            background: #ef4444;
            color: white;
          }
          .toast-icon {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 16px;
          }
          .toast-success .toast-icon {
            color: #10b981;
          }
          .toast-error .toast-icon {
            color: #ef4444;
          }
          .toast-message {
            flex: 1;
            font-size: 15px;
            font-weight: 500;
            color: white;
          }
          .toast-close {
            background: none;
            border: none;
            font-size: 20px;
            color: white;
            opacity: 0.8;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 0.2s;
            flex-shrink: 0;
          }
          .toast-close:hover {
            opacity: 1;
            background: rgba(255, 255, 255, 0.2);
          }
        </style>
    </head>
    <body class="bg-gray-50">
        <!-- Tree Header (populated by app.js) -->
        <div id="tree-header"></div>

        <div class="flex h-screen" id="main-container">
            <!-- 左ペイン: ツリー表示 -->
            <div class="bg-white border-r border-gray-200 flex flex-col" id="tree-pane" style="width: 33.333%">
                <!-- 固定ヘッダー部分 -->
                <div class="p-4 flex-shrink-0">
                    <div class="flex items-center justify-between mb-4">
                        <h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <i class="fas fa-sitemap"></i>
                            <span>Zeeta Web</span>
                            <span id="version-badge" class="text-xs font-normal text-gray-500 px-2 py-1 bg-gray-100 rounded">
                                loading...
                            </span>
                        </h2>
                        <button id="add-root-btn" class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">
                            <i class="fas fa-plus mr-1"></i>ルート追加
                        </button>
                    </div>
                    
                    <!-- 検索ボックス -->
                    <div class="mb-4">
                        <div class="relative">
                            <input type="text" id="search-input" placeholder="検索..." 
                                   class="w-full px-3 py-2 pl-10 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            <i class="fas fa-search absolute left-3 top-3 text-gray-400"></i>
                            <button id="clear-search-btn" class="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 hidden">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        <div id="search-results" class="mt-2 text-xs text-gray-500 hidden"></div>
                    </div>
                    
                    <!-- ツリー表示タブ -->
                    <div class="mb-3 border-b border-gray-200">
                        <div class="flex gap-1">
                            <button class="tree-view-tab active px-4 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 border-b-2 border-transparent" data-view="normal">
                                <i class="fas fa-stream mr-1"></i>通常
                            </button>
                            <button class="tree-view-tab px-4 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 border-b-2 border-transparent" data-view="reverse">
                                <i class="fas fa-level-up-alt mr-1"></i>逆ツリー
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- スクロール可能なツリーコンテナ -->
                <div class="flex-1 overflow-y-auto px-4 pb-4">
                    <div id="tree-container"></div>
                </div>
            </div>
            
            <!-- リサイズハンドル -->
            <div id="resize-handle" class="w-1 bg-gray-300 hover:bg-blue-500 cursor-col-resize transition-colors"></div>

            <!-- 右ペイン: ノード詳細 -->
            <div class="flex-1 p-3 overflow-hidden" id="editor-pane">
                <div id="editor-panel" class="bg-white rounded-lg shadow p-6 h-full">
                    <div class="text-center text-gray-400 py-12">
                        <i class="fas fa-arrow-left text-4xl mb-4"></i>
                        <p>左側のノードを選択してください</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Version Conflict Resolution Dialog -->
        <div id="conflict-dialog" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div class="p-6 border-b border-gray-200">
                    <div class="flex items-center justify-between">
                        <h2 class="text-2xl font-bold text-gray-800">
                            <i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>
                            競合が検出されました
                        </h2>
                        <button id="conflict-dialog-close" class="text-gray-400 hover:text-gray-600">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                    <p class="text-gray-600 mt-2">
                        このノードは他のユーザーによって更新されました。以下のいずれかを選択してください。
                    </p>
                </div>

                <div class="p-6 space-y-6">
                    <!-- Your Version -->
                    <div class="border border-blue-200 rounded-lg p-4 bg-blue-50">
                        <h3 class="text-lg font-semibold text-blue-900 mb-3">
                            <i class="fas fa-user mr-2"></i>あなたの変更
                        </h3>
                        <div class="space-y-3 bg-white p-4 rounded">
                            <div>
                                <label class="text-sm font-medium text-gray-700">タイトル:</label>
                                <div id="conflict-your-title" class="text-gray-900 mt-1"></div>
                            </div>
                            <div>
                                <label class="text-sm font-medium text-gray-700">内容:</label>
                                <div id="conflict-your-content" class="text-gray-900 mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Server Version -->
                    <div class="border border-green-200 rounded-lg p-4 bg-green-50">
                        <h3 class="text-lg font-semibold text-green-900 mb-3">
                            <i class="fas fa-server mr-2"></i>サーバー上の最新バージョン
                        </h3>
                        <div class="space-y-3 bg-white p-4 rounded">
                            <div>
                                <label class="text-sm font-medium text-gray-700">タイトル:</label>
                                <div id="conflict-server-title" class="text-gray-900 mt-1"></div>
                            </div>
                            <div>
                                <label class="text-sm font-medium text-gray-700">内容:</label>
                                <div id="conflict-server-content" class="text-gray-900 mt-1 whitespace-pre-wrap max-h-40 overflow-y-auto"></div>
                            </div>
                            <div class="text-sm text-gray-500">
                                <span>更新者: <span id="conflict-server-author"></span></span>
                                <span class="ml-4">バージョン: <span id="conflict-server-version"></span></span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="p-6 border-t border-gray-200 bg-gray-50 flex gap-3">
                    <button id="conflict-use-server" class="flex-1 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium">
                        <i class="fas fa-check mr-2"></i>サーバー版を使用
                        <p class="text-sm mt-1 opacity-90">あなたの変更を破棄し、サーバーの最新版を使用します</p>
                    </button>
                    <button id="conflict-use-mine" class="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium">
                        <i class="fas fa-save mr-2"></i>自分の版を維持
                        <p class="text-sm mt-1 opacity-90">サーバー版を上書きして、あなたの変更を保存します</p>
                    </button>
                    <button id="conflict-cancel" class="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 font-medium">
                        <i class="fas fa-times mr-2"></i>キャンセル
                    </button>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
        <script src="/static/notifications.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `

// Root route - Editor
app.get('/', (c) => c.html(getEditorHTML()))

// /index.html route - Same as root
app.get('/index.html', (c) => c.html(getEditorHTML()))

export default app
