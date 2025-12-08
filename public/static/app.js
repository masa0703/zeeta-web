// ===============================
// グローバル状態管理
// ===============================
let nodes = []
let relations = []
let selectedNodeId = null
let selectedNodePath = null // 現在選択されているノードのパス (例: "1-2-5")
let selectedNodeElement = null // 現在選択されているDOM要素
let expandedNodes = new Set()
let searchQuery = ''
let searchResults = []
let clipboard = null // コピーしたノードのID
let treeViewMode = 'normal' // 'normal' or 'reverse'

// ===============================
// API呼び出し
// ===============================
async function fetchNodes() {
  try {
    const [nodesRes, relationsRes] = await Promise.all([
      axios.get('/api/nodes'),
      axios.get('/api/relations')
    ])

    if (nodesRes.data.success && relationsRes.data.success) {
      nodes = nodesRes.data.data
      relations = relationsRes.data.data
      renderTree()
    }
  } catch (error) {
    console.error('Failed to fetch nodes:', error)
    alert('ノードの取得に失敗しました')
  }
}

async function addRelation(parentId, childId) {
  try {
    const response = await axios.post('/api/relations', {
      parent_node_id: parentId,
      child_node_id: childId
    })

    if (response.data.success) {
      await fetchNodes()
      return true
    }
  } catch (error) {
    console.error('Failed to add relation:', error)
    if (error.response?.data?.error === 'Circular reference detected') {
      alert('循環参照です。この操作はできません。')
    } else if (error.response?.data?.error === 'Relation already exists') {
      alert('この親子関係はすでに存在します')
    } else {
      alert('親子関係の追加に失敗しました')
    }
    return false
  }
}

async function removeRelation(parentId, childId) {
  try {
    const response = await axios.delete(`/api/relations/${parentId}/${childId}`)
    if (response.data.success) {
      await fetchNodes()
      return true
    }
  } catch (error) {
    console.error('Failed to remove relation:', error)
    alert('親子関係の削除に失敗しました')
    return false
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
      alert('循環参照は許可されていません')
    } else {
      alert('ノードの移動に失敗しました')
    }
    return false
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
  const node = nodes.find(n => n.id === nodeId)
  if (node && node.parent_id) {
    expandedNodes.add(node.parent_id)
    expandParents(node.parent_id)
  }
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
  relations.forEach(rel => {
    const parent = nodeMap.get(rel.parent_node_id)
    const child = nodeMap.get(rel.child_node_id)

    if (parent && child) {
      parent.children.push(child)
      child.parents.push(parent)
      childNodeIds.add(rel.child_node_id)
    }
  })

  // 親を持たないノードをルートとする
  nodes.forEach(node => {
    if (!childNodeIds.has(node.id)) {
      rootNodes.push(nodeMap.get(node.id))
    }
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
      child.children.push(parent)
      parent.parents.push(child)
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
    <div data-node-group="${node.id}">
      <div class="tree-item flex items-center py-2 px-2 rounded ${isSelected ? 'active' : ''} ${isDuplicate ? 'duplicate-active' : ''} ${isSearchResult ? 'ring-2 ring-yellow-300' : ''}" 
           style="padding-left: ${indent + 8}px"
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
            axios.get(`/api/nodes/${nodeId}/parents`).then(parentsRes => {
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
    ghostClass: 'dragging',
    group: 'nested',
    fallbackOnBody: true,
    swapThreshold: 0.65,
    onStart: function (evt) {
      const nodeId = parseInt(evt.item.querySelector('.tree-item').dataset.nodeId)
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

      const nodeId = parseInt(evt.item.querySelector('.tree-item').dataset.nodeId)
      const newIndex = evt.newIndex

      window.currentDraggedNodeId = null
      await moveNode(nodeId, null, newIndex)
    }
  })

  // 子要素のSortable
  document.querySelectorAll('.tree-children.expanded').forEach(container => {
    const parentId = parseInt(container.dataset.parent)

    new Sortable(container, {
      animation: 150,
      handle: '.drag-handle',
      ghostClass: 'dragging',
      group: 'nested',
      fallbackOnBody: true,
      swapThreshold: 0.65,
      onStart: function (evt) {
        const nodeId = parseInt(evt.item.querySelector('.tree-item').dataset.nodeId)
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

        const nodeId = parseInt(evt.item.querySelector('.tree-item').dataset.nodeId)
        const newIndex = evt.newIndex
        const newParentId = evt.to.dataset.parent ? parseInt(evt.to.dataset.parent) : null

        window.currentDraggedNodeId = null
        await moveNode(nodeId, newParentId, newIndex)
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
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return false
  if (node.parent_id === ancestorId) return true
  if (node.parent_id === null) return false
  return isDescendant(ancestorId, node.parent_id)
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
  
  const nodeGroup = treeItem.closest('[data-node-group]')
  if (!nodeGroup) return
  
  const childrenContainer = nodeGroup.querySelector('.tree-children')
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
    const parentsRes = await axios.get(`/api/nodes/${nodeId}/parents`)
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
    return
  }

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
    <div class="mb-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold text-gray-800">ノード詳細</h2>
        <button id="delete-node-btn" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
          <i class="fas fa-trash mr-2"></i>削除
        </button>
      </div>
      
      ${parentsHtml}
      
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
  })
}

async function saveCurrentNode() {
  if (!selectedNodeId) return

  const title = document.getElementById('node-title').value.trim()
  // EasyMDEから値を取得
  const content = window.currentEditor ? window.currentEditor.value().trim() : ''
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

  // ノード作成（parent_idなし）
  const node = await createNode({
    parent_id: null,
    title: title.trim(),
    content: '',
    author: author.trim(),
    position: 0
  })

  if (node) {
    // 親子関係を追加
    await addRelation(parentId, node.id)
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
    const notification = document.createElement('div')
    notification.textContent = 'ノードをコピーしました'
    notification.className = 'fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg z-50'
    document.body.appendChild(notification)

    setTimeout(() => notification.remove(), 2000)
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

    // clipboardのノードをselectedNodeIdの子として追加
    const success = await addRelation(selectedNodeId, clipboard)

    if (success) {
      // 視覚的フィードバック
      const notification = document.createElement('div')
      notification.textContent = '親子関係を追加しました'
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50'
      document.body.appendChild(notification)

      setTimeout(() => notification.remove(), 2000)

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
          const nodeGroup = selectedNodeElement.closest('[data-node-group]')
          if (nodeGroup) {
            const childrenContainer = nodeGroup.querySelector('.tree-children')
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
          
          const nodeGroup = selectedNodeElement.closest('[data-node-group]')
          if (nodeGroup) {
            const childrenContainer = nodeGroup.querySelector('.tree-children')
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

  // 初期データ読み込み
  fetchNodes()
})
