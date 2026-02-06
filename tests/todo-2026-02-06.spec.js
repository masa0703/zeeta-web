// @ts-check
import { test, expect } from '@playwright/test'

/**
 * テストスイート: 2026-02-06 TODO項目
 *
 * テスト対象:
 * 1. 招待フロー改善（リダイレクト）
 * 2. 作成者フィールド（ドロップダウン、編集権限者のみ）
 * 3. 新規ノード作成時のデフォルト作成者
 * 4. 保存ショートカット
 * 5. タイトル入力欄のフォントサイズ
 */

const BASE_URL = 'http://localhost:3000'

// ===========================
// ヘルパー関数
// ===========================

async function testLogin(page, userId) {
  await page.goto(`${BASE_URL}/auth/test-login?user_id=${userId}`)
  await page.waitForURL('**/my-page.html')
}

async function createTree(page, name) {
  const response = await page.request.post(`${BASE_URL}/api/trees`, {
    data: { name, description: 'Test tree' }
  })
  const data = await response.json()
  return data.data
}

async function createNode(page, treeId, nodeData) {
  const response = await page.request.post(`${BASE_URL}/api/trees/${treeId}/nodes`, {
    data: nodeData
  })
  const data = await response.json()
  return data.data
}

async function sendInvitation(page, treeId, email, role) {
  const response = await page.request.post(`${BASE_URL}/api/trees/${treeId}/invitations`, {
    data: { email, role }
  })
  const data = await response.json()
  return data.data
}

async function clearTestData(page) {
  try {
    await page.request.delete(`${BASE_URL}/api/test/clear`)
  } catch (e) {
    // Ignore errors
  }
}

// ===========================
// 招待フロー改善テスト
// ===========================

test.describe('招待フローリダイレクト', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page)
  })

  test('TC-INV-REDIRECT-001: ログインページにリダイレクトパラメータが含まれる', async ({ page }) => {
    // User1 でログインしてツリー作成と招待
    await testLogin(page, 1)
    const tree = await createTree(page, 'Redirect Test Tree')
    const invitation = await sendInvitation(page, tree.id, 'newuser@example.com', 'editor')

    // ログアウト
    await page.request.post(`${BASE_URL}/auth/logout`)

    // 招待リンクにアクセス（未ログイン）
    const invitationUrl = `${BASE_URL}/accept-invitation.html?token=${invitation.token}`
    await page.goto(invitationUrl)

    // ログインページにリダイレクトされることを確認
    await page.waitForURL('**/login.html**')

    // URLにredirectパラメータが含まれることを確認
    const url = new URL(page.url())
    const redirectParam = url.searchParams.get('redirect')
    expect(redirectParam).toBeTruthy()
    expect(redirectParam).toContain('accept-invitation.html')
    expect(redirectParam).toContain(invitation.token)

    console.log('✅ TC-INV-REDIRECT-001: Login page contains redirect parameter')
  })
})

// ===========================
// 作成者フィールドテスト
// ===========================

test.describe('作成者フィールド', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page)
  })

  test('TC-AUTHOR-001: 作成者フィールドがドロップダウンで表示される', async ({ page }) => {
    // User1 でログイン
    await testLogin(page, 1)
    const tree = await createTree(page, 'Author Test Tree')
    const node = await createNode(page, tree.id, {
      title: 'Test Node',
      content: 'Test content',
      author: 'Test Author',
      root_position: 0
    })

    // エディタページにアクセス
    await page.goto(`${BASE_URL}/index.html?tree=${tree.id}`)
    await page.waitForSelector('.tree-item')

    // ノードをクリック
    await page.click(`.tree-item[data-node-id="${node.id}"]`)
    await page.waitForSelector('#node-author')

    // 作成者フィールドがselectであることを確認
    const authorField = await page.$('#node-author')
    const tagName = await authorField.evaluate(el => el.tagName.toLowerCase())
    expect(tagName).toBe('select')

    console.log('✅ TC-AUTHOR-001: Author field is a dropdown (select element)')
  })

  test('TC-AUTHOR-002: 編集権限者のみがドロップダウンに表示される', async ({ page, browser }) => {
    // User1 (オーナー) でツリー作成
    await testLogin(page, 1)
    const tree = await createTree(page, 'Members Test Tree')

    // User2 を編集者として追加
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await testLogin(page2, 2)
    await page.request.post(`${BASE_URL}/api/trees/${tree.id}/members`, {
      data: { user_id: 2, role: 'editor' }
    })

    // User3 を閲覧者として追加
    const ctx3 = await browser.newContext()
    const page3 = await ctx3.newPage()
    await testLogin(page3, 3)
    await page.request.post(`${BASE_URL}/api/trees/${tree.id}/members`, {
      data: { user_id: 3, role: 'viewer' }
    })

    // ノード作成
    const node = await createNode(page, tree.id, {
      title: 'Test Node',
      content: '',
      author: 'Owner',
      root_position: 0
    })

    // エディタページにアクセス
    await page.goto(`${BASE_URL}/index.html?tree=${tree.id}`)
    await page.waitForSelector('.tree-item')

    // ノードをクリック
    await page.click(`.tree-item[data-node-id="${node.id}"]`)
    await page.waitForSelector('#node-author')

    // ドロップダウンの選択肢を取得
    const options = await page.$$eval('#node-author option', opts =>
      opts.map(o => o.textContent.trim())
    )

    // メンバー一覧を取得して確認
    const membersRes = await page.request.get(`${BASE_URL}/api/trees/${tree.id}/members`)
    const membersData = await membersRes.json()
    const editors = membersData.data.filter(m => m.role === 'owner' || m.role === 'editor')
    const viewers = membersData.data.filter(m => m.role === 'viewer')

    // 編集者の数と選択肢の数が一致することを確認（既存の作成者含む可能性あり）
    expect(options.length).toBeGreaterThanOrEqual(editors.length)

    // 閲覧者がリストに含まれていないことを確認
    for (const viewer of viewers) {
      const viewerName = viewer.display_name || viewer.email
      expect(options).not.toContain(viewerName)
    }

    await ctx2.close()
    await ctx3.close()

    console.log('✅ TC-AUTHOR-002: Only editors and owners are shown in dropdown')
  })
})

