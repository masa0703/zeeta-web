// ===============================
// グローバル状態管理
// ===============================
let currentTreeId = null // Current tree ID
let currentUser = null // Current user info
let currentUserRole = null // Current user's role in this tree ('owner', 'editor', 'viewer')
let currentTree = null // Current tree info
let treeMembers = [] // Tree members for author selection
let nodes = []
let relations = []
let selectedNodeId = null
let selectedNodeVersion = null // Current node version for optimistic locking
let selectedNodePath = null // 現在選択されているノードのパス (例: "1-2-5")
let selectedNodeElement = null // 現在選択されているDOM要素
let expandedNodes = new Set()
let searchQuery = ''
let searchResults = []
let clipboard = null // コピーしたノードのID
let treeViewMode = 'normal' // 'normal' or 'reverse'

// ===============================
// ユーティリティ関数
// ===============================

// ローディングオーバーレイの表示/非表示
function showLoading() {
  let overlay = document.getElementById('loading-overlay')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = 'loading-overlay'
    overlay.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <div class="loading-text">処理中...</div>
      </div>
    `
    document.body.appendChild(overlay)
  }
  overlay.style.display = 'flex'
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay')
  if (overlay) {
    overlay.style.display = 'none'
  }
}

// カスタムプロンプトモーダル
function showPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    // モーダルを作成
    let modal = document.getElementById('custom-prompt-modal')
    if (!modal) {
      modal = document.createElement('div')
      modal.id = 'custom-prompt-modal'
      modal.innerHTML = `
        <div class="prompt-overlay"></div>
        <div class="prompt-dialog">
          <div class="prompt-message"></div>
          <input type="text" class="prompt-input" />
          <div class="prompt-buttons">
            <button type="button" class="prompt-cancel">キャンセル</button>
            <button type="button" class="prompt-ok">OK</button>
          </div>
        </div>
      `
      document.body.appendChild(modal)

      // スタイルを追加
      const style = document.createElement('style')
      style.textContent = `
        #custom-prompt-modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10000;
        }
        #custom-prompt-modal .prompt-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
        }
        #custom-prompt-modal .prompt-dialog {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          border-radius: 8px;
          padding: 24px;
          min-width: 400px;
          max-width: 90%;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }
        #custom-prompt-modal .prompt-message {
          font-size: 16px;
          color: #333;
          margin-bottom: 16px;
        }
        #custom-prompt-modal .prompt-input {
          width: 100%;
          font-size: 16px;
          padding: 12px;
          border: 2px solid #e2e8f0;
          border-radius: 6px;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.2s;
        }
        #custom-prompt-modal .prompt-input:focus {
          border-color: #667eea;
        }
        #custom-prompt-modal .prompt-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 20px;
        }
        #custom-prompt-modal .prompt-cancel {
          padding: 10px 20px;
          font-size: 14px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          background: #e2e8f0;
          color: #4a5568;
        }
        #custom-prompt-modal .prompt-cancel:hover {
          background: #cbd5e0;
        }
        #custom-prompt-modal .prompt-ok {
          padding: 10px 20px;
          font-size: 14px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          background: #667eea;
          color: white;
        }
        #custom-prompt-modal .prompt-ok:hover {
          background: #5a67d8;
        }
      `
      document.head.appendChild(style)
    }

    const messageEl = modal.querySelector('.prompt-message')
    const inputEl = modal.querySelector('.prompt-input')
    const cancelBtn = modal.querySelector('.prompt-cancel')
    const okBtn = modal.querySelector('.prompt-ok')
    const overlay = modal.querySelector('.prompt-overlay')

    messageEl.textContent = message
    inputEl.value = defaultValue

    modal.style.display = 'block'
    inputEl.focus()
    inputEl.select()

    function cleanup() {
      modal.style.display = 'none'
      inputEl.removeEventListener('keydown', handleKeydown)
      cancelBtn.removeEventListener('click', handleCancel)
      okBtn.removeEventListener('click', handleOk)
      overlay.removeEventListener('click', handleCancel)
    }

    function handleCancel() {
      cleanup()
      resolve(null)
    }

    function handleOk() {
      cleanup()
      resolve(inputEl.value)
    }

    function handleKeydown(e) {
      if (e.key === 'Enter') {
        handleOk()
      } else if (e.key === 'Escape') {
        handleCancel()
      }
    }

    inputEl.addEventListener('keydown', handleKeydown)
    cancelBtn.addEventListener('click', handleCancel)
    okBtn.addEventListener('click', handleOk)
    overlay.addEventListener('click', handleCancel)
  })
}

// トースト通知の表示
function showToast(message, type = 'success', duration = 5000) {
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`

  // アイコンを決定
  const icon = type === 'success' ? '✓' : '⚠'

  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <span class="toast-message">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `
  document.body.appendChild(toast)

  // アニメーション用にちょっと遅延
  setTimeout(() => toast.classList.add('show'), 10)

  // 自動削除
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 300)
  }, duration)
}

// ===============================
// Authentication & Tree Context
// ===============================

/**
 * Check if user is authenticated
 */
async function checkAuth() {
  try {
    const response = await axios.get('/auth/me')
    if (response.data.success && response.data.data) {
      currentUser = response.data.data
      return true
    }
    return false
  } catch (error) {
    console.error('Auth check failed:', error)
    return false
  }
}

/**
 * Get tree ID from URL query parameter
 */
function getTreeIdFromURL() {
  const params = new URLSearchParams(window.location.search)
  const treeId = params.get('tree')
  return treeId ? parseInt(treeId) : null
}

/**
 * Load tree information and check access
 */
async function loadTreeContext() {
  currentTreeId = getTreeIdFromURL()

  if (!currentTreeId) {
    showToast('ツリーIDが指定されていません', 'error')
    setTimeout(() => {
      window.location.href = '/my-page.html'
    }, 2000)
    return false
  }

  try {
    // Get tree info
    const treeRes = await axios.get(`/api/trees/${currentTreeId}`)
    if (!treeRes.data.success) {
      showToast('ツリー情報の取得に失敗しました', 'error')
      setTimeout(() => {
        window.location.href = '/my-page.html'
      }, 2000)
      return false
    }

    currentTree = treeRes.data.data

    // Get user's role in this tree
    const treesRes = await axios.get('/api/trees')
    if (treesRes.data.success) {
      const userTree = treesRes.data.data.find(t => t.id === currentTreeId)
      if (userTree) {
        currentUserRole = userTree.role
      } else {
        showToast('このツリーへのアクセス権がありません', 'error')
        setTimeout(() => {
          window.location.href = '/my-page.html'
        }, 2000)
        return false
      }
    }

    // Update UI with tree context
    updateTreeHeader()
    return true
  } catch (error) {
    console.error('Failed to load tree context:', error)
    showToast('ツリー情報の読み込みに失敗しました', 'error')
    setTimeout(() => {
      window.location.href = '/my-page.html'
    }, 2000)
    return false
  }
}

/**
 * Update header with tree information
 */
function updateTreeHeader() {
  // Add header if it doesn't exist
  let header = document.getElementById('tree-header')
  if (!header) {
    header = document.createElement('div')
    header.id = 'tree-header'
    header.style.cssText = `
      background: white;
      border-bottom: 2px solid #e2e8f0;
      padding: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
    `
    document.body.insertBefore(header, document.body.firstChild)
  }

  const roleLabels = {
    owner: 'オーナー',
    editor: '編集者',
    viewer: '閲覧者'
  }

  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 1rem;">
      <a href="/my-page.html" style="color: #667eea; text-decoration: none; font-weight: 600;">
        ← マイページ
      </a>
      <span style="color: #cbd5e0;">|</span>
      <h1 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: #2d3748;">
        ${escapeHtml(currentTree.name)}
      </h1>
      <span style="
        background: ${currentUserRole === 'owner' ? '#667eea' : currentUserRole === 'editor' ? '#48bb78' : '#4299e1'};
        color: white;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
      ">
        ${roleLabels[currentUserRole] || currentUserRole}
      </span>
      ${currentUserRole === 'viewer' ? '<span style="color: #e53e3e; font-size: 0.875rem; font-weight: 500;">閲覧専用</span>' : ''}
    </div>
  `

  // Disable editing controls if viewer
  if (currentUserRole === 'viewer') {
    disableEditingForViewer()
  }
}

