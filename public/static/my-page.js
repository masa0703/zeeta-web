/**
 * My Page - Tree Management UI
 */

let currentUser = null
let allTrees = []
let currentTreeForMembers = null

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth()
  await loadTrees()
})

/**
 * Check if user is authenticated
 */
async function checkAuth() {
  try {
    const response = await fetch('/auth/me')

    if (!response.ok) {
      // Not authenticated, redirect to login
      window.location.href = '/login.html'
      return
    }

    const data = await response.json()
    if (data.success && data.data) {
      currentUser = data.data
      displayUserInfo(currentUser)
    } else {
      window.location.href = '/login.html'
    }
  } catch (error) {
    console.error('Auth check failed:', error)
    window.location.href = '/login.html'
  }
}

/**
 * Display user information in header
 */
function displayUserInfo(user) {
  document.getElementById('user-name').textContent = user.display_name || 'User'
  document.getElementById('user-email').textContent = user.email || ''

  if (user.avatar_url) {
    const avatar = document.getElementById('user-avatar')
    avatar.src = user.avatar_url
    avatar.style.display = 'block'
  }
}

/**
 * Load all trees accessible by the user
 */
async function loadTrees() {
  try {
    const response = await fetch('/api/trees')

    if (!response.ok) {
      throw new Error('Failed to load trees')
    }

    const data = await response.json()

    if (data.success && data.data) {
      allTrees = data.data
      displayTrees(allTrees)
    }
  } catch (error) {
    console.error('Failed to load trees:', error)
    showError('ツリーの読み込みに失敗しました')
  } finally {
    document.getElementById('loading-state').style.display = 'none'
    document.getElementById('trees-container').style.display = 'block'
  }
}

/**
 * Display trees in my trees and shared trees sections
 */
function displayTrees(trees) {
  const myTreesGrid = document.getElementById('my-trees-grid')
  const sharedTreesGrid = document.getElementById('shared-trees-grid')

  const myTrees = trees.filter(t => t.role === 'owner')
  const sharedTrees = trees.filter(t => t.role !== 'owner')

  // Display my trees
  if (myTrees.length === 0) {
    myTreesGrid.innerHTML = `
      <div class="col-span-full empty-state">
        <i class="fas fa-folder-open"></i>
        <p class="text-lg font-medium">まだツリーがありません</p>
        <p class="text-sm">「新しいツリーを作成」ボタンから始めましょう</p>
      </div>
    `
  } else {
    myTreesGrid.innerHTML = myTrees.map(tree => createTreeCard(tree)).join('')
  }

  // Display shared trees
  if (sharedTrees.length === 0) {
    sharedTreesGrid.innerHTML = `
      <div class="col-span-full empty-state">
        <i class="fas fa-share-alt"></i>
        <p class="text-lg font-medium">共有されたツリーはありません</p>
      </div>
    `
  } else {
    sharedTreesGrid.innerHTML = sharedTrees.map(tree => createTreeCard(tree)).join('')
  }
}

/**
 * Create a tree card HTML
 */
function createTreeCard(tree) {
  const roleClass = `role-${tree.role}`
  const roleName = {
    owner: 'オーナー',
    editor: '編集者',
    viewer: '閲覧者'
  }[tree.role] || tree.role

  const ownerInfo = tree.role !== 'owner' && tree.owner_display_name
    ? `<p class="text-xs text-gray-500">オーナー: ${tree.owner_display_name}</p>`
    : ''

  const updatedAt = new Date(tree.updated_at)
  const timeAgo = getTimeAgo(updatedAt)

  return `
    <div class="tree-card p-6" onclick="openTree(${tree.id})">
      <div class="flex items-start justify-between mb-3">
        <h3 class="text-lg font-bold text-gray-800 flex-1">${escapeHtml(tree.name)}</h3>
        <span class="role-badge ${roleClass}">${roleName}</span>
      </div>

      ${tree.description ? `<p class="text-sm text-gray-600 mb-3">${escapeHtml(tree.description)}</p>` : ''}

      <div class="flex items-center justify-between text-xs text-gray-500">
        <div class="flex items-center space-x-4">
          <span><i class="fas fa-users mr-1"></i>${tree.member_count || 0}人</span>
          <span><i class="fas fa-clock mr-1"></i>${timeAgo}</span>
        </div>

        ${tree.role === 'owner' || tree.role === 'editor' ? `
          <button
            onclick="event.stopPropagation(); openMemberModal(${tree.id})"
            class="text-purple-600 hover:text-purple-800"
            title="メンバー管理"
          >
            <i class="fas fa-user-cog"></i>
          </button>
        ` : ''}
      </div>

      ${ownerInfo}
    </div>
  `
}

/**
 * Open a tree in the editor
 */
