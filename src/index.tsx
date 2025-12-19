import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// ビルド番号のグローバル型定義
declare const __BUILD_NUMBER__: string

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

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