/**
 * Disable editing controls for viewer role
 */
function disableEditingForViewer() {
  // Disable all input fields and buttons related to editing
  const editControls = [
    '#node-title',
    '#node-content',
    '#node-author',
    '#new-node-title',
    '#new-node-content',
    '#add-root-btn',
    '#save-node-btn',
    '#create-node-btn',
    '#update-node-btn',
    '#delete-node-btn',
    '.add-child-btn',
    '.delete-relation-btn'
  ]

  editControls.forEach(selector => {
    const elements = document.querySelectorAll(selector)
    elements.forEach(el => {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.disabled = true
        el.style.backgroundColor = '#f7fafc'
      } else if (el.tagName === 'BUTTON') {
        el.disabled = true
        el.style.opacity = '0.5'
        el.style.cursor = 'not-allowed'
      }
    })
  })

  // Show viewer notice
  showToast('閲覧専用モードです。編集はできません。', 'info', 8000)
}

/**
 * Check if user can edit (owner or editor)
 */
function canEdit() {
  return currentUserRole === 'owner' || currentUserRole === 'editor'
}

/**
 * Logout
 */
async function logout() {
  try {
    await axios.post('/auth/logout')
    window.location.href = '/login.html'
  } catch (error) {
    console.error('Logout failed:', error)
    window.location.href = '/login.html'
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// ===============================
// API呼び出し
// ===============================
async function fetchVersion() {
  try {
    const res = await axios.get('/api/version')
    if (res.data.success) {
      const versionBadge = document.getElementById('version-badge')
      if (versionBadge) {
        versionBadge.textContent = res.data.data.version
      }
    }
  } catch (error) {
    console.error('Failed to fetch version:', error)
  }
}

async function fetchNodes() {
  if (!currentTreeId) {
    console.error('No tree ID set')
    return
  }

  try {
    const [nodesRes, relationsRes, membersRes] = await Promise.all([
      axios.get(`/api/trees/${currentTreeId}/nodes`),
      axios.get(`/api/trees/${currentTreeId}/relations`),
      axios.get(`/api/trees/${currentTreeId}/members`)
    ])

    if (nodesRes.data.success && relationsRes.data.success) {
      nodes = nodesRes.data.data
      relations = relationsRes.data.data
      renderTree()
    }

    // Store tree members for author selection (only editors and owners can be authors)
    if (membersRes.data.success) {
      treeMembers = membersRes.data.data.filter(m => m.role === 'owner' || m.role === 'editor')
    }
  } catch (error) {
    console.error('Failed to fetch nodes:', error)
    if (error.response?.status === 403) {
      showToast('このツリーへのアクセス権がありません', 'error')
      setTimeout(() => {
        window.location.href = '/my-page.html'
      }, 2000)
    } else {
      showToast('ノードの取得に失敗しました', 'error')
    }
  }
}

async function addRelation(parentId, childId) {
  if (!canEdit()) {
    showToast('編集権限がありません', 'error')
    return false
  }

  try {
    const response = await axios.post(`/api/trees/${currentTreeId}/relations`, {
      parent_node_id: parentId,
      child_node_id: childId
    })

    if (response.data.success) {
      await fetchNodes()
      return true
    }
  } catch (error) {
    console.error('Failed to add relation:', error)
    console.error('Error details:', error.response?.data)
    if (error.response?.data?.error === 'Circular reference detected') {
      showToast('循環参照です。この操作はできません。', 'error')
    } else if (error.response?.data?.error === 'Relation already exists') {
      showToast('この親子関係はすでに存在します', 'error')
    } else if (error.response?.data?.error) {
      showToast(`親子関係の追加に失敗: ${error.response.data.error}`, 'error')
    } else {
      showToast('親子関係の追加に失敗しました', 'error')
    }
    return false
  }
}

async function removeRelation(parentId, childId) {
  if (!canEdit()) {
    showToast('編集権限がありません', 'error')
    return false
  }

  try {
    const response = await axios.delete(`/api/trees/${currentTreeId}/relations/${parentId}/${childId}`)
    if (response.data.success) {
      await fetchNodes()
      return true
    }
  } catch (error) {
    console.error('Failed to remove relation:', error)
    showToast('親子関係の削除に失敗しました', 'error')
    return false
  }
}

async function fetchNodeById(id) {
  try {
    const response = await axios.get(`/api/trees/${currentTreeId}/nodes/${id}`)
    if (response.data.success) {
      return response.data.data
    }
  } catch (error) {
    console.error('Failed to fetch node:', error)
    return null
  }
}

async function createNode(nodeData) {
  if (!canEdit()) {
    showToast('編集権限がありません', 'error')
    return null
  }

  try {
    const response = await axios.post(`/api/trees/${currentTreeId}/nodes`, nodeData)
    if (response.data.success) {
      await fetchNodes()
      showToast('ノードを追加しました', 'success')
      return response.data.data
    }
  } catch (error) {
    console.error('Failed to create node:', error)
    showToast('ノードの作成に失敗しました', 'error')
    return null
  }
}

async function updateNode(id, nodeData) {
  if (!canEdit()) {
    showToast('編集権限がありません', 'error')
    return null
  }

  try {
    const response = await axios.put(`/api/trees/${currentTreeId}/nodes/${id}`, nodeData)
    if (response.data.success) {
      await fetchNodes()
      return response.data.data
    }
  } catch (error) {
    console.error('Failed to update node:', error)

    // Handle version conflict (409)
    if (error.response && error.response.status === 409) {
      const conflictData = error.response.data
      await handleVersionConflict(id, nodeData, conflictData)
      return null
    }

    showToast('ノードの更新に失敗しました', 'error')
    return null
  }
}

async function deleteNode(id) {
  if (!canEdit()) {
    showToast('編集権限がありません', 'error')
    return false
  }

  if (!confirm('このノードを削除しますか？\n（子ノードは削除されません）')) {
    return false
  }

  try {
    const response = await axios.delete(`/api/trees/${currentTreeId}/nodes/${id}`)
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
    showToast('ノードの削除に失敗しました', 'error')
    return false
  }
}

// Handle version conflict
async function handleVersionConflict(nodeId, yourData, conflictData) {
  const dialog = document.getElementById('conflict-dialog')
  const serverData = conflictData.server_data

  // Fill in your changes
  document.getElementById('conflict-your-title').textContent = yourData.title
  document.getElementById('conflict-your-content').textContent = yourData.content || ''

  // Fill in server version
  document.getElementById('conflict-server-title').textContent = serverData.title
  document.getElementById('conflict-server-content').textContent = serverData.content || ''
  document.getElementById('conflict-server-author').textContent = serverData.author || 'Unknown'
  document.getElementById('conflict-server-version').textContent = conflictData.current_version

  // Show dialog
  dialog.classList.remove('hidden')
  dialog.classList.add('flex')

  // Wait for user choice
  return new Promise((resolve) => {
    const cleanup = () => {
      dialog.classList.remove('flex')
      dialog.classList.add('hidden')
      useServerBtn.removeEventListener('click', handleUseServer)
      useMineBtn.removeEventListener('click', handleUseMine)
      cancelBtn.removeEventListener('click', handleCancel)
      closeBtn.removeEventListener('click', handleCancel)
    }

    const handleUseServer = async () => {
      cleanup()
      // Reload the node to get server version
      await selectNode(nodeId)
      showToast('サーバーの最新版を読み込みました', 'info')
      resolve('server')
    }

    const handleUseMine = async () => {
      cleanup()
      // Force update with server version number
      showLoading()
      try {
        const response = await axios.put(`/api/trees/${currentTreeId}/nodes/${nodeId}`, {
          ...yourData,
          version: conflictData.current_version
        })
        if (response.data.success) {
          await fetchNodes()
          await selectNode(nodeId)
          showToast('あなたの変更を保存しました', 'success')
          resolve('mine')
        }
      } catch (error) {
        console.error('Failed to force update:', error)
        showToast('保存に失敗しました', 'error')
        resolve('error')
      } finally {
        hideLoading()
      }
    }

    const handleCancel = () => {
      cleanup()
      showToast('保存をキャンセルしました', 'info')
      resolve('cancel')
    }

    const useServerBtn = document.getElementById('conflict-use-server')
    const useMineBtn = document.getElementById('conflict-use-mine')
    const cancelBtn = document.getElementById('conflict-cancel')
    const closeBtn = document.getElementById('conflict-dialog-close')

    useServerBtn.addEventListener('click', handleUseServer)
    useMineBtn.addEventListener('click', handleUseMine)
    cancelBtn.addEventListener('click', handleCancel)
    closeBtn.addEventListener('click', handleCancel)
  })
}

async function moveNode(nodeId, newParentId, newPosition) {
  try {
    const response = await axios.patch(`/api/nodes/${nodeId}/parent`, {
      parent_id: newParentId,
      position: newPosition
    })
    if (response.data.success) {
      await fetchNodes()
      return true
    }
  } catch (error) {
    console.error('Failed to move node:', error)
    if (error.response?.data?.error === 'Circular reference detected') {
      showToast('循環参照は許可されていません', 'error')
    } else {
      showToast('ノードの移動に失敗しました', 'error')
    }
    return false
  }
}

// 同じ階層の全ノードの position を一括更新
async function reorderNodes(container) {
  showLoading()
  try {
    // コンテナ内の全ノードを取得（DOM順）
    const nodeElements = container.querySelectorAll(':scope > [data-node-group]')

    // 親ノードIDを特定
    let parentId = null
    if (container.id === 'tree-container') {
      // ルートレベル: parentIdはnull（ルートノード）
      parentId = null
    } else {
      // 子レベル: data-parent属性から親IDを取得
      parentId = parseInt(container.dataset.parent)
    }

    // 各ノードの position を順番に更新
    const updates = []
    nodeElements.forEach((element, index) => {
      const treeItem = element.querySelector('.tree-item')
      const nodeId = parseInt(treeItem.dataset.nodeId)

      if (parentId !== null) {
        // 親子関係のposition更新
        updates.push(
          axios.patch(`/api/relations/${parentId}/${nodeId}/position`, {
            position: index
          })
        )
      } else {
        // ルートノードのroot_position更新
        updates.push(
          axios.patch(`/api/nodes/${nodeId}/root-position`, {
            root_position: index
          })
        )
      }
    })

    // 全ての更新を並列実行
    await Promise.all(updates)
    await fetchNodes()
    return true
  } catch (error) {
    console.error('Failed to reorder nodes:', error)
    showToast('並び替えに失敗しました', 'error')
    return false
  } finally {
    hideLoading()
  }
}

async function searchNodes(query) {
  try {
    const response = await axios.get(`/api/search?q=${encodeURIComponent(query)}`)
    if (response.data.success) {
      return response.data.data
    }
  } catch (error) {
    console.error('Failed to search nodes:', error)
    return []
  }
}

// ===============================
// 検索機能
// ===============================
let searchTimeout = null

function handleSearchInput(event) {
  const query = event.target.value.trim()

  // クリアボタンの表示/非表示
  const clearBtn = document.getElementById('clear-search-btn')
  if (query) {
    clearBtn.classList.remove('hidden')
  } else {
    clearBtn.classList.add('hidden')
  }

  // デバウンス処理
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(async () => {
    await performSearch(query)
  }, 300)
}

async function performSearch(query) {
  searchQuery = query

  if (!query) {
    searchResults = []
    document.getElementById('search-results').classList.add('hidden')
    renderTree()
    return
  }

  searchResults = await searchNodes(query)

  // 検索結果表示
  const resultsDiv = document.getElementById('search-results')
  if (searchResults.length > 0) {
    resultsDiv.textContent = `${searchResults.length}件見つかりました`
    resultsDiv.classList.remove('hidden')

    // 検索結果のノードを展開
    searchResults.forEach(node => {
      expandParents(node.id)
    })
  } else {
    resultsDiv.textContent = '見つかりませんでした'
    resultsDiv.classList.remove('hidden')
  }

  renderTree()
}

function clearSearch() {
  document.getElementById('search-input').value = ''
  document.getElementById('clear-search-btn').classList.add('hidden')
  document.getElementById('search-results').classList.add('hidden')
  searchQuery = ''
  searchResults = []
  renderTree()
}

function expandParents(nodeId) {
  // node_relations から親ノードを取得
  const parentRelations = relations.filter(rel => rel.child_node_id === nodeId)

  parentRelations.forEach(rel => {
    expandedNodes.add(rel.parent_node_id)
    expandParents(rel.parent_node_id)  // 再帰的に親の親も展開
  })
}

function highlightText(text, query) {
  if (!query || !text) return escapeHtml(text)

  const escapedText = escapeHtml(text)
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi')
  return escapedText.replace(regex, '<span class="search-highlight">$1</span>')
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ===============================
// ツリー表示
// ===============================
function buildTree() {
  const nodeMap = new Map()
  const rootNodes = []
  const childNodeIds = new Set()

  // ノードをマップに格納
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [], parents: [] })
  })

  // リレーションベースで親子関係を構築
  // 各リレーションのpositionを子ノードに保持
  relations.forEach(rel => {
    const parent = nodeMap.get(rel.parent_node_id)
    const child = nodeMap.get(rel.child_node_id)

    if (parent && child) {
      // 子ノードにこのリレーション固有のpositionを付与
      const childWithPosition = { ...child, relationPosition: rel.position || 0 }
      parent.children.push(childWithPosition)
      child.parents.push(parent)
      childNodeIds.add(rel.child_node_id)
    }
  })

  // 各親ノードの children を relationPosition でソート
  nodeMap.forEach(node => {
    if (node.children.length > 0) {
      node.children.sort((a, b) => {
        if (a.relationPosition !== b.relationPosition) {
          return a.relationPosition - b.relationPosition
        }
        return new Date(a.created_at) - new Date(b.created_at)
      })
    }
  })

  // 親を持たないノードをルートとする
  nodes.forEach(node => {
    if (!childNodeIds.has(node.id)) {
      rootNodes.push(nodeMap.get(node.id))
    }
  })

  // ルートノードは root_position でソート
  rootNodes.sort((a, b) => {
    if (a.root_position !== b.root_position) {
      return a.root_position - b.root_position
    }
    return new Date(a.created_at) - new Date(b.created_at)
  })

  return rootNodes
}

