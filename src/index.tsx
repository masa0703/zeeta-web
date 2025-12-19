import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { sign, verify } from 'hono/jwt'
import { getCookie, setCookie } from 'hono/cookie'
import * as bcrypt from 'bcryptjs'
import { sendVerificationEmail } from './email'

// ビルド番号のグローバル型定義
declare const __BUILD_NUMBER__: string

type Bindings = {
  DB: D1Database
  JWT_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  BASE_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()
const JWT_SECRET = 'zeeta-secret-key-change-this' // 環境変数が使えない場合のフォールバック

// CORS設定
app.use('/api/*', cors())

// 静的ファイル配信
app.use('/static/*', serveStatic({ root: './public' }))

// ===============================
// Auth Middleware
// ===============================
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }

  const token = authHeader.split(' ')[1]
  try {
    const payload = await verify(token, c.env.JWT_SECRET || JWT_SECRET)
    c.set('jwtPayload', payload)
    await next()
  } catch (e) {
    return c.json({ success: false, error: 'Invalid token' }, 401)
  }
}

// ===============================
// Auth Routes
// ===============================

// ユーザー登録（メール認証対応）
app.post('/api/auth/register', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password, email } = body

    if (!username || !password || !email) {
      return c.json({ success: false, error: 'Username, password and email are required' }, 400)
    }

    // ユーザー重複チェック
    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).bind(username).first()

    if (existing) {
      return c.json({ success: false, error: 'Username already taken' }, 409)
    }

    // パスワードハッシュ化
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)

    // ユーザー作成 (Unverified)
    const result = await c.env.DB.prepare(
      'INSERT INTO users (username, password_hash, email, is_verified) VALUES (?, ?, ?, 0) RETURNING id, username, email, created_at'
    ).bind(username, passwordHash, email).first()

    const userId = result.id as number
    
    // 検証トークン生成
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours

    await c.env.DB.prepare(
      'INSERT INTO verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)'
    ).bind(userId, token, expiresAt).run()

    // メール送信（モック）
    const baseUrl = new URL(c.req.url).origin
    await sendVerificationEmail(email, token, baseUrl)

    return c.json({ 
      success: true, 
      data: result,
      message: 'Account created. Please verify your email.'
    }, 201)
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// メール検証
app.get('/api/auth/verify-email', async (c) => {
  try {
    const token = c.req.query('token')
    if (!token) {
      return c.text('Invalid token', 400)
    }

    // トークン検索
    const tokenRecord = await c.env.DB.prepare(
      'SELECT * FROM verification_tokens WHERE token = ? AND expires_at > CURRENT_TIMESTAMP'
    ).bind(token).first()

    if (!tokenRecord) {
      return c.text('Invalid or expired token', 400)
    }

    const userId = tokenRecord.user_id as number

    // ユーザーをVerifiedに更新
    await c.env.DB.prepare(
      'UPDATE users SET is_verified = 1 WHERE id = ?'
    ).bind(userId).run()

    // トークン削除
    await c.env.DB.prepare(
      'DELETE FROM verification_tokens WHERE id = ?'
    ).bind(tokenRecord.id).run()

    // 完了画面
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email Verified</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
      </head>
      <body class="bg-gray-50 min-h-screen flex items-center justify-center">
        <div class="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <i class="fas fa-check text-green-600 text-xl"></i>
          </div>
          <h2 class="text-2xl font-bold text-gray-900 mb-2">Email Verified!</h2>
          <p class="text-gray-600 mb-6">Your email has been successfully verified.</p>
          <a href="/" class="inline-flex justify-center w-full px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            Go to Login
          </a>
        </div>
      </body>
      </html>
    `)
  } catch (error) {
    return c.text(String(error), 500)
  }
})

// Google OAuth Login
app.get('/api/auth/google', (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return c.text('Google Client ID is not configured', 500)
  }

  const state = crypto.randomUUID()
  setCookie(c, 'oauth_state', state, { httpOnly: true, secure: true, maxAge: 600, path: '/' })

  const baseUrl = c.env.BASE_URL || new URL(c.req.url).origin
  const redirectUri = new URL('/api/auth/google/callback', baseUrl).toString()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'email profile',
    state: state,
    access_type: 'offline',
    prompt: 'consent'
  })

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
})

// Google OAuth Callback
app.get('/api/auth/google/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')

  if (!code || !state || state !== storedState) {
    return c.text('Invalid state or code', 400)
  }

  const clientId = c.env.GOOGLE_CLIENT_ID
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET
  const baseUrl = c.env.BASE_URL || new URL(c.req.url).origin
  const redirectUri = new URL('/api/auth/google/callback', baseUrl).toString()

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    })

    const tokenData = await tokenRes.json() as any
    if (tokenData.error) {
      return c.text(`Google Error: ${tokenData.error_description}`, 400)
    }

    const accessToken = tokenData.access_token

    // Get User Info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })
    const userData = await userRes.json() as any
    
    // Find or create user
    const googleId = userData.sub
    const email = userData.email
    const name = userData.name || email.split('@')[0]

    let user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE google_id = ?'
    ).bind(googleId).first()

    if (!user) {
      // Check if email already exists
      user = await c.env.DB.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(email).first()

      if (user) {
        // Link account
        await c.env.DB.prepare(
          'UPDATE users SET google_id = ?, is_verified = 1 WHERE id = ?'
        ).bind(googleId, user.id).run()
      } else {
        // Create new user
        // Generate unique username
        let username = name.replace(/\s+/g, '').toLowerCase()
        let suffix = 0
        while (true) {
          const check = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
          if (!check) break
          suffix++
          username = `${name.replace(/\s+/g, '').toLowerCase()}${suffix}`
        }

        user = await c.env.DB.prepare(
          'INSERT INTO users (username, password_hash, email, google_id, is_verified) VALUES (?, ?, ?, ?, 1) RETURNING *'
        ).bind(username, 'oauth_user', email, googleId).first()
      }
    }

    // JWT生成
    const payload = {
      sub: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days
    }
    const token = await sign(payload, c.env.JWT_SECRET || JWT_SECRET)

    // Redirect to frontend with token
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Redirecting...</title>
      </head>
      <body>
        <script>
          localStorage.setItem('token', '${token}');
          window.location.href = '/';
        </script>
      </body>
      </html>
    `)

  } catch (error) {
    return c.text(`Auth Error: ${String(error)}`, 500)
  }
})

