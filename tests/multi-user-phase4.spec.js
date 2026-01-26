import { test, expect } from '@playwright/test'

/**
 * Phase 4 E2E Tests - Multi-User Features
 *
 * Test Coverage:
 * 1. Authentication Flow
 * 2. Tree Management
 * 3. Node Operations
 * 4. Permissions
 * 5. Tree Isolation
 */

const BASE_URL = 'http://localhost:8787'

// Test helper functions
async function testLogin(page, userId = 1) {
  await page.goto(`${BASE_URL}/auth/test-login?user_id=${userId}`)
  await page.waitForURL('**/my-page.html')
}

async function clearTestData(page) {
  await page.request.delete(`${BASE_URL}/api/test/clear`)
}

async function createTestTree(page, name = 'Test Tree', description = 'Test Description') {
  // Open create tree modal
  await page.click('button:has-text("新しいツリーを作成")')

  // Fill in tree details
  await page.fill('#tree-name', name)
  await page.fill('#tree-description', description)

  // Submit form
  await page.click('#create-tree-form button[type="submit"]')

  // Wait for tree to appear
  await page.waitForSelector(`.tree-card:has-text("${name}")`)
}

// ===========================================
// 1. Authentication Flow Tests
// ===========================================

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page)
  })

  test('TC-AUTH-001: Unauthenticated user redirect to login', async ({ page }) => {
    await page.goto(`${BASE_URL}/my-page.html`)

    // Should redirect to login page
    await page.waitForURL('**/login.html', { timeout: 3000 })
    expect(page.url()).toContain('/login.html')
  })

  test('TC-AUTH-002: Login and redirect to My Page', async ({ page }) => {
    await testLogin(page, 1)

    // Should be on My Page
    expect(page.url()).toContain('/my-page.html')

    // User info should be displayed
    await expect(page.locator('#user-name')).toHaveText(/Test User/)
  })

  test('TC-AUTH-003: Session persistence after page reload', async ({ page }) => {
    await testLogin(page, 1)

    // Reload page
    await page.reload()

    // Should still be on My Page (not redirected to login)
    await page.waitForTimeout(1000)
    expect(page.url()).toContain('/my-page.html')
  })

  test('TC-AUTH-004: Logout functionality', async ({ page }) => {
    await testLogin(page, 1)

    // Click logout button
    await page.click('button:has-text("ログアウト")')

    // Should redirect to login page
    await page.waitForURL('**/login.html')

    // Try to access My Page again
    await page.goto(`${BASE_URL}/my-page.html`)

    // Should be redirected to login
    await page.waitForURL('**/login.html')
  })
})

// ===========================================
// 2. Tree Management Tests
// ===========================================

test.describe('Tree Management', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page)
    await testLogin(page, 1)
  })

  test('TC-TREE-001: Create a new tree', async ({ page }) => {
    await createTestTree(page, 'テストプロジェクト', 'テスト用のプロジェクトです')

    // Verify tree appears in My Trees section
    const treeCard = page.locator('.tree-card:has-text("テストプロジェクト")')
    await expect(treeCard).toBeVisible()

    // Verify owner badge is displayed
    await expect(treeCard.locator('.role-owner')).toContainText('オーナー')
  })

  test('TC-TREE-002: Display tree list', async ({ page }) => {
    // Create a tree
    await createTestTree(page, 'マイツリー1')

    // Reload to verify persistence
    await page.reload()
    await page.waitForTimeout(1000)

    // Verify tree is displayed in My Trees section
    const myTreesSection = page.locator('#my-trees-grid')
    await expect(myTreesSection.locator('.tree-card:has-text("マイツリー1")')).toBeVisible()
  })

  test('TC-TREE-003: Access tree editor', async ({ page }) => {
    // Create a tree
    await createTestTree(page, 'エディタテスト')

    // Click on tree card
    await page.click('.tree-card:has-text("エディタテスト")')

    // Should navigate to editor with tree query parameter
    await page.waitForURL('**/index.html?tree=*')
    expect(page.url()).toMatch(/tree=\d+/)

    // Tree header should display tree name
    await expect(page.locator('#tree-header')).toContainText('エディタテスト')
    await expect(page.locator('#tree-header')).toContainText('オーナー')
  })
})

// ===========================================
// 3. Node Operations Tests
// ===========================================