// 逆ツリー構築（選択ノード→親の方向）
function buildReverseTree() {
  // 選択されたノードがない場合は空配列を返す
  if (!selectedNodeId) {
    return []
  }

  const nodeMap = new Map()

  // ノードをマップに格納
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [], parents: [] })
  })

  // リレーションベースで親子関係を構築（逆向き）
  relations.forEach(rel => {
    const parent = nodeMap.get(rel.parent_node_id)
    const child = nodeMap.get(rel.child_node_id)

    if (parent && child) {
      // 逆ツリーでは、子ノードの children に親ノードを追加
      // リレーション作成順を保持
      const parentWithOrder = { ...parent, relationCreatedAt: rel.created_at }
      child.children.push(parentWithOrder)
      parent.parents.push(child)
    }
  })

  // 各ノードの children をリレーション作成順でソート（逆ツリーの親ノード表示順）
  nodeMap.forEach(node => {
    if (node.children.length > 0) {
      node.children.sort((a, b) => {
        return new Date(a.relationCreatedAt || a.created_at) - new Date(b.relationCreatedAt || b.created_at)
      })
    }
  })

  // 選択されたノードのみをルートとする
  const selectedNode = nodeMap.get(selectedNodeId)
  return selectedNode ? [selectedNode] : []
}

