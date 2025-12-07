import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

// 静的ファイル配信
app.use('/static/*', serveStatic({ root: './public' }))

// ===============================
// API Routes
// ===============================

// 全ノード取得
app.get('/api/nodes', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM nodes ORDER BY position, created_at'
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

// 子ノード取得
app.get('/api/nodes/:id/children', async (c) => {
  try {
    const id = c.req.param('id')
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM nodes WHERE parent_id = ? ORDER BY position, created_at'
    ).bind(id).all()
    
    return c.json({ success: true, data: results })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// ルートノード取得
app.get('/api/nodes/root/list', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM nodes WHERE parent_id IS NULL ORDER BY position, created_at'
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
    const { parent_id, title, content, author, position } = body
    
    if (!title || !author) {
      return c.json({ success: false, error: 'Title and author are required' }, 400)
    }
    
    const result = await c.env.DB.prepare(
      `INSERT INTO nodes (parent_id, title, content, author, position) 
       VALUES (?, ?, ?, ?, ?) RETURNING *`
    ).bind(
      parent_id || null,
      title,
      content || '',
      author,
      position || 0
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
    const { title, content, author, position } = body
    
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
       SET title = ?, content = ?, author = ?, position = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      title !== undefined ? title : existing.title,
      content !== undefined ? content : existing.content,
      author !== undefined ? author : existing.author,
      position !== undefined ? position : existing.position,
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

// ノード削除
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

// ノードの親変更
app.patch('/api/nodes/:id/parent', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { parent_id, position } = body
    
    // 循環参照チェック（自分自身または自分の子孫を親にできない）
    if (parent_id) {
      const checkCircular = async (nodeId: string, targetId: string): Promise<boolean> => {
        if (nodeId === targetId) return true
        const node = await c.env.DB.prepare('SELECT parent_id FROM nodes WHERE id = ?').bind(nodeId).first()
        if (!node || !node.parent_id) return false
        return checkCircular(String(node.parent_id), targetId)
      }
      
      if (await checkCircular(parent_id, id)) {
        return c.json({ success: false, error: 'Circular reference detected' }, 400)
      }
    }
    
    await c.env.DB.prepare(
      'UPDATE nodes SET parent_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(parent_id || null, position || 0, id).run()
    
    const updated = await c.env.DB.prepare('SELECT * FROM nodes WHERE id = ?').bind(id).first()
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
        <title>アウトラインエディタ</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
          .tree-item {
            cursor: move;
            user-select: none;
          }
          .tree-item:hover {
            background-color: #f3f4f6;
          }
          .tree-item.active {
            background-color: #dbeafe;
            border-left: 3px solid #3b82f6;
          }
          .tree-item.dragging {
            opacity: 0.5;
          }
          .tree-item.drag-over {
            border-top: 2px solid #3b82f6;
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
            min-height: 400px;
          }
          .search-highlight {
            background-color: #fef08a;
            font-weight: 600;
          }
        </style>
    </head>
    <body class="bg-gray-50">
        <div class="flex h-screen">
            <!-- 左ペイン: ツリー表示 -->
            <div class="w-1/3 bg-white border-r border-gray-200 p-4 overflow-y-auto">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold text-gray-800">
                        <i class="fas fa-sitemap mr-2"></i>
                        アウトライン
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
                
                <div id="tree-container"></div>
            </div>

            <!-- 右ペイン: ノード詳細 -->
            <div class="flex-1 p-6 overflow-y-auto">
                <div id="editor-panel" class="bg-white rounded-lg shadow p-6">
                    <div class="text-center text-gray-400 py-12">
                        <i class="fas fa-arrow-left text-4xl mb-4"></i>
                        <p>左側のノードを選択してください</p>
                    </div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