test.describe('Node Operations', () => {
  let treeId

  test.beforeEach(async ({ page, context }) => {
    await clearTestData(page)
    await testLogin(page, 1)

    // Create a test tree
    await createTestTree(page, 'ノードテスト')

    // Navigate to editor
    await page.click('.tree-card:has-text("ノードテスト")')
    await page.waitForURL('**/index.html?tree=*')

    // Extract tree ID from URL
    const url = new URL(page.url())
    treeId = url.searchParams.get('tree')
  })

  test('TC-NODE-001: Create a node', async ({ page }) => {
    // Handle prompt dialogs for node creation
    page.on('dialog', async dialog => {
      if (dialog.message().includes('ルートノードのタイトル')) {
        await dialog.accept('テストノード')
      } else if (dialog.message().includes('作成者名')) {
        await dialog.accept('Test User 1')
      }
    })

    // Click add root node button
    await page.click('#add-root-btn')

    // Wait for node to be created
    await page.waitForTimeout(2000)

    // Verify node appears in tree view
    await expect(page.locator('.tree-item:has-text("テストノード")')).toBeVisible()
  })

  test('TC-NODE-002: Edit a node', async ({ page }) => {
    // Create a node first
    page.on('dialog', async dialog => {
      if (dialog.message().includes('ルートノードのタイトル')) {
        await dialog.accept('編集テスト')
      } else if (dialog.message().includes('作成者名')) {
        await dialog.accept('Test User 1')
      }
    })

    await page.click('#add-root-btn')
    await page.waitForTimeout(2000)

    // Select the node
    await page.click('.tree-item:has-text("編集テスト")')
    await page.waitForTimeout(1000)

    // Edit title
    await page.fill('#title-input', '更新されたタイトル')

    // Save (assuming auto-save or update button)
    await page.waitForTimeout(1000)

    // Verify updated title in tree view
    await expect(page.locator('.tree-item:has-text("更新されたタイトル")')).toBeVisible()
  })

  test('TC-NODE-003: Delete a node', async ({ page }) => {
    // Create a node first
    page.on('dialog', async dialog => {
      if (dialog.message().includes('ルートノードのタイトル')) {
        await dialog.accept('削除テスト')
      } else if (dialog.message().includes('作成者名')) {
        await dialog.accept('Test User 1')
      } else if (dialog.message().includes('削除')) {
        await dialog.accept()
      }
    })

    await page.click('#add-root-btn')
    await page.waitForTimeout(2000)

    // Select the node
    await page.click('.tree-item:has-text("削除テスト")')
    await page.waitForTimeout(1000)

    // Delete node
    await page.click('#delete-node-btn')
    await page.waitForTimeout(2000)

    // Verify node is removed from tree view
    await expect(page.locator('.tree-item:has-text("削除テスト")')).not.toBeVisible()
  })
})

// ===========================================
// 4. Permission Tests
// ===========================================

test.describe('Permissions', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page)
  })

  test('TC-PERM-001: Owner has full access', async ({ page }) => {
    // Login as owner (user 1)
    await testLogin(page, 1)

    // Create a tree
    await createTestTree(page, 'オーナーテスト')

    // Navigate to editor
    await page.click('.tree-card:has-text("オーナーテスト")')
    await page.waitForURL('**/index.html?tree=*')

    // Verify owner badge is displayed
    await expect(page.locator('#tree-header')).toContainText('オーナー')

    // Verify edit controls are enabled
    await expect(page.locator('#add-root-btn')).toBeEnabled()
  })

  test('TC-PERM-003: Viewer has read-only access', async ({ page, context }) => {
    // Login as owner and create a tree
    await testLogin(page, 1)
    await createTestTree(page, '閲覧者テスト')

    // Get tree ID
    await page.click('.tree-card:has-text("閲覧者テスト")')
    await page.waitForURL('**/index.html?tree=*')
    const url = new URL(page.url())
    const treeId = url.searchParams.get('tree')

    // Add user 2 as viewer via API
    const apiContext = context
    await page.request.post(`${BASE_URL}/api/trees/${treeId}/members`, {
      data: {
        user_id: 2,
        role: 'viewer'
      }
    })

    // Logout
    await page.click('button:has-text("ログアウト")')
    await page.waitForURL('**/login.html')

    // Login as viewer (user 2)
    await testLogin(page, 2)

    // Navigate to the shared tree
    await page.goto(`${BASE_URL}/index.html?tree=${treeId}`)
    await page.waitForTimeout(1000)

    // Verify viewer badge is displayed
    await expect(page.locator('#tree-header')).toContainText('閲覧者')
    await expect(page.locator('#tree-header')).toContainText('閲覧専用')

    // Verify edit controls are disabled
    await expect(page.locator('#add-root-btn')).toBeDisabled()
  })

  test('TC-PERM-004: Viewer API edit attempt is rejected', async ({ page }) => {
    // Login as owner and create a tree
    await testLogin(page, 1)
    await createTestTree(page, 'API権限テスト')

    // Get tree ID
    await page.click('.tree-card:has-text("API権限テスト")')
    await page.waitForURL('**/index.html?tree=*')
    const url = new URL(page.url())
    const treeId = url.searchParams.get('tree')

    // Add user 2 as viewer
    await page.request.post(`${BASE_URL}/api/trees/${treeId}/members`, {
      data: {
        user_id: 2,
        role: 'viewer'
      }
    })

    // Logout and login as viewer
    await page.click('button:has-text("ログアウト")')
    await testLogin(page, 2)

    // Try to create a node via API
    const response = await page.request.post(`${BASE_URL}/api/trees/${treeId}/nodes`, {
      data: {
        title: '不正ノード',
        content: 'テスト',
        author: 'Test User 2'
      }
    })

    // Should be rejected with 403
    expect(response.status()).toBe(403)
    const data = await response.json()
    expect(data.error).toContain('permission')
  })
})