function renderTree() {
  const treeContainer = document.getElementById('tree-container')
  const tree = treeViewMode === 'reverse' ? buildReverseTree() : buildTree()

  if (tree.length === 0) {
    if (treeViewMode === 'reverse') {
      treeContainer.innerHTML = `
        <div class="text-center text-gray-400 py-8">
          <i class="fas fa-arrow-left text-3xl mb-2"></i>
          <p>逆ツリー表示</p>
          <p class="text-sm">左側のノードを選択してください</p>
          <p class="text-xs mt-2">選択したノードから親方向にツリーが表示されます</p>
        </div>
      `
    } else {
      treeContainer.innerHTML = `
        <div class="text-center text-gray-400 py-8">
          <i class="fas fa-folder-open text-3xl mb-2"></i>
          <p>ノードがありません</p>
          <p class="text-sm">右上の「ルート追加」ボタンから作成できます</p>
        </div>
      `
    }
    return
  }

  treeContainer.innerHTML = tree.map(node => renderTreeNode(node, 0, new Set(), String(node.id))).join('')

  // イベントリスナーを再設定
  attachTreeEventListeners()

  // 選択状態の復元
  restoreSelection()

  // ドラッグ&ドロップの設定（通常モードのみ）
  if (treeViewMode === 'normal') {
    setupDragAndDrop()
  }
}

function renderTreeNode(node, level, visitedNodes = new Set(), currentPath) {
  // 循環参照防止
  if (visitedNodes.has(node.id)) {
    return `<div class="text-xs text-gray-400 ml-${level * 5}">[循環参照]</div>`
  }

  visitedNodes.add(node.id)

  // パスが渡されていない場合はIDを使用（ルートの場合など）
  if (!currentPath) currentPath = String(node.id)

  const hasChildren = node.children.length > 0
  const isExpanded = expandedNodes.has(node.id)
  // パスが一致する場合のみ選択状態とする
  const isSelected = selectedNodePath === currentPath
  // 同じIDだがパスが違う場合は重複ノード
  const isDuplicate = selectedNodeId === node.id && !isSelected

  const isSearchResult = searchResults.some(r => r.id === node.id)
  // 通常モードのみ複数親バッジを表示
  const hasMultipleParents = treeViewMode === 'normal' && node.parents && node.parents.length > 1
  const indent = level * 20

  const title = searchQuery ? highlightText(node.title, searchQuery) : escapeHtml(node.title)

  // モードによるUI制御
  const showDragHandle = treeViewMode === 'normal'
  const showAddChildBtn = treeViewMode === 'normal'

  let html = `
    <div class="tree-node-wrapper" data-node-group="${node.id}">
      <div class="tree-item flex items-center px-2 rounded ${isSelected ? 'active' : ''} ${isDuplicate ? 'duplicate-active' : ''} ${isSearchResult ? 'ring-2 ring-yellow-300' : ''}"
           style="padding-left: ${indent + 8}px; padding-top: 2px; padding-bottom: 2px;"
           data-node-id="${node.id}"
           data-node-path="${currentPath}">
        ${showDragHandle ?
      '<i class="fas fa-grip-vertical text-gray-300 mr-2 cursor-move drag-handle"></i>' :
      '<i class="fas fa-circle text-gray-200 mr-2 text-xs" style="opacity: 0.3;"></i>'
    }
        ${hasChildren ? `
          <i class="fas fa-chevron-${isExpanded ? 'down' : 'right'} text-gray-400 mr-2 w-3 toggle-icon" 
             data-node-id="${node.id}"></i>
        ` : `
          <span class="w-3 mr-2"></span>
        `}
        <i class="fas fa-file-alt text-blue-500 mr-2"></i>
        <span class="flex-1 text-sm">${title}</span>
        ${hasMultipleParents ? `
          <span class="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded mr-2" title="複数の親を持つノード">
            <i class="fas fa-link"></i> ${node.parents.length}
          </span>
        ` : ''}
        ${showAddChildBtn ? `
        <button class="add-child-btn text-gray-400 hover:text-blue-500 text-xs px-2" 
                data-node-id="${node.id}" 
                title="子ノードを追加">
          <i class="fas fa-plus"></i>
        </button>
        ` : ''}
      </div>
      ${hasChildren ? `
        <div class="tree-children ${isExpanded ? 'expanded' : ''}" data-parent="${node.id}">
          ${node.children.map(child => renderTreeNode(child, level + 1, new Set(visitedNodes), `${currentPath}-${child.id}`)).join('')}
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
        e.target.closest('.add-child-btn') ||
        e.target.classList.contains('drag-handle')) {
        return
      }

      const nodeId = parseInt(item.dataset.nodeId)
      const nodePath = item.dataset.nodePath

      // 逆ツリーモードでは、ルートノード（selectedNodeId）を変更しない
      // 選択したノードは詳細表示のためだけに選択状態にする
      if (treeViewMode === 'reverse') {
        // ルートノードを変更せず、選択状態のみ更新
        selectedNodeElement = item
        selectedNodePath = nodePath

        // 選択状態を更新
        document.querySelectorAll('.tree-item.active').forEach(el => el.classList.remove('active'))
        document.querySelectorAll('.tree-item.duplicate-active').forEach(el => el.classList.remove('duplicate-active'))
        item.classList.add('active')

        // エディタにノード情報を表示
        fetchNodeById(nodeId).then(node => {
          if (node) {
            axios.get(`/api/trees/${currentTreeId}/nodes/${nodeId}/parents`).then(parentsRes => {
              const parents = parentsRes.data.success ? parentsRes.data.data : []
              renderEditor(node, parents)
            })
          }
        })
      } else {
        // 通常モードでは従来通り
        selectedNodeElement = item
        selectNode(nodeId, nodePath)
      }
    })
  })

  // ツリー展開/折りたたみ
  document.querySelectorAll('.toggle-icon').forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.stopPropagation()
      const nodeId = parseInt(icon.dataset.nodeId)
      // クリックされたアイコン要素を渡す
      toggleNode(nodeId, icon)
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

