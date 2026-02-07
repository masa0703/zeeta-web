import { test, expect } from '@playwright/test'

/**
 * formatDate関数のタイムゾーン変換テスト
 * SQLiteのUTC時刻がローカルタイムゾーンで正しく表示されることを確認
 */

test.describe('formatDate タイムゾーン変換', () => {
  test('SQLite形式のUTC時刻をローカル時刻に変換', async ({ page }) => {
    // app.jsを読み込んでformatDate関数をテスト
    await page.goto('http://localhost:3000/index.html?tree=1')

    // formatDate関数をブラウザ内で実行
    const result = await page.evaluate(() => {
      // SQLite形式の日付文字列 (UTC)
      const utcDateString = '2026-02-07 01:48:00'

      // formatDate関数が定義されているか確認
      if (typeof formatDate !== 'function') {
        return { error: 'formatDate function not found' }
      }

      const formatted = formatDate(utcDateString)

      // ローカルタイムゾーンのオフセットを取得（分単位）
      const offsetMinutes = new Date().getTimezoneOffset()
      const offsetHours = -offsetMinutes / 60 // JSTなら+9

      return {
        input: utcDateString,
        output: formatted,
        offsetHours: offsetHours,
        expectedContains: offsetHours === 9 ? '10:48' : null // JSTなら10:48を含むはず
      }
    })

    console.log('Test result:', result)

    // エラーチェック
    expect(result.error).toBeUndefined()

    // JSTの場合、01:48 UTC は 10:48 JST になるはず
    if (result.offsetHours === 9) {
      expect(result.output).toContain('10:48')
      expect(result.output).not.toContain('01:48')
    }

    // 出力形式の確認
    expect(result.output).toMatch(/\d{4}\/\d{2}\/\d{2}/)
  })

  test('ISO形式（Tあり、Zなし）のUTC時刻をローカル時刻に変換', async ({ page }) => {
    await page.goto('http://localhost:3000/index.html?tree=1')

    const result = await page.evaluate(() => {
      const utcDateString = '2026-02-07T01:48:00'

      if (typeof formatDate !== 'function') {
        return { error: 'formatDate function not found' }
      }

      const formatted = formatDate(utcDateString)
      const offsetMinutes = new Date().getTimezoneOffset()
      const offsetHours = -offsetMinutes / 60

      return {
        input: utcDateString,
        output: formatted,
        offsetHours: offsetHours
      }
    })

    console.log('Test result (ISO format):', result)

    expect(result.error).toBeUndefined()

    // JSTの場合、01:48 UTC は 10:48 JST になるはず
    if (result.offsetHours === 9) {
      expect(result.output).toContain('10:48')
    }
  })

  test('既にZが付いたISO形式は正しく変換', async ({ page }) => {
    await page.goto('http://localhost:3000/index.html?tree=1')

    const result = await page.evaluate(() => {
      const utcDateString = '2026-02-07T01:48:00Z'

      if (typeof formatDate !== 'function') {
        return { error: 'formatDate function not found' }
      }

      const formatted = formatDate(utcDateString)
      const offsetMinutes = new Date().getTimezoneOffset()
      const offsetHours = -offsetMinutes / 60

      return {
        input: utcDateString,
        output: formatted,
        offsetHours: offsetHours
      }
    })

    console.log('Test result (with Z):', result)

    expect(result.error).toBeUndefined()

    // JSTの場合、01:48 UTC は 10:48 JST になるはず
    if (result.offsetHours === 9) {
      expect(result.output).toContain('10:48')
    }
  })

  test('実際のノード保存後の更新日がローカル時刻で表示される', async ({ page }) => {
    // テストユーザーでログイン
    await page.goto('http://localhost:3000/auth/test-login?user_id=1')
    await page.waitForURL('**/my-page.html')

    // ツリーがなければ作成
    const treesResponse = await page.evaluate(async () => {
      const res = await fetch('/api/trees')
      return res.json()
    })

    let treeId
    if (treesResponse.data && treesResponse.data.length > 0) {
      treeId = treesResponse.data[0].id
    } else {
      // ツリーを作成
      const createRes = await page.evaluate(async () => {
        const res = await fetch('/api/trees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Test Tree for Date' })
        })
        return res.json()
      })
      treeId = createRes.data.id
    }

    // エディタに移動
    await page.goto(`http://localhost:3000/index.html?tree=${treeId}`)
    await page.waitForLoadState('networkidle')

    // ノードを作成または選択
    const nodes = await page.evaluate(async (tid) => {
      const res = await fetch(`/api/trees/${tid}/nodes`)
      return res.json()
    }, treeId)

    let nodeId
    if (nodes.data && nodes.data.length > 0) {
      nodeId = nodes.data[0].id
    } else {
      // ノードを作成
      const createNodeRes = await page.evaluate(async (tid) => {
        const res = await fetch(`/api/trees/${tid}/nodes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Test Node', content: '', author: 'Test User 1' })
        })
        return res.json()
      }, treeId)
      nodeId = createNodeRes.data.id
    }

    // 現在時刻を記録
    const beforeSave = new Date()

    // ノードを更新
    await page.evaluate(async ({ tid, nid }) => {
      const res = await fetch(`/api/trees/${tid}/nodes/${nid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated at ' + new Date().toISOString(),
          content: 'test',
          author: 'Test User 1'
        })
      })
      return res.json()
    }, { tid: treeId, nid: nodeId })

    // 少し待ってからUIを確認
    await page.waitForTimeout(500)

    // ノードを選択して更新日を取得
    await page.click(`.tree-item[data-node-id="${nodeId}"]`)
    await page.waitForTimeout(500)

    // 更新日の表示を取得
    const updatedAtText = await page.evaluate(() => {
      const elements = document.querySelectorAll('.text-sm.text-gray-700')
      for (const el of elements) {
        const label = el.previousElementSibling
        if (label && label.textContent.includes('更新日')) {
          return el.textContent
        }
      }
      return null
    })

    console.log('Updated at display:', updatedAtText)
    console.log('Current local time:', beforeSave.toLocaleString('ja-JP'))

    // 現在のローカル時刻と比較（数分以内であること）
    if (updatedAtText) {
      // 表示されている時刻をパース
      const match = updatedAtText.match(/(\d{2}):(\d{2})/)
      if (match) {
        const displayedHour = parseInt(match[1])
        const displayedMinute = parseInt(match[2])
        const currentHour = beforeSave.getHours()
        const currentMinute = beforeSave.getMinutes()

        // 時刻が1時間以内の差であること（タイムゾーン変換が正しければ）
        const hourDiff = Math.abs(displayedHour - currentHour)
        expect(hourDiff).toBeLessThanOrEqual(1)

        console.log(`Displayed: ${displayedHour}:${displayedMinute}, Current: ${currentHour}:${currentMinute}`)
      }
    }
  })
})