// ===========================================
// 5. Tree Isolation Tests
// ===========================================

test.describe('Tree Isolation', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page)
  })

  test('TC-ISOL-003: Access denied to non-member tree', async ({ page }) => {
    // Login as user 1 and create a tree
    await testLogin(page, 1)
    await createTestTree(page, 'プライベートツリー')

    // Get tree ID
    await page.click('.tree-card:has-text("プライベートツリー")')
    await page.waitForURL('**/index.html?tree=*')
    const url = new URL(page.url())
    const treeId = url.searchParams.get('tree')

    // Logout
    await page.click('button:has-text("ログアウト")')
    await page.waitForURL('**/login.html')

    // Login as user 2
    await testLogin(page, 2)

    // Try to access user 1's tree
    await page.goto(`${BASE_URL}/index.html?tree=${treeId}`)

    // Should be redirected to My Page with error
    await page.waitForTimeout(2000)
    await page.waitForURL('**/my-page.html')
    expect(page.url()).toContain('/my-page.html')
  })

  test('TC-ISOL-002: Cannot create cross-tree parent-child relation', async ({ page }) => {
    // Login and create two trees
    await testLogin(page, 1)

    await createTestTree(page, 'ツリーA')
    await page.waitForTimeout(500)
    await createTestTree(page, 'ツリーB')

    // Get both tree IDs by navigating to each
    await page.click('.tree-card:has-text("ツリーA")')
    await page.waitForURL('**/index.html?tree=*')
    const treeAId = new URL(page.url()).searchParams.get('tree')

    await page.click('a:has-text("マイページ")')
    await page.waitForURL('**/my-page.html')

    await page.click('.tree-card:has-text("ツリーB")')
    await page.waitForURL('**/index.html?tree=*')
    const treeBId = new URL(page.url()).searchParams.get('tree')

    // Create a node in tree A
    const nodeAResponse = await page.request.post(`${BASE_URL}/api/trees/${treeAId}/nodes`, {
      data: {
        title: 'ノードA',
        content: 'ツリーAのノード',
        author: 'Test User 1'
      }
    })
    const nodeAData = await nodeAResponse.json()
    const nodeAId = nodeAData.data.id

    // Create a node in tree B
    const nodeBResponse = await page.request.post(`${BASE_URL}/api/trees/${treeBId}/nodes`, {
      data: {
        title: 'ノードB',
        content: 'ツリーBのノード',
        author: 'Test User 1'
      }
    })
    const nodeBData = await nodeBResponse.json()
    const nodeBId = nodeBData.data.id

    // Try to create cross-tree relation
    const relationResponse = await page.request.post(`${BASE_URL}/api/trees/${treeAId}/relations`, {
      data: {
        parent_node_id: nodeAId,
        child_node_id: nodeBId
      }
    })

    // Should be rejected with 400
    expect(relationResponse.status()).toBe(400)
    const data = await relationResponse.json()
    expect(data.error).toContain('same tree')
  })
})