// ===========================
// デフォルト作成者テスト
// ===========================

test.describe('デフォルト作成者', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page)
  })

  test('TC-AUTHOR-DEFAULT-001: ルートノード作成時にログインユーザーがデフォルト作成者', async ({ page }) => {
    await testLogin(page, 1)
    const tree = await createTree(page, 'Default Author Test')

    // エディタページにアクセス
    await page.goto(`${BASE_URL}/index.html?tree=${tree.id}`)
    await page.waitForLoadState('networkidle')

    // ログインユーザー情報を取得
    const meRes = await page.request.get(`${BASE_URL}/auth/me`)
    const meData = await meRes.json()
    const expectedAuthor = meData.data.display_name || meData.data.email

    // ルートノード追加ボタンをクリック
    // promptをモック
    await page.evaluate(() => {
      window.originalPrompt = window.prompt
      window.promptCalls = []
      window.prompt = (message, defaultValue) => {
        window.promptCalls.push({ message, defaultValue })
        if (message.includes('タイトル')) {
          return 'New Root Node'
        }
        return null // 作成者のプロンプトがあれば null を返す（キャンセル扱い）
      }
    })

    await page.click('#add-root-btn')
    await page.waitForTimeout(500)

    // プロンプトの呼び出し回数を確認（タイトルのみ、作成者なし）
    const promptCalls = await page.evaluate(() => window.promptCalls)
    const authorPromptCalled = promptCalls.some(c => c.message.includes('作成者'))
    expect(authorPromptCalled).toBe(false)

    // 作成されたノードを確認
    await page.waitForSelector('.tree-item')
    const nodesRes = await page.request.get(`${BASE_URL}/api/trees/${tree.id}/nodes`)
    const nodesData = await nodesRes.json()
    const newNode = nodesData.data.find(n => n.title === 'New Root Node')

    expect(newNode).toBeTruthy()
    expect(newNode.author).toBe(expectedAuthor)

    console.log('✅ TC-AUTHOR-DEFAULT-001: Root node uses logged-in user as default author')
  })

  test('TC-AUTHOR-DEFAULT-002: 子ノード作成時にログインユーザーがデフォルト作成者', async ({ page }) => {
    await testLogin(page, 1)
    const tree = await createTree(page, 'Child Node Author Test')
    const parentNode = await createNode(page, tree.id, {
      title: 'Parent Node',
      content: '',
      author: 'Parent Author',
      root_position: 0
    })

    // エディタページにアクセス
    await page.goto(`${BASE_URL}/index.html?tree=${tree.id}`)
    await page.waitForSelector('.tree-item')

    // ログインユーザー情報を取得
    const meRes = await page.request.get(`${BASE_URL}/auth/me`)
    const meData = await meRes.json()
    const expectedAuthor = meData.data.display_name || meData.data.email

    // promptをモック
    await page.evaluate(() => {
      window.promptCalls = []
      window.prompt = (message, defaultValue) => {
        window.promptCalls.push({ message, defaultValue })
        if (message.includes('タイトル')) {
          return 'New Child Node'
        }
        return null
      }
    })

    // 子ノード追加ボタンをクリック
    await page.click(`.add-child-btn[data-node-id="${parentNode.id}"]`)
    await page.waitForTimeout(500)

    // プロンプトの呼び出しを確認
    const promptCalls = await page.evaluate(() => window.promptCalls)
    const authorPromptCalled = promptCalls.some(c => c.message.includes('作成者'))
    expect(authorPromptCalled).toBe(false)

    // 作成されたノードを確認
    const nodesRes = await page.request.get(`${BASE_URL}/api/trees/${tree.id}/nodes`)
    const nodesData = await nodesRes.json()
    const childNode = nodesData.data.find(n => n.title === 'New Child Node')

    expect(childNode).toBeTruthy()
    expect(childNode.author).toBe(expectedAuthor)

    console.log('✅ TC-AUTHOR-DEFAULT-002: Child node uses logged-in user as default author')
  })
})