function setupDragAndDrop() {
  // ルートレベルのSortable
  const treeContainer = document.getElementById('tree-container')

  new Sortable(treeContainer, {
    animation: 150,
    handle: '.drag-handle',
    draggable: '[data-node-group]',
    ghostClass: 'dragging',
    group: 'nested',
    fallbackOnBody: true,
    swapThreshold: 0.65,
    onStart: function (evt) {
      const treeItem = evt.item.querySelector('.tree-item')
      const nodeId = parseInt(treeItem.dataset.nodeId)
      window.currentDraggedNodeId = nodeId

      // ノード上へのドロップ検出を有効化
      setTimeout(() => enableNodeDropZones(nodeId), 100)
    },
    onEnd: async function (evt) {
      disableNodeDropZones()

      // ノード上にドロップされた場合は処理をスキップ
      if (window.droppedOnNode) {
        window.droppedOnNode = false
        window.currentDraggedNodeId = null
        return
      }

      window.currentDraggedNodeId = null

      // コンテナ内の全ノードの順序を更新
      await reorderNodes(evt.to)
    }
  })

  // 子要素のSortable（展開状態に関わらず全ての.tree-childrenに設定）
  document.querySelectorAll('.tree-children').forEach(container => {
    const parentId = parseInt(container.dataset.parent)

    new Sortable(container, {
      animation: 150,
      handle: '.drag-handle',
      draggable: '[data-node-group]',
      ghostClass: 'dragging',
      group: 'nested',
      fallbackOnBody: true,
      swapThreshold: 0.65,
      onStart: function (evt) {
        const treeItem = evt.item.querySelector('.tree-item')
        const nodeId = parseInt(treeItem.dataset.nodeId)
        window.currentDraggedNodeId = nodeId

        // ノード上へのドロップ検出を有効化
        setTimeout(() => enableNodeDropZones(nodeId), 100)
      },
      onEnd: async function (evt) {
        disableNodeDropZones()

        // ノード上にドロップされた場合は処理をスキップ
        if (window.droppedOnNode) {
          window.droppedOnNode = false
          window.currentDraggedNodeId = null
          return
        }

        window.currentDraggedNodeId = null

        // コンテナ内の全ノードの順序を更新
        await reorderNodes(evt.to)
      }
    })
  })
}

// ノード上へのドロップゾーンを有効化
function enableNodeDropZones(draggedNodeId) {
  document.querySelectorAll('.tree-item').forEach(item => {
    const nodeId = parseInt(item.dataset.nodeId)

    // 自分自身や子孫へはドロップ不可
    if (nodeId === draggedNodeId || isDescendant(draggedNodeId, nodeId)) {
      return
    }

    // ドラッグオーバーイベント
    item.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.stopPropagation()
      item.classList.add('drop-target')
    })

    // ドラッグリーブイベント
    item.addEventListener('dragleave', (e) => {
      if (!item.contains(e.relatedTarget)) {
        item.classList.remove('drop-target')
      }
    })

    // ドロップイベント
    item.addEventListener('drop', async (e) => {
      e.preventDefault()
      e.stopPropagation()

      item.classList.remove('drop-target')

      const targetNodeId = nodeId
      const draggedNodeId = window.currentDraggedNodeId

      if (!draggedNodeId || draggedNodeId === targetNodeId) return

      // フラグを設定してSortableのonEndをスキップ
      window.droppedOnNode = true

      // 対象ノードを展開
      expandedNodes.add(targetNodeId)

      // 親子関係を追加（リレーションベース）
      await addRelation(targetNodeId, draggedNodeId)
    })
  })
}

function disableNodeDropZones() {
  document.querySelectorAll('.tree-item').forEach(item => {
    item.classList.remove('drop-target')
    // イベントリスナーを削除するため、クローンして置き換え
    const newItem = item.cloneNode(true)
    item.parentNode.replaceChild(newItem, item)
  })
}

function isDescendant(ancestorId, nodeId) {
  // node_relations を使って子孫かどうかをチェック
  const childRelations = relations.filter(rel => rel.parent_node_id === ancestorId)

  for (const rel of childRelations) {
    if (rel.child_node_id === nodeId) return true
    // 再帰的にチェック
    if (isDescendant(rel.child_node_id, nodeId)) return true
  }

  return false
}

function toggleNode(nodeId, clickedElement = null) {
  // クリックされた要素が渡された場合はそれを使用、なければquerySelectorで探す
  let toggleIcon = clickedElement

  if (!toggleIcon) {
    // フォールバック: IDで最初に見つかった要素を使用
    toggleIcon = document.querySelector(`.toggle-icon[data-node-id="${nodeId}"]`)
  }

  if (!toggleIcon) return

  const treeItem = toggleIcon.closest('.tree-item')
  if (!treeItem) return

  const wrapper = treeItem.closest('[data-node-group]')
  if (!wrapper) return

  // tree-childrenはwrapperの直接の子要素
  const childrenContainer = wrapper.querySelector(':scope > .tree-children')
  if (!childrenContainer) return

  // 展開/折りたたみの切り替え
  if (expandedNodes.has(nodeId)) {
    // 折りたたみ
    expandedNodes.delete(nodeId)
    childrenContainer.classList.remove('expanded')
    toggleIcon.classList.remove('fa-chevron-down')
    toggleIcon.classList.add('fa-chevron-right')
  } else {
    // 展開
    expandedNodes.add(nodeId)
    childrenContainer.classList.add('expanded')
    toggleIcon.classList.remove('fa-chevron-right')
    toggleIcon.classList.add('fa-chevron-down')
  }

  // DOM操作のみ、renderTree()は呼ばない
}

// ===============================
// ユーティリティ（DOM操作関連）
// ===============================
function getNodePath(element) {
  const path = []
  if (!element) return path

  // 自分自身のID
  if (element.dataset && element.dataset.nodeId) {
    path.unshift(parseInt(element.dataset.nodeId))
  }

  // 親を遡ってパスを構築
  let current = element.parentElement
  while (current && current.id !== 'tree-container') {
    // tree-childrenのdata-parent属性を使用
    if (current.classList.contains('tree-children') && current.dataset.parent) {
      path.unshift(parseInt(current.dataset.parent))
    }
    current = current.parentElement
  }
  return path
}