function openTree(treeId) {
  // TODO: Update URL structure when editor is migrated to tree-scoped URLs
  // For now, redirect to existing editor
  window.location.href = `/index.html?tree=${treeId}`
}

/**
 * Open create tree modal
 */
function openCreateTreeModal() {
  document.getElementById('create-tree-modal').classList.add('active')
  document.getElementById('tree-name').focus()
}

/**
 * Close create tree modal
 */
function closeCreateTreeModal() {
  document.getElementById('create-tree-modal').classList.remove('active')
  document.getElementById('create-tree-form').reset()
}

/**
 * Create a new tree
 */
async function createTree(event) {
  event.preventDefault()

  const form = event.target
  const name = form.name.value.trim()
  const description = form.description.value.trim() || null

  try {
    const response = await fetch('/api/trees', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, description })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to create tree')
    }

    const data = await response.json()

    if (data.success) {
      closeCreateTreeModal()
      await loadTrees()
      showSuccess('ツリーを作成しました')
    }
  } catch (error) {
    console.error('Failed to create tree:', error)
    showError('ツリーの作成に失敗しました: ' + error.message)
  }
}

/**
 * Open member management modal
 */
async function openMemberModal(treeId) {
  currentTreeForMembers = treeId

  try {
    const response = await fetch(`/api/trees/${treeId}/members`)

    if (!response.ok) {
      throw new Error('Failed to load members')
    }

    const data = await response.json()

    if (data.success && data.data) {
      displayMembers(data.data, treeId)
      document.getElementById('member-modal').classList.add('active')
    }
  } catch (error) {
    console.error('Failed to load members:', error)
    showError('メンバー情報の読み込みに失敗しました')
  }
}

/**
 * Close member management modal
 */
function closeMemberModal() {
  document.getElementById('member-modal').classList.remove('active')
  currentTreeForMembers = null
}

/**
 * Display members list
 */
function displayMembers(members, treeId) {
  const tree = allTrees.find(t => t.id === treeId)
  const isOwner = tree && tree.role === 'owner'

  const membersList = document.getElementById('members-list')

  membersList.innerHTML = members.map(member => {
    const roleClass = `role-${member.role}`
    const roleName = {
      owner: 'オーナー',
      editor: '編集者',
      viewer: '閲覧者'
    }[member.role] || member.role

    const isCurrentUser = member.user_id === currentUser.id
    const canRemove = isOwner && member.role !== 'owner' && !isCurrentUser

    return `
      <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
        <div class="flex items-center space-x-3 flex-1">
          ${member.avatar_url ? `
            <img src="${member.avatar_url}" alt="Avatar" class="w-10 h-10 rounded-full">
          ` : `
            <div class="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold">
              ${(member.display_name || member.email)[0].toUpperCase()}
            </div>
          `}
          <div class="flex-1">
            <div class="text-sm font-semibold text-gray-800">${escapeHtml(member.display_name || 'User')}</div>
            <div class="text-xs text-gray-500">${escapeHtml(member.email)}</div>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <span class="role-badge ${roleClass}">${roleName}</span>

          ${canRemove ? `
            <button
              onclick="removeMember(${treeId}, ${member.user_id})"
              class="text-red-600 hover:text-red-800 ml-2"
              title="メンバーを削除"
            >
              <i class="fas fa-times"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `
  }).join('')
}

/**
 * Remove a member from the tree
 */
async function removeMember(treeId, userId) {
  if (!confirm('このメンバーをツリーから削除しますか？')) {
    return
  }

  try {
    const response = await fetch(`/api/trees/${treeId}/members/${userId}`, {
      method: 'DELETE'
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to remove member')
    }

    showSuccess('メンバーを削除しました')
    await openMemberModal(treeId) // Reload members
  } catch (error) {
    console.error('Failed to remove member:', error)
    showError('メンバーの削除に失敗しました: ' + error.message)
  }
}

/**
 * Logout
 */
async function logout() {
  try {
    await fetch('/auth/logout', { method: 'POST' })
    window.location.href = '/login.html'
  } catch (error) {
    console.error('Logout failed:', error)
    window.location.href = '/login.html'
  }
}

/**
 * Utility: Get time ago string
 */
function getTimeAgo(date) {
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'たった今'
  if (diffMins < 60) return `${diffMins}分前`
  if (diffHours < 24) return `${diffHours}時間前`
  if (diffDays < 30) return `${diffDays}日前`

  return date.toLocaleDateString('ja-JP')
}

/**
 * Utility: Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Show success message
 */
function showSuccess(message) {
  // Simple alert for now, can be replaced with toast notification
  alert(message)
}

/**
 * Show error message
 */
function showError(message) {
  // Simple alert for now, can be replaced with toast notification
  alert(message)
}
