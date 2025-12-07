// ===============================
// グローバル状態管理
// ===============================
let nodes = []
let selectedNodeId = null
let expandedNodes = new Set()

// ===============================
// API呼び出し
// ===============================
async function fetchNodes() {
  try {
    const response = await axios.get('/api/nodes')
    if (response.data.success) {
      nodes = response.data.data
      renderTree()
    }
  } catch (error) {
    console.error('Failed to fetch nodes:', error)
    alert('ノードの取得に失敗しました')
  }
}

async function fetchNodeById(id) {
  try {
    const response = await axios.get(`/api/nodes/${id}`)
    if (response.data.success) {
      return response.data.data
    }
  } catch (error) {
    console.error('Failed to fetch node:', error)
    return null
  }
}

async function createNode(nodeData) {
  try {
    const response = await axios.post('/api/nodes', nodeData)
    if (response.data.success) {
      await fetchNodes()
      return response.data.data
    }
  } catch (error) {
    console.error('Failed to create node:', error)
    alert('ノードの作成に失敗しました')
    return null
  }
}

async function updateNode(id, nodeData) {
  try {
    const response = await axios.put(`/api/nodes/${id}`, nodeData)
    if (response.data.success) {
      await fetchNodes()
      return response.data.data
    }
  } catch (error) {
    console.error('Failed to update node:', error)
    alert('ノードの更新に失敗しました')
    return null
  }
}

async function deleteNode(id) {
  if (!confirm('このノードを削除しますか？\n（子ノードも削除されます）')) {
    return false
  }
  
  try {
    const response = await axios.delete(`/api/nodes/${id}`)
    if (response.data.success) {
      if (selectedNodeId === id) {
        selectedNodeId = null
        renderEditor()
      }
      await fetchNodes()
      return true
    }
  } catch (error) {
    console.error('Failed to delete node:', error)
    alert('ノードの削除に失敗しました')
    return false
  }
}

// ===============================
// ツリー表示
// ===============================
function buildTree() {
  const nodeMap = new Map()
  const rootNodes = []
  
  // ノードをマップに格納
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [] })
  })
  
  // 親子関係を構築
  nodes.forEach(node => {
    if (node.parent_id === null) {
      rootNodes.push(nodeMap.get(node.id))
    } else if (nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id).children.push(nodeMap.get(node.id))
    }
  })
  
  return rootNodes
}

function renderTree() {
  const treeContainer = document.getElementById('tree-container')
  const tree = buildTree()
  
  if (tree.length === 0) {
    treeContainer.innerHTML = `
      <div class="text-center text-gray-400 py-8">
        <i class="fas fa-folder-open text-3xl mb-2"></i>
        <p>ノードがありません</p>
        <p class="text-sm">右上の「ルート追加」ボタンから作成できます</p>
      </div>
    `
    return
  }
  
  treeContainer.innerHTML = tree.map(node => renderTreeNode(node, 0)).join('')
  
  // イベントリスナーを再設定
  attachTreeEventListeners()
}

function renderTreeNode(node, level) {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedNodes.has(node.id)
  const isSelected = selectedNodeId === node.id
  const indent = level * 20
  
  let html = `
    <div>
      <div class="tree-item flex items-center py-2 px-2 rounded ${isSelected ? 'active' : ''}" 
           style="padding-left: ${indent + 8}px"
           data-node-id="${node.id}">
        ${hasChildren ? `
          <i class="fas fa-chevron-${isExpanded ? 'down' : 'right'} text-gray-400 mr-2 w-3 toggle-icon" 
             data-node-id="${node.id}"></i>
        ` : `
          <span class="w-3 mr-2"></span>
        `}
        <i class="fas fa-file-alt text-blue-500 mr-2"></i>
        <span class="flex-1 text-sm">${escapeHtml(node.title)}</span>
        <button class="add-child-btn text-gray-400 hover:text-blue-500 text-xs px-2" 
                data-node-id="${node.id}" 
                title="子ノードを追加">
          <i class="fas fa-plus"></i>
        </button>
      </div>
      ${hasChildren ? `
        <div class="tree-children ${isExpanded ? 'expanded' : ''}">
          ${node.children.map(child => renderTreeNode(child, level + 1)).join('')}
        </div>
      ` : ''}
    </div>
  `
  
  return html
}

function attachTreeEventListeners() {
  // ノード選択
  document.querySelectorAll('.tree-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('toggle-icon') || 
          e.target.classList.contains('add-child-btn') ||
          e.target.closest('.add-child-btn')) {
        return
      }
      
      const nodeId = parseInt(item.dataset.nodeId)
      selectNode(nodeId)
    })
  })
  
  // ツリー展開/折りたたみ
  document.querySelectorAll('.toggle-icon').forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation()
      const nodeId = parseInt(icon.dataset.nodeId)
      toggleNode(nodeId)
    })
  })
  
  // 子ノード追加
  document.querySelectorAll('.add-child-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const parentId = parseInt(btn.dataset.nodeId)
      await addChildNode(parentId)
    })
  })
}