// 選択状態を復元する関数
function restoreSelection() {
  if (!selectedNodePath && !selectedNodeId) return

  // 逆ツリーモードでは、ルートノード（selectedNodeId）を絶対に変更せず維持し、
  // selectedNodePathで指定されたノードを選択状態にする
  if (treeViewMode === 'reverse') {
    // 逆ツリーモードでは、selectedNodeIdはルートノードのIDであり、絶対に変更してはいけない
    const rootNodeId = selectedNodeId // ルートノードのIDを保存（変更を防ぐため）

    // ルートノードを選択状態にする（selectedNodePathが指定されていない場合）
    if (!selectedNodePath && rootNodeId) {
      const rootItem = document.querySelector(`.tree-item[data-node-id="${rootNodeId}"][data-node-path="${rootNodeId}"]`)
      if (rootItem) {
        selectedNodeElement = rootItem
        selectedNodePath = String(rootNodeId)
        selectedNodeId = rootNodeId // 念のため再設定
        rootItem.classList.add('active')

        // エディタに表示
        fetchNodeById(rootNodeId).then(node => {
          if (node) {
            axios.get(`/api/nodes/${rootNodeId}/parents`).then(parentsRes => {
              const parents = parentsRes.data.success ? parentsRes.data.data : []
              renderEditor(node, parents)
            })
          }
        })
        return
      }
    }

    // selectedNodePathが指定されている場合、そのノードを選択
    if (selectedNodePath) {
      const item = document.querySelector(`.tree-item[data-node-path="${selectedNodePath}"]`)
      if (item) {
        selectedNodeElement = item
        selectedNodeId = rootNodeId // ルートノードのIDを必ず維持
        item.classList.add('active')

        // エディタに表示（パスの最後のノードIDを使用）
        const nodeIdFromPath = parseInt(selectedNodePath.split('-').pop())
        fetchNodeById(nodeIdFromPath).then(node => {
          if (node) {
            axios.get(`/api/nodes/${nodeIdFromPath}/parents`).then(parentsRes => {
              const parents = parentsRes.data.success ? parentsRes.data.data : []
              renderEditor(node, parents)
            })
          }
        })
        return
      }
    }

    // 見つからない場合は、ルートノードを選択
    if (rootNodeId) {
      const rootItem = document.querySelector(`.tree-item[data-node-id="${rootNodeId}"]`)
      if (rootItem) {
        selectedNodeElement = rootItem
        selectedNodePath = rootItem.dataset.nodePath
        selectedNodeId = rootNodeId // ルートノードのIDを必ず維持
        rootItem.classList.add('active')

        // エディタに表示
        fetchNodeById(rootNodeId).then(node => {
          if (node) {
            axios.get(`/api/nodes/${rootNodeId}/parents`).then(parentsRes => {
              const parents = parentsRes.data.success ? parentsRes.data.data : []
              renderEditor(node, parents)
            })
          }
        })
      }
    }
    return
  }

  // 通常モードの処理
  let item = null

  // まずパスで検索
  if (selectedNodePath) {
    item = document.querySelector(`.tree-item[data-node-path="${selectedNodePath}"]`)
  }

  // パスで見つからない場合、IDで検索
  if (!item && selectedNodeId) {
    // 同じIDのノードが複数ある場合、selectedNodePathに最も近いものを選ぶ
    // または最初に見つかったものを選ぶ
    const allItems = document.querySelectorAll(`.tree-item[data-node-id="${selectedNodeId}"]`)
    if (allItems.length > 0) {
      // パスが指定されていて、そのパスに近いものを優先
      if (selectedNodePath) {
        // パスのプレフィックスが一致するものを探す
        for (let i = 0; i < allItems.length; i++) {
          const itemPath = allItems[i].dataset.nodePath
          if (itemPath && itemPath.startsWith(selectedNodePath.split('-')[0])) {
            item = allItems[i]
            selectedNodePath = itemPath
            break
          }
        }
      }
      // 見つからなければ最初のものを選ぶ
      if (!item) {
        item = allItems[0]
        selectedNodePath = item.dataset.nodePath
      }
    }
  }

  if (item) {
    selectedNodeElement = item
    item.classList.add('active')

    // 同一ノードのハイライト（選択中のノード以外で同じIDを持つもの）
    if (selectedNodeId) {
      document.querySelectorAll(`.tree-item[data-node-id="${selectedNodeId}"]`).forEach(el => {
        if (el !== item && el.dataset.nodePath !== selectedNodePath) {
          el.classList.add('duplicate-active')
        }
      })
    }
  }
}

async function selectNode(nodeId, nodePath = null) {
  selectedNodeId = nodeId

  // パスが指定された場合はそれを採用、なければ検索して設定
  if (nodePath) {
    selectedNodePath = nodePath
  } else {
    // パス未指定（検索など）の場合、DOMから探す
    const item = document.querySelector(`.tree-item[data-node-id="${nodeId}"]`)
    if (item) {
      selectedNodePath = item.dataset.nodePath
      selectedNodeElement = item
    }
  }

  // 再描画せずDOM上の選択状態のみ更新
  // (通常モード: カーソル飛び防止, 逆ツリーモード: ルート維持のため)
  document.querySelectorAll('.tree-item.active').forEach(item => item.classList.remove('active'))
  document.querySelectorAll('.tree-item.duplicate-active').forEach(item => item.classList.remove('duplicate-active'))

  if (selectedNodePath) {
    const targetElement = document.querySelector(`.tree-item[data-node-path="${selectedNodePath}"]`)
    if (targetElement) {
      targetElement.classList.add('active')
      selectedNodeElement = targetElement
    }
  } else {
    // フォールバック
    const targetElement = document.querySelector(`.tree-item[data-node-id="${nodeId}"]`)
    if (targetElement) {
      targetElement.classList.add('active')
      selectedNodeElement = targetElement
      selectedNodePath = targetElement.dataset.nodePath
    }
  }

  // 同一ノードのハイライト（選択中のノード以外で同じIDを持つもの）
  if (selectedNodeId) {
    document.querySelectorAll(`.tree-item[data-node-id="${selectedNodeId}"]`).forEach(item => {
      if (item.dataset.nodePath !== selectedNodePath) {
        item.classList.add('duplicate-active')
      }
    })
  }

  const node = await fetchNodeById(nodeId)
  if (node) {
    // 親ノードを取得
    const parentsRes = await axios.get(`/api/trees/${currentTreeId}/nodes/${nodeId}/parents`)
    const parents = parentsRes.data.success ? parentsRes.data.data : []
    renderEditor(node, parents)
  }
}

