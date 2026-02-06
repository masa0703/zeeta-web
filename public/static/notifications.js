/**
 * Notification Management
 * Handles fetching, displaying, and managing notifications
 */

let notificationPollingInterval = null
let isNotificationDropdownOpen = false

/**
 * Initialize notification system
 */
function initNotifications() {
  // Load notifications on page load
  loadNotifications()

  // Start polling every 60 seconds
  startNotificationPolling()

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notification-dropdown')
    const bell = document.querySelector('.notification-bell') || e.target.closest('[onclick="toggleNotifications()"]')

    if (dropdown && !dropdown.contains(e.target) && !bell?.contains(e.target)) {
      closeNotifications()
    }
  })
}

/**
 * Start polling for new notifications
 */
function startNotificationPolling() {
  if (notificationPollingInterval) {
    clearInterval(notificationPollingInterval)
  }

  // Poll every 60 seconds
  notificationPollingInterval = setInterval(() => {
    loadNotifications()
  }, 60000) // 60 seconds
}

/**
 * Stop notification polling
 */
function stopNotificationPolling() {
  if (notificationPollingInterval) {
    clearInterval(notificationPollingInterval)
    notificationPollingInterval = null
  }
}

/**
 * Load notifications from the server
 */
async function loadNotifications() {
  try {
    const response = await fetch('/api/notifications', {
      method: 'GET',
      credentials: 'include'
    })

    if (!response.ok) {
      console.error('Failed to load notifications:', response.statusText)
      return
    }

    const result = await response.json()
    if (result.success && result.data) {
      displayNotifications(result.data)
      updateNotificationBadge(result.data)
    }
  } catch (error) {
    console.error('Error loading notifications:', error)
  }
}

/**
 * Display notifications in the dropdown
 */
function displayNotifications(notifications) {
  const listElement = document.getElementById('notification-list')
  if (!listElement) return

  if (!notifications || notifications.length === 0) {
    listElement.innerHTML = `
      <div style="
        padding: 3rem 1.5rem;
        text-align: center;
        color: #718096;
      ">
        <i class="fas fa-bell-slash" style="font-size: 2rem; opacity: 0.5; margin-bottom: 0.5rem;"></i>
        <p style="margin: 0;">通知はありません</p>
      </div>
    `
    return
  }

  listElement.innerHTML = notifications.map(notification => {
    const isUnread = !notification.is_read
    const timeAgo = getTimeAgo(notification.created_at)

    return `
      <div
        class="notification-item ${isUnread ? 'unread' : ''}"
        onclick="handleNotificationClick(${notification.id}, '${escapeHtml(notification.link || '')}')"
        style="
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #f7fafc;
          cursor: pointer;
          ${isUnread ? 'background-color: #eef2ff;' : ''}
        "
      >
        <div style="font-weight: ${isUnread ? '600' : '500'}; color: #1a202c; margin-bottom: 0.25rem;">
          ${escapeHtml(notification.title)}
        </div>
        <div style="font-size: 0.875rem; color: #4a5568; margin-bottom: 0.5rem;">
          ${escapeHtml(notification.message || '')}
        </div>
        <div style="font-size: 0.75rem; color: #a0aec0;">
          ${timeAgo}
        </div>
      </div>
    `
  }).join('')
}

/**
 * Update notification badge count
 */
function updateNotificationBadge(notifications) {
  const badge = document.getElementById('notification-badge')
  if (!badge) return

  const unreadCount = notifications.filter(n => !n.is_read).length

  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount
    badge.style.display = 'flex'
  } else {
    badge.style.display = 'none'
  }
}

/**
 * Toggle notification dropdown
 */
function toggleNotifications() {
  const dropdown = document.getElementById('notification-dropdown')
  if (!dropdown) return

  if (isNotificationDropdownOpen) {
    closeNotifications()
  } else {
    openNotifications()
  }
}

/**
 * Open notification dropdown
 */
function openNotifications() {
  const dropdown = document.getElementById('notification-dropdown')
  if (!dropdown) return

  // For my-page.html (has .active class)
  if (dropdown.classList) {
    dropdown.classList.add('active')
  } else {
    // For app.js (inline styles)
    dropdown.style.display = 'block'
  }

  isNotificationDropdownOpen = true

  // Reload notifications when opening
  loadNotifications()
}

/**
 * Close notification dropdown
 */
function closeNotifications() {
  const dropdown = document.getElementById('notification-dropdown')
  if (!dropdown) return

  // For my-page.html (has .active class)
  if (dropdown.classList) {
    dropdown.classList.remove('active')
  } else {
    // For app.js (inline styles)
    dropdown.style.display = 'none'
  }

  isNotificationDropdownOpen = false
}

/**
 * Handle notification click
 */
async function handleNotificationClick(notificationId, link) {
  try {
    // Mark as read
    await fetch(`/api/notifications/${notificationId}/read`, {
      method: 'PUT',
      credentials: 'include'
    })

    // Reload notifications to update UI
    await loadNotifications()

    // Navigate to link if provided
    if (link && link !== 'null' && link !== '') {
      closeNotifications()
      window.location.href = link
    }
  } catch (error) {
    console.error('Error marking notification as read:', error)
  }
}

/**
 * Mark all notifications as read
 */
async function markAllAsRead() {
  try {
    const response = await fetch('/api/notifications/read-all', {
      method: 'PUT',
      credentials: 'include'
    })

    if (!response.ok) {
      console.error('Failed to mark all as read:', response.statusText)
      return
    }

    // Reload notifications to update UI
    await loadNotifications()
  } catch (error) {
    console.error('Error marking all as read:', error)
  }
}

/**
 * Calculate time ago from a timestamp
 */
function getTimeAgo(timestamp) {
  const now = new Date()
  const past = new Date(timestamp)
  const diffMs = now - past
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) return 'たった今'
  if (diffMinutes < 60) return `${diffMinutes}分前`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}時間前`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}日前`

  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks < 4) return `${diffWeeks}週間前`

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths}ヶ月前`

  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears}年前`
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Initialize notifications when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotifications)
} else {
  initNotifications()
}