function toggleNode(nodeId) {
  if (expandedNodes.has(nodeId)) {
    expandedNodes.delete(nodeId)
  } else {
    expandedNodes.add(nodeId)
  }
  renderTree()
}

async function selectNode(nodeId) {
  selectedNodeId = nodeId
  renderTree()
  
  const node = await fetchNodeById(nodeId)
  if (node) {
    renderEditor(node)
  }
}

// ===============================
// エディタ表示
// ===============================
function renderEditor(node = null) {
  const editorPanel = document.getElementById('editor-panel')
  
  if (!node) {
    editorPanel.innerHTML = `
      <div class="text-center text-gray-400 py-12">
        <i class="fas fa-arrow-left text-4xl mb-4"></i>
        <p>左側のノードを選択してください</p>
      </div>
    `
    return
  }
  
  editorPanel.innerHTML = `
    <div class="mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold text-gray-800">ノード詳細</h2>
        <button id="delete-node-btn" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
          <i class="fas fa-trash mr-2"></i>削除
        </button>
      </div>
      
      <div class="space-y-4">
        <!-- タイトル -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            <i class="fas fa-heading mr-1"></i>タイトル
          </label>
          <input type="text" id="node-title" 
                 value="${escapeHtml(node.title)}"
                 class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent">
        </div>
        
        <!-- 内容 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            <i class="fas fa-align-left mr-1"></i>内容
          </label>
          <textarea id="node-content" rows="12"
                    class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent">${escapeHtml(node.content || '')}</textarea>
        </div>
        
        <!-- 作成者 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            <i class="fas fa-user mr-1"></i>作成者
          </label>
          <input type="text" id="node-author" 
                 value="${escapeHtml(node.author)}"
                 class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent">
        </div>
        
        <!-- メタ情報 -->
        <div class="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <label class="block text-xs text-gray-500 mb-1">
              <i class="fas fa-calendar-plus mr-1"></i>作成日
            </label>
            <div class="text-sm text-gray-700">${formatDate(node.created_at)}</div>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">
              <i class="fas fa-calendar-check mr-1"></i>更新日
            </label>
            <div class="text-sm text-gray-700">${formatDate(node.updated_at)}</div>
          </div>
        </div>
        
        <!-- 保存ボタン -->
        <div class="flex justify-end pt-4">
          <button id="save-node-btn" class="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            <i class="fas fa-save mr-2"></i>保存
          </button>
        </div>
      </div>
    </div>
  `
  
  // イベントリスナーを設定
  document.getElementById('save-node-btn').addEventListener('click', () => saveCurrentNode())
  document.getElementById('delete-node-btn').addEventListener('click', () => deleteCurrentNode())
}

async function saveCurrentNode() {
  if (!selectedNodeId) return
  
  const title = document.getElementById('node-title').value.trim()
  const content = document.getElementById('node-content').value.trim()
  const author = document.getElementById('node-author').value.trim()
  
  if (!title) {
    alert('タイトルを入力してください')
    return
  }
  
  if (!author) {
    alert('作成者を入力してください')
    return
  }
  
  const updated = await updateNode(selectedNodeId, { title, content, author })
  if (updated) {
    alert('保存しました')
    await selectNode(selectedNodeId) // リロード
  }
}

async function deleteCurrentNode() {
  if (!selectedNodeId) return
  
  const success = await deleteNode(selectedNodeId)
  if (success) {
    selectedNodeId = null
    renderEditor()
  }
}

// ===============================
// ノード追加
// ===============================
async function addRootNode() {
  const title = prompt('ルートノードのタイトルを入力してください:')
  if (!title || !title.trim()) return
  
  const author = prompt('作成者名を入力してください:', 'Admin')
  if (!author || !author.trim()) return
  
  const node = await createNode({
    parent_id: null,
    title: title.trim(),
    content: '',
    author: author.trim(),
    position: 0
  })
  
  if (node) {
    expandedNodes.add(node.id)
    await selectNode(node.id)
  }
}

async function addChildNode(parentId) {
  const title = prompt('子ノードのタイトルを入力してください:')
  if (!title || !title.trim()) return
  
  const author = prompt('作成者名を入力してください:', 'Admin')
  if (!author || !author.trim()) return
  
  const node = await createNode({
    parent_id: parentId,
    title: title.trim(),
    content: '',
    author: author.trim(),
    position: 0
  })
  
  if (node) {
    expandedNodes.add(parentId)
    await selectNode(node.id)
  }
}

// ===============================
// ユーティリティ
// ===============================
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text || ''
  return div.innerHTML
}

function formatDate(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// ===============================
// 初期化
// ===============================
document.addEventListener('DOMContentLoaded', () => {
  // ルートノード追加ボタン
  document.getElementById('add-root-btn').addEventListener('click', addRootNode)
  
  // 初期データ読み込み
  fetchNodes()
})