// ===========================
// 保存ショートカットテスト
// ===========================

test.describe('保存ショートカット', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page)
  })

  test('TC-SHORTCUT-001: Cmd/Ctrl+Enterで保存できる', async ({ page }) => {
    await testLogin(page, 1)
    const tree = await createTree(page, 'Shortcut Test Tree')
    const node = await createNode(page, tree.id, {
      title: 'Original Title',
      content: '',
      author: 'Test Author',
      root_position: 0
    })

    // エディタページにアクセス
    await page.goto(`${BASE_URL}/index.html?tree=${tree.id}`)
    await page.waitForSelector('.tree-item')

    // ノードをクリック
    await page.click(`.tree-item[data-node-id="${node.id}"]`)
    await page.waitForSelector('#node-title')

    // タイトルを編集
    await page.fill('#node-title', 'Updated Title')

    // Cmd+Enter または Ctrl+Enter を押下
    const isMac = process.platform === 'darwin'
    await page.keyboard.press(isMac ? 'Meta+Enter' : 'Control+Enter')

    // 保存完了を待つ
    await page.waitForTimeout(1000)

    // ノードが更新されていることを確認
    const nodesRes = await page.request.get(`${BASE_URL}/api/trees/${tree.id}/nodes`)
    const nodesData = await nodesRes.json()
    const updatedNode = nodesData.data.find(n => n.id === node.id)

    expect(updatedNode.title).toBe('Updated Title')

    console.log('✅ TC-SHORTCUT-001: Save shortcut works')
  })

  test('TC-SHORTCUT-002: 保存ボタンにツールチップが表示される', async ({ page }) => {
    await testLogin(page, 1)
    const tree = await createTree(page, 'Tooltip Test Tree')
    const node = await createNode(page, tree.id, {
      title: 'Test Node',
      content: '',
      author: 'Test Author',
      root_position: 0
    })

    // エディタページにアクセス
    await page.goto(`${BASE_URL}/index.html?tree=${tree.id}`)
    await page.waitForSelector('.tree-item')

    // ノードをクリック
    await page.click(`.tree-item[data-node-id="${node.id}"]`)
    await page.waitForSelector('#save-node-btn')

    // 保存ボタンのtitle属性を確認
    const title = await page.$eval('#save-node-btn', btn => btn.getAttribute('title'))
    expect(title).toBeTruthy()
    expect(title).toContain('保存')
    expect(title).toMatch(/⌘|Ctrl/)
    expect(title).toContain('Enter')

    console.log('✅ TC-SHORTCUT-002: Save button has tooltip with shortcut info')
  })
})

// ===========================
// UIテスト
// ===========================

test.describe('UI改善', () => {
  test.beforeEach(async ({ page }) => {
    await clearTestData(page)
  })

  test('TC-UI-TITLE-001: タイトル入力欄のフォントサイズが大きい', async ({ page }) => {
    await testLogin(page, 1)
    const tree = await createTree(page, 'UI Test Tree')
    const node = await createNode(page, tree.id, {
      title: 'Test Node',
      content: '',
      author: 'Test Author',
      root_position: 0
    })

    // エディタページにアクセス
    await page.goto(`${BASE_URL}/index.html?tree=${tree.id}`)
    await page.waitForSelector('.tree-item')

    // ノードをクリック
    await page.click(`.tree-item[data-node-id="${node.id}"]`)
    await page.waitForSelector('#node-title')

    // タイトル入力欄のクラスを確認
    const hasTextLg = await page.$eval('#node-title', el => el.classList.contains('text-lg'))
    expect(hasTextLg).toBe(true)

    // フォントサイズを確認
    const fontSize = await page.$eval('#node-title', el => window.getComputedStyle(el).fontSize)
    const fontSizePx = parseFloat(fontSize)
    expect(fontSizePx).toBeGreaterThanOrEqual(18) // text-lg = 1.125rem = 18px

    console.log('✅ TC-UI-TITLE-001: Title input has larger font size')
  })
})

// ===========================
// テストスイート終了
// ===========================

console.log('✅ TODO 2026-02-06 Tests: 8 test cases')