// ユーザー登録（メール認証対応）

// GitHub OAuth Login
app.get('/api/auth/github', (c) => {
  const clientId = c.env.GITHUB_CLIENT_ID
  if (!clientId) {
    return c.text('GitHub Client ID is not configured', 500)
  }

  const state = crypto.randomUUID()
  setCookie(c, 'oauth_state', state, { httpOnly: true, secure: true, maxAge: 600, path: '/' })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: new URL('/api/auth/github/callback', c.req.url).toString(),
    scope: 'user:email',
    state: state
  })

  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`)
})

// GitHub OAuth Callback
app.get('/api/auth/github/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, 'oauth_state')

  if (!code || !state || state !== storedState) {
    return c.text('Invalid state or code', 400)
  }

  const clientId = c.env.GITHUB_CLIENT_ID
  const clientSecret = c.env.GITHUB_CLIENT_SECRET

  try {
    // Access Token取得
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      })
    })
    
    const tokenData = await tokenRes.json() as any
    if (tokenData.error) {
      return c.text(`GitHub Error: ${tokenData.error_description}`, 400)
    }

    const accessToken = tokenData.access_token

    // User Info取得
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'Zeeta-Web'
      }
    })
    const userData = await userRes.json() as any

    // Email取得（公開されていない場合があるため別途取得）
    let email = userData.email
    if (!email) {
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'Zeeta-Web'
        }
      })
      const emails = await emailRes.json() as any[]
      const primaryEmail = emails.find((e: any) => e.primary && e.verified)
      if (primaryEmail) email = primaryEmail.email
    }

    // ユーザー検索または作成
    // 1. provider_user_idで検索
    let user = await c.env.DB.prepare(
      `SELECT u.* FROM users u 
       JOIN oauth_accounts oa ON u.id = oa.user_id 
       WHERE oa.provider = 'github' AND oa.provider_user_id = ?`
    ).bind(String(userData.id)).first()

    if (!user) {
      // 2. emailで検索（既存アカウントがあれば紐付け）
      if (email) {
        user = await c.env.DB.prepare(
          'SELECT * FROM users WHERE email = ?'
        ).bind(email).first()

        if (user) {
          // 紐付け作成
          await c.env.DB.prepare(
            'INSERT INTO oauth_accounts (user_id, provider, provider_user_id) VALUES (?, ?, ?)'
          ).bind(user.id, 'github', String(userData.id)).run()
        }
      }

      // 3. 新規作成
      if (!user) {
        // ユーザー名が重複しないように調整
        let username = userData.login
        let suffix = 0
        while (true) {
          const check = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
          if (!check) break
          suffix++
          username = `${userData.login}${suffix}`
        }

        const newUser = await c.env.DB.prepare(
          'INSERT INTO users (username, password_hash, email, is_verified) VALUES (?, ?, ?, 1) RETURNING *' // OAuthはVerified扱い
        ).bind(username, 'oauth_user', email).first()

        await c.env.DB.prepare(
          'INSERT INTO oauth_accounts (user_id, provider, provider_user_id) VALUES (?, ?, ?)'
        ).bind(newUser.id, 'github', String(userData.id)).run()

        user = newUser
      }
    }

    // JWT生成
    const payload = {
      sub: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days
    }
    const token = await sign(payload, c.env.JWT_SECRET || JWT_SECRET)

    // フロントエンドへリダイレクト（トークンを渡す）
    return c.redirect(`/?token=${token}`)

  } catch (error) {
    return c.text(`Auth Error: ${String(error)}`, 500)
  }
})

// ログイン
app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body

    if (!username || !password) {
      return c.json({ success: false, error: 'Username and password are required' }, 400)
    }

    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(username).first()

    if (!user) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401)
    }

    const validPassword = await bcrypt.compare(password, user.password_hash as string)
    if (!validPassword) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401)
    }
    
    // メール検証チェック
    if (!user.is_verified && user.password_hash !== 'oauth_user') {
      return c.json({ success: false, error: 'Please verify your email address' }, 403)
    }

    // JWT生成
    const payload = {
      sub: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 // 7 days
    }
    const token = await sign(payload, c.env.JWT_SECRET || JWT_SECRET)

    return c.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// 現在のユーザー取得
app.get('/api/auth/me', authMiddleware, async (c) => {
  const payload = c.get('jwtPayload')
  const user = await c.env.DB.prepare(
    'SELECT id, username, email, created_at FROM users WHERE id = ?'
  ).bind(payload.sub).first()
  
  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404)
  }

  return c.json({ success: true, data: user })
})

// ===============================
// API Routes (Protected)
// ===============================

// 以下のルートに認証ガードを適用
app.use('/api/nodes/*', authMiddleware)
app.use('/api/relations/*', authMiddleware)
app.use('/api/search', authMiddleware)

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

// テスト用: 全データクリア
app.delete('/api/test/clear', async (c) => {
  try {
    // リレーションを全削除
    await c.env.DB.prepare('DELETE FROM node_relations').run()
    // ノードを全削除
    await c.env.DB.prepare('DELETE FROM nodes').run()
    // auto_incrementをリセット
    await c.env.DB.prepare('DELETE FROM sqlite_sequence WHERE name IN ("nodes", "node_relations")').run()

    return c.json({ success: true, message: 'All data cleared' })
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

app.get('/', (c) => {
  return c.html(`
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
        <!-- Auth Container -->
        <div id="auth-container" class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8" style="display: none;">
            <div class="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
                <div>
                    <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900" id="auth-title">
                        Zeeta Web
                    </h2>
                    <p class="mt-2 text-center text-sm text-gray-600" id="auth-subtitle">
                        Sign in to your account
                    </p>
                </div>
                
                <!-- Login Form -->
                <form id="login-form" class="mt-8 space-y-6">
                    <div class="rounded-md shadow-sm -space-y-px">
                        <div>
                            <label for="login-username" class="sr-only">Username</label>
                            <input id="login-username" name="username" type="text" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Username">
                        </div>
                        <div>
                            <label for="login-password" class="sr-only">Password</label>
                            <input id="login-password" name="password" type="password" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Password">
                        </div>
                    </div>

                    <div>
                        <button type="submit" class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            Sign in
                        </button>
                    </div>

                    <div class="mt-4">
                        <div class="relative">
                            <div class="absolute inset-0 flex items-center">
                                <div class="w-full border-t border-gray-300"></div>
                            </div>
                            <div class="relative flex justify-center text-sm">
                                <span class="px-2 bg-white text-gray-500">Or continue with</span>
                            </div>
                        </div>

                        <div class="mt-6 grid grid-cols-2 gap-3">
                            <div>
                                <a href="/api/auth/google" class="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
                                    <i class="fab fa-google text-red-500"></i>
                                    <span class="ml-2">Google</span>
                                </a>
                            </div>
                            <div>
                                <a href="/api/auth/github" class="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50">
                                    <i class="fab fa-github text-gray-900"></i>
                                    <span class="ml-2">GitHub</span>
                                </a>
                            </div>
                        </div>
                    </div>
                    
                    <div class="text-sm text-center">
                        <a href="#" id="to-register-link" class="font-medium text-blue-600 hover:text-blue-500">
                            Don't have an account? Sign up
                        </a>
                    </div>
                </form>

                <!-- Register Form -->
                <form id="register-form" class="mt-8 space-y-6 hidden">
                    <div class="rounded-md shadow-sm -space-y-px">
                        <div>
                            <label for="register-username" class="sr-only">Username</label>
                            <input id="register-username" name="username" type="text" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Username">
                        </div>
                        <div>
                            <label for="register-email" class="sr-only">Email (Optional)</label>
                            <input id="register-email" name="email" type="email" class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Email (Optional)">
                        </div>
                        <div>
                            <label for="register-password" class="sr-only">Password</label>
                            <input id="register-password" name="password" type="password" required class="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm" placeholder="Password">
                        </div>
                    </div>

                    <div>
                        <button type="submit" class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                            Create Account
                        </button>
                    </div>
                    
                    <div class="text-sm text-center">
                        <a href="#" id="to-login-link" class="font-medium text-blue-600 hover:text-blue-500">
                            Already have an account? Sign in
                        </a>
                    </div>
                </form>
            </div>
        </div>

        <div class="flex h-screen" id="main-container" style="display: none;">
            <!-- 左ペイン: ツリー表示 -->
            <div class="bg-white border-r border-gray-200 flex flex-col" id="tree-pane" style="width: 33.333%">
                <!-- 固定ヘッダー部分 -->
                <div class="p-4 flex-shrink-0">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <span id="current-username" class="text-sm font-semibold text-gray-700"></span>
                            <button id="logout-btn" class="text-xs text-gray-500 hover:text-red-500" title="Sign out">
                                <i class="fas fa-sign-out-alt"></i>
                            </button>
                        </div>
                    </div>
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

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