// ===============================
// エディタ表示
// ===============================
function renderEditor(node = null, parents = []) {
  const editorPanel = document.getElementById('editor-panel')

  if (!node) {
    editorPanel.innerHTML = `
      <div class="text-center text-gray-400 py-12">
        <i class="fas fa-arrow-left text-4xl mb-4"></i>
        <p>左側のノードを選択してください</p>
        <p class="text-sm mt-2">Cmd+C でコピー、Cmd+V で貼り付け</p>
      </div>
    `
    selectedNodeVersion = null
    return
  }

  // Store current node version for optimistic locking
  selectedNodeVersion = node.version || 1

  const parentsHtml = parents.length > 0 ? `
    <div class="mb-4 p-3 bg-purple-50 border border-purple-200 rounded">
      <div class="flex items-center justify-between mb-2">
        <label class="text-sm font-medium text-purple-900">
          <i class="fas fa-sitemap mr-1"></i>親ノード (${parents.length})
        </label>
      </div>
      <div class="space-y-1">
        ${parents.map(p => `
          <div class="flex items-center justify-between text-sm bg-white px-2 py-1 rounded">
            <span class="text-purple-700">${escapeHtml(p.title)}</span>
            <button class="remove-parent-btn text-red-500 hover:text-red-700 text-xs" 
                    data-parent-id="${p.id}"
                    title="この親子関係を削除">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  ` : ''

  editorPanel.innerHTML = `
    <div class="flex flex-col h-full">
      <!-- 固定ヘッダー部分 -->
      <div class="flex-shrink-0 mb-3">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-2xl font-bold text-gray-800">ノード詳細</h2>
          <div class="flex gap-2 items-start">
            <button id="delete-node-btn" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
              <i class="fas fa-trash mr-2"></i>削除
            </button>
            <div class="text-center">
              <button id="save-node-btn" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                <i class="fas fa-save mr-2"></i>保存
              </button>
              <p class="text-xs text-gray-400 mt-1">${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter</p>
            </div>
          </div>
        </div>
      </div>
      
      <!-- スクロール可能なコンテンツエリア -->
      <div class="flex-1 overflow-y-auto space-y-4">
        ${parentsHtml}
        <!-- タイトル -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            <i class="fas fa-heading mr-1"></i>タイトル
          </label>
          <input type="text" id="node-title"
                 value="${escapeHtml(node.title)}"
                 class="w-full px-4 py-3 text-lg font-medium border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent">
        </div>
        
        <!-- 内容 (Markdown対応) -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            <i class="fas fa-align-left mr-1"></i>内容 (Markdown対応)
          </label>
          <textarea id="node-content">${escapeHtml(node.content || '')}</textarea>
        </div>
        
        <!-- 作成者 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            <i class="fas fa-user mr-1"></i>作成者
          </label>
          <select id="node-author"
                  class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            ${treeMembers.map(member => `
              <option value="${escapeHtml(member.display_name || member.email)}"
                      ${(member.display_name || member.email) === node.author ? 'selected' : ''}>
                ${escapeHtml(member.display_name || member.email)}
              </option>
            `).join('')}
            ${!treeMembers.find(m => (m.display_name || m.email) === node.author) && node.author ? `
              <option value="${escapeHtml(node.author)}" selected>${escapeHtml(node.author)}</option>
            ` : ''}
          </select>
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
      </div>
      </div>
    </div>
  `

  // イベントリスナーを設定
  document.getElementById('save-node-btn').addEventListener('click', () => saveCurrentNode())
  document.getElementById('delete-node-btn').addEventListener('click', () => deleteCurrentNode())

  // 親削除ボタン
  document.querySelectorAll('.remove-parent-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const parentId = parseInt(btn.dataset.parentId)
      if (confirm('この親子関係を削除しますか？')) {
        await removeRelation(parentId, selectedNodeId)
        await selectNode(selectedNodeId) // リロード
      }
    })
  })

  // EasyMDEを初期化
  if (window.currentEditor) {
    window.currentEditor.toTextArea() // 既存のエディタを破棄
    window.currentEditor = null
  }

  window.currentEditor = new EasyMDE({
    element: document.getElementById('node-content'),
    spellChecker: false,
    autosave: {
      enabled: false
    },
    toolbar: [
      "bold", "italic", "heading", "|",
      "quote", "unordered-list", "ordered-list", "|",
      "link", "image", "|",
      "preview", "side-by-side", "fullscreen", "|",
      "guide"
    ],
    status: ["lines", "words", "cursor"],
    placeholder: "Markdownで内容を入力...",
    renderingConfig: {
      singleLineBreaks: false,
      codeSyntaxHighlighting: false,
    },
    previewRender: function (plainText) {
      // marked.jsを使ってMarkdownをレンダリング
      if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
        // 単一改行も<br>に変換（GitHub Flavored Markdown互換）
        marked.setOptions({
          breaks: true,
          gfm: true
        })
        return marked.parse(plainText)
      }
      return plainText
    }
  })
}

async function saveCurrentNode() {
  if (!selectedNodeId) return

  const title = document.getElementById('node-title').value.trim()
  // EasyMDEから値を取得
  const content = window.currentEditor ? window.currentEditor.value().trim() : ''
  const author = document.getElementById('node-author').value.trim()

  if (!title) {
    showToast('タイトルを入力してください', 'error')
    return
  }

  if (!author) {
    showToast('作成者を入力してください', 'error')
    return
  }

  showLoading()
  try {
    const updated = await updateNode(selectedNodeId, { title, content, author, version: selectedNodeVersion })
    if (updated) {
      showToast('保存しました', 'success')
      await selectNode(selectedNodeId) // リロード (新しいバージョンを取得)
    }
  } finally {
    hideLoading()
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
  const title = await showPrompt('ルートノードのタイトルを入力してください:')
  if (!title || !title.trim()) return

  // Use current user as default author
  const defaultAuthor = currentUser?.display_name || currentUser?.email || 'Unknown'

  showLoading()
  try {
    const node = await createNode({
      title: title.trim(),
      content: '',
      author: defaultAuthor,
      root_position: 0
    })

    if (node) {
      expandedNodes.add(node.id)
      await selectNode(node.id)
    }
  } finally {
    hideLoading()
  }
}

async function addChildNode(parentId) {
  const title = await showPrompt('子ノードのタイトルを入力してください:')
  if (!title || !title.trim()) return

  // Use current user as default author
  const defaultAuthor = currentUser?.display_name || currentUser?.email || 'Unknown'

  showLoading()
  try {
    // ノード作成
    const node = await createNode({
      title: title.trim(),
      content: '',
      author: defaultAuthor
    })

    if (node) {
      // 親子関係を追加
      await addRelation(parentId, node.id)
      expandedNodes.add(parentId)
      await selectNode(node.id)
    }
  } finally {
    hideLoading()
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
// ペインリサイズ
// ===============================
function setupPaneResize() {
  const resizeHandle = document.getElementById('resize-handle')
  const treePane = document.getElementById('tree-pane')
  const editorPane = document.getElementById('editor-pane')
  const container = document.getElementById('main-container')

  let isResizing = false
  let startX = 0
  let startWidth = 0

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true
    startX = e.clientX
    startWidth = treePane.offsetWidth

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return

    const containerWidth = container.offsetWidth
    const deltaX = e.clientX - startX
    const newWidth = startWidth + deltaX

    // 最小幅と最大幅を設定（20% - 80%）
    const minWidth = containerWidth * 0.2
    const maxWidth = containerWidth * 0.8

    if (newWidth >= minWidth && newWidth <= maxWidth) {
      const percentage = (newWidth / containerWidth) * 100
      treePane.style.width = `${percentage}%`
    }
  })

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  })
}

// ===============================
// クリップボード機能（Command+C/V）
// ===============================
function handleCopy(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedNodeId) {
    // エディタ内のテキスト選択を妨げない
    if (document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA') {
      return
    }

    e.preventDefault()
    clipboard = selectedNodeId

    // 視覚的フィードバック
    showToast('ノードをコピーしました', 'success')
  }
}

// Save shortcut handler (Cmd/Ctrl + Enter)
function handleSaveShortcut(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && selectedNodeId) {
    e.preventDefault()
    const saveBtn = document.getElementById('save-node-btn')
    if (saveBtn && !saveBtn.disabled) {
      saveBtn.click()
    }
  }
}

async function handlePaste(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'v' && clipboard && selectedNodeId) {
    // エディタ内のテキスト選択を妨げない
    if (document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA') {
      return
    }

    e.preventDefault()

    console.log('Pasting node:', { parent: selectedNodeId, child: clipboard })

    // clipboardのノードをselectedNodeIdの子として追加
    const success = await addRelation(selectedNodeId, clipboard)

    if (success) {
      // 視覚的フィードバック
      showToast('親子関係を追加しました', 'success')

      // 親ノードを展開
      expandedNodes.add(selectedNodeId)
      renderTree()
    }
  }
}

// ===============================
// キーボードナビゲーション（矢印キー）
// ===============================
function getVisibleNodeElements() {
  const visibleElements = []

  // ツリーコンテナから再帰的に走査して、表示順序通りにノード要素を取得
  function traverseTree(element) {
    // data-node-groupを持つ要素を探す
    const nodeGroups = element.children

    for (let i = 0; i < nodeGroups.length; i++) {
      const group = nodeGroups[i]

      // .tree-itemを探す
      const treeItem = group.querySelector(':scope > .tree-item')
      if (treeItem) {
        visibleElements.push(treeItem)

        // 子要素(.tree-children)があり、かつexpandedの場合は再帰的に走査
        const childrenContainer = group.querySelector(':scope > .tree-children.expanded')
        if (childrenContainer) {
          traverseTree(childrenContainer)
        }
      }
    }
  }

  const treeContainer = document.getElementById('tree-container')
  if (treeContainer) {
    traverseTree(treeContainer)
  }

  return visibleElements
}

function handleArrowKeys(e) {
  // 入力フィールドにフォーカスがある場合はスキップ
  if (document.activeElement.tagName === 'INPUT' ||
    document.activeElement.tagName === 'TEXTAREA') {
    return
  }

  // 矢印キーでない場合はスキップ
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    return
  }

  e.preventDefault()

  const visibleElements = getVisibleNodeElements()
  if (visibleElements.length === 0) return

  // 選択されているノードがない場合は最初のノードを選択
  if (!selectedNodePath && !selectedNodeId) {
    const firstElement = visibleElements[0]
    const firstNodeId = parseInt(firstElement.dataset.nodeId)
    const firstNodePath = firstElement.dataset.nodePath
    selectNode(firstNodeId, firstNodePath)
    return
  }

  // 現在選択されている要素のインデックスを見つける
  // 1. まずselectedNodeElement（実際のDOM要素）で探す（最も確実）
  // 2. 見つからなければselectedNodePathで探す
  // 3. それでも見つからなければselectedNodeIdで最初に見つかったものを探す
  let currentIndex = -1

  if (selectedNodeElement && document.contains(selectedNodeElement)) {
    // selectedNodeElementが有効な場合、visibleElements内で同じ要素参照を探す
    currentIndex = visibleElements.findIndex(el => el === selectedNodeElement)
  }

  if (currentIndex === -1 && selectedNodePath) {
    // パスで探す
    currentIndex = visibleElements.findIndex(el => el.dataset.nodePath === selectedNodePath)
  }

  if (currentIndex === -1 && selectedNodeId) {
    // IDで最初に見つかったものを探す（フォールバック）
    currentIndex = visibleElements.findIndex(el => parseInt(el.dataset.nodeId) === selectedNodeId)
    // 見つかった場合は、そのパスをselectedNodePathとして更新
    if (currentIndex !== -1) {
      const foundElement = visibleElements[currentIndex]
      selectedNodePath = foundElement.dataset.nodePath
      selectedNodeElement = foundElement
    }
  }

  if (currentIndex === -1) {
    // 見つからない場合（例えば親が閉じられた）、最初の要素を選択
    const firstElement = visibleElements[0]
    const firstNodeId = parseInt(firstElement.dataset.nodeId)
    const firstNodePath = firstElement.dataset.nodePath
    selectNode(firstNodeId, firstNodePath)
    return
  }

  const selectedNode = nodes.find(n => n.id === selectedNodeId)

  switch (e.key) {
    case 'ArrowUp':
      // 上のノードを選択
      if (currentIndex > 0) {
        const prevElement = visibleElements[currentIndex - 1]
        const prevNodeId = parseInt(prevElement.dataset.nodeId)
        const prevNodePath = prevElement.dataset.nodePath
        selectNode(prevNodeId, prevNodePath)
      }
      break

    case 'ArrowDown':
      // 下のノードを選択
      if (currentIndex < visibleElements.length - 1) {
        const nextElement = visibleElements[currentIndex + 1]
        const nextNodeId = parseInt(nextElement.dataset.nodeId)
        const nextNodePath = nextElement.dataset.nodePath
        selectNode(nextNodeId, nextNodePath)
      }
      break

    case 'ArrowRight':
      if (selectedNodeElement) {
        // 選択中のノードのIDを取得
        const nodeIdToExpand = parseInt(selectedNodeElement.dataset.nodeId)

        // 逆ツリーモードと通常モードで子ノードの判定方法が異なる
        const hasChildren = treeViewMode === 'reverse'
          ? relations.some(rel => rel.child_node_id === nodeIdToExpand)
          : relations.some(rel => rel.parent_node_id === nodeIdToExpand)

        if (hasChildren && !expandedNodes.has(nodeIdToExpand)) {
          // 展開状態を更新
          expandedNodes.add(nodeIdToExpand)

          // DOM操作のみで展開（renderTreeを呼ばない）
          const wrapper = selectedNodeElement.closest('[data-node-group]')
          if (wrapper) {
            const childrenContainer = wrapper.querySelector(':scope > .tree-children')
            if (childrenContainer) {
              childrenContainer.classList.add('expanded')
              // 展開アイコンも更新
              const toggleIcon = selectedNodeElement.querySelector('.toggle-icon')
              if (toggleIcon) {
                toggleIcon.classList.remove('fa-chevron-right')
                toggleIcon.classList.add('fa-chevron-down')
              }
            }
          }
        }
      }
      break

    case 'ArrowLeft':
      if (selectedNodeElement) {
        const nodeIdToCollapse = parseInt(selectedNodeElement.dataset.nodeId)

        if (expandedNodes.has(nodeIdToCollapse)) {
          // 展開されている場合は折りたたむ（DOM操作のみ）
          expandedNodes.delete(nodeIdToCollapse)

          const wrapper = selectedNodeElement.closest('[data-node-group]')
          if (wrapper) {
            const childrenContainer = wrapper.querySelector(':scope > .tree-children')
            if (childrenContainer) {
              childrenContainer.classList.remove('expanded')
              // 折りたたみアイコンも更新
              const toggleIcon = selectedNodeElement.querySelector('.toggle-icon')
              if (toggleIcon) {
                toggleIcon.classList.remove('fa-chevron-down')
                toggleIcon.classList.add('fa-chevron-right')
              }
            }
          }
        } else if (treeViewMode === 'normal') {
          // 通常モードで既に折りたたまれている場合は、親ノードに移動
          // パスから親パスを計算: "1-2-3" -> "1-2"
          if (selectedNodePath) {
            const lastSeparatorIndex = selectedNodePath.lastIndexOf('-')
            if (lastSeparatorIndex > 0) {
              const parentPath = selectedNodePath.substring(0, lastSeparatorIndex)
              const parentElement = document.querySelector(`.tree-item[data-node-path="${parentPath}"]`)

              if (parentElement) {
                const parentId = parseInt(parentElement.dataset.nodeId)
                selectNode(parentId, parentPath)
              }
            }
          }
        }
        // 逆ツリーモードで折りたたまれている場合は何もしない
      }
      break
  }
}

// ===============================
// 初期化
// ===============================
document.addEventListener('DOMContentLoaded', () => {
  // ルートノード追加ボタン
  document.getElementById('add-root-btn').addEventListener('click', addRootNode)

  // 検索機能
  document.getElementById('search-input').addEventListener('input', handleSearchInput)
  document.getElementById('clear-search-btn').addEventListener('click', clearSearch)

  // ペインリサイズ
  setupPaneResize()

  // ツリー表示モード切り替え
  document.querySelectorAll('.tree-view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const viewMode = tab.dataset.view

      // タブのアクティブ状態を切り替え
      document.querySelectorAll('.tree-view-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')

      // 表示モードを切り替え
      treeViewMode = viewMode
      renderTree()
    })
  })

  // キーボードショートカット
  document.addEventListener('keydown', handleCopy)
  document.addEventListener('keydown', handlePaste)
  document.addEventListener('keydown', handleArrowKeys)
  document.addEventListener('keydown', handleSaveShortcut)

  // 初期データ読み込み（認証とツリーコンテキストチェック）
  initializeApp()
})

async function initializeApp() {
  showLoading()

  // Check authentication
  const isAuthenticated = await checkAuth()
  if (!isAuthenticated) {
    hideLoading()
    showToast('ログインが必要です', 'error')
    setTimeout(() => {
      window.location.href = '/login.html'
    }, 1500)
    return
  }

  // Load tree context and check access
  const hasTreeAccess = await loadTreeContext()
  if (!hasTreeAccess) {
    hideLoading()
    return // loadTreeContext already handles redirect
  }

  // Load version and nodes
  await fetchVersion()
  await fetchNodes()

  hideLoading()
}
