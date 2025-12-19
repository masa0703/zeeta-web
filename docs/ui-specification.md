# UI画面定義書

このドキュメントは、アウトラインエディタのユーザーインターフェース（UI）の詳細仕様を記載します。

## 目次

- [画面全体構成](#画面全体構成)
- [ヘッダー部](#ヘッダー部)
- [左ペイン（ツリー表示部）](#左ペインツリー表示部)
- [右ペイン（ノード詳細編集部）](#右ペインノード詳細編集部)
- [共通UI要素](#共通ui要素)
- [インタラクション仕様](#インタラクション仕様)
- [状態管理](#状態管理)
- [レスポンシブ対応](#レスポンシブ対応)

---

## 画面全体構成

### レイアウト構造

```
┌─────────────────────────────────────────────────────┐
│ ヘッダー                                              │
│ [ロゴ] アウトラインエディタ    [検索バー]  [version] │
├──────────────────┬──────────────────────────────────┤
│                  │                                  │
│  左ペイン         │  右ペイン                         │
│  (ツリー表示)     │  (ノード詳細)                     │
│                  │                                  │
│  [ツールバー]     │  [親ノード表示]                   │
│  - ルート追加     │  [タイトル入力]                   │
│  - 表示モード     │  [作成者表示]                     │
│                  │  [内容入力エリア]                 │
│  [ツリー構造]     │  [保存/削除ボタン]                │
│  ├─ ノード1       │                                  │
│  │  └─ 子1       │                                  │
│  └─ ノード2       │                                  │
│                  │                                  │
│                  │                                  │
│  (高さ100%)       │  (高さ100%)                      │
└──────────────────┴──────────────────────────────────┘
```

### 基本スタイル
- **背景色**: `bg-gray-50`（全体）
- **フォント**: システムフォント (sans-serif)
- **レイアウト**: Flexbox による2カラムレイアウト
- **左ペイン幅**: `w-1/3`（約33%）
- **右ペイン幅**: `w-2/3`（約67%）
- **最小高さ**: `min-h-screen`（画面全体）

---

## ヘッダー部

### 構成要素

#### 1. ロゴ・タイトル
- **位置**: 左端
- **テキスト**: "📝 アウトラインエディタ"
- **スタイル**:
  - フォントサイズ: `text-xl`
  - フォントウェイト: `font-bold`
  - 色: `text-gray-800`

#### 2. 検索バー
- **位置**: 中央
- **プレースホルダー**: "ノードを検索..."
- **スタイル**:
  - 幅: `w-96`（384px）
  - 高さ: `h-10`
  - 背景: `bg-white`
  - ボーダー: `border border-gray-300`
  - 角丸: `rounded-lg`
  - パディング: `px-4`
- **機能**:
  - リアルタイム検索（入力時に即座に検索実行）
  - タイトルと内容を部分一致検索
  - 検索結果はツリー上でハイライト表示（黄色リング）

#### 3. バージョン表示
- **位置**: 右端
- **ID**: `#version-badge`
- **表示例**: "build #72"
- **スタイル**:
  - 背景: `bg-blue-100`
  - テキスト色: `text-blue-800`
  - パディング: `px-3 py-1`
  - 角丸: `rounded-full`
  - フォントサイズ: `text-sm`

### ヘッダー全体スタイル
- **背景色**: `bg-white`
- **ボーダー**: `border-b border-gray-200`
- **パディング**: `p-4`
- **シャドウ**: `shadow-sm`
- **配置**: `flex items-center justify-between`

---

## 左ペイン（ツリー表示部）

### ツールバー

#### 1. ルートノード追加ボタン
- **アイコン**: `fas fa-plus-circle`
- **テキスト**: "ルートノード追加"
- **スタイル**:
  - 背景: `bg-blue-500 hover:bg-blue-600`
  - テキスト色: `text-white`
  - パディング: `px-4 py-2`
  - 角丸: `rounded-lg`
  - シャドウ: `shadow hover:shadow-md`
- **動作**:
  1. クリック時にプロンプトでタイトル入力
  2. 続いてプロンプトで作成者入力
  3. API `POST /api/nodes` でノード作成
  4. ツリーを再描画

#### 2. 表示モード切替ボタン
- **ID**: `#toggle-tree-mode-btn`
- **アイコン**: `fas fa-exchange-alt`
- **テキスト**: "逆ツリー表示" または "通常表示"
- **スタイル**:
  - 背景: `bg-gray-500 hover:bg-gray-600`
  - テキスト色: `text-white`
  - パディング: `px-4 py-2`
  - 角丸: `rounded-lg`
- **動作**:
  - 通常モード: 親→子の階層表示
  - 逆ツリーモード: 子→親の階層表示（親が複数の場合展開）

### ツリー表示エリア

#### ノード要素（.tree-item）

**構造**:
```html
<div class="tree-item flex items-center py-0 px-2 rounded [状態クラス]"
     data-node-id="{id}"
     data-node-path="{path}">
  <span class="expand-icon">[▼/▶]</span>
  <span class="node-icon">[アイコン]</span>
  <span class="node-title">{タイトル}</span>
  <div class="node-actions">
    <button class="add-child-btn">子追加</button>
  </div>
</div>
```

**状態クラス**:
- `active`: 選択中（背景: `bg-blue-100 border-l-4 border-blue-500`）
- `duplicate-active`: 複数親を持つノードが選択中（背景: `bg-purple-100 border-l-4 border-purple-500`）
- `ring-2 ring-yellow-300`: 検索結果にヒット

**スタイル詳細**:
- **基本**:
  - カーソル: `cursor-move`（ドラッグ可能を示唆）
  - ユーザー選択: `user-select: none`
  - 行の高さ: `line-height: 1.2`
  - パディング: `py-0 px-2`（上下0、左右8px）
  - 角丸: `rounded`
- **ホバー時**:
  - 背景: `hover:bg-gray-100`

**アイコン**:
- **展開/折りたたみアイコン** (`.expand-icon`)
  - 子がいる場合のみ表示
  - 展開時: `▼` (`fas fa-chevron-down`)
  - 折りたたみ時: `▶` (`fas fa-chevron-right`)
  - 色: `text-gray-400`
  - クリックで子ノードの表示/非表示を切り替え

- **ノードアイコン** (`.node-icon`)
  - ルートノード: `📄` (`fas fa-file`)
  - 子ノード: `📎` (`fas fa-paperclip`)
  - マージン: `mx-2`

**タイトル** (`.node-title`)
- フォントウェイト: `font-medium`
- 色: `text-gray-700`
- 余白: `flex-1`（残りスペースを埋める）

**操作ボタン** (`.node-actions`)
- **子追加ボタン** (`.add-child-btn`)
  - アイコン: `fas fa-plus`
  - 背景: `bg-green-500 hover:bg-green-600`
  - テキスト色: `text-white`
  - サイズ: `text-xs`
  - パディング: `px-2 py-1`
  - 角丸: `rounded`
  - 動作: プロンプトで子ノード作成

#### 階層インデント
- **通常ツリー**: `padding-left: ${level * 20}px`
- **逆ツリー**: `padding-left: ${level * 20}px`
- レベル0（ルート）: インデントなし
- レベル1: 20px
- レベル2: 40px
- 以降、20pxずつ増加

#### ドラッグ&ドロップ

**ライブラリ**: SortableJS

**設定**:
```javascript
{
  animation: 150,
  ghostClass: 'sortable-ghost',
  chosenClass: 'sortable-chosen',
  dragClass: 'sortable-drag',
  onEnd: (evt) => { /* 並び替え処理 */ }
}
```

**視覚フィードバック**:
- **ドラッグ中** (`.sortable-drag`)
  - 不透明度: `opacity: 0.5`
  - 背景: `bg-blue-200`
- **ドロップ先** (`.sortable-ghost`)
  - 背景: `bg-blue-50`
  - ボーダー: `border-2 border-dashed border-blue-300`

### スクロール
- **オーバーフロー**: `overflow-y: auto`
- **最大高さ**: `calc(100vh - 200px)`
- **スクロールバースタイル**: ブラウザデフォルト

---

## 右ペイン（ノード詳細編集部）

### 親ノード表示エリア

#### 表示条件
- **ルートノード**: 非表示（`style="display: none"`）
- **非ルートノード**: 表示

#### レイアウト
```html
<div id="parent-nodes-section" class="bg-purple-50 border border-purple-200 rounded p-4 mb-4">
  <h3 class="font-bold mb-2">
    <i class="fas fa-sitemap text-purple-600"></i>
    親ノード (2)
  </h3>
  <div class="space-y-2" id="parent-nodes-list">
    <!-- 親ノードカード -->
    <div class="bg-white p-3 rounded shadow-sm flex items-center justify-between">
      <span class="text-purple-700 font-medium">親ノードのタイトル</span>
      <button class="remove-parent-btn text-red-500 hover:text-red-700"
              data-parent-id="123">
        <i class="fas fa-times"></i>
      </button>
    </div>
  </div>
</div>
```

#### スタイル詳細
- **セクション全体**:
  - 背景: `bg-purple-50`
  - ボーダー: `border border-purple-200`
  - 角丸: `rounded`
  - パディング: `p-4`
  - 下マージン: `mb-4`

- **ヘッダー**:
  - アイコン: `fas fa-sitemap` (紫色)
  - フォントウェイト: `font-bold`
  - 親の数を括弧内に表示

- **親ノードカード**:
  - 背景: `bg-white`
  - パディング: `p-3`
  - 角丸: `rounded`
  - シャドウ: `shadow-sm`
  - 配置: `flex items-center justify-between`
  - 間隔: `space-y-2`（カード間）

- **削除ボタン**:
  - アイコン: `fas fa-times`
  - 色: `text-red-500 hover:text-red-700`
  - 動作: 確認ダイアログ→親子関係削除

### タイトル入力欄

```html
<div class="mb-4">
  <label class="block text-sm font-bold text-gray-700 mb-2">
    タイトル
  </label>
  <input type="text"
         id="node-title"
         class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
         placeholder="ノードのタイトルを入力">
</div>
```

**スタイル**:
- 幅: `w-full`（100%）
- パディング: `px-3 py-2`
- ボーダー: `border border-gray-300`
- 角丸: `rounded-lg`
- フォーカス時:
  - アウトライン: なし (`focus:outline-none`)
  - リング: `focus:ring-2 focus:ring-blue-500`（青いリング）

### 作成者表示

```html
<div class="mb-4">
  <label class="block text-sm font-bold text-gray-700 mb-2">
    作成者
  </label>
  <div id="node-author" class="text-gray-600">
    作成者名
  </div>
</div>
```

**スタイル**:
- テキスト色: `text-gray-600`
- 読み取り専用（編集不可）

### 内容入力エリア

```html
<div class="mb-4">
  <label class="block text-sm font-bold text-gray-700 mb-2">
    内容
  </label>
  <textarea id="node-content"
            rows="10"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ノードの内容を入力（Markdown対応）"></textarea>
</div>
```

**スタイル**:
- 幅: `w-full`
- 行数: `rows="10"`
- パディング: `px-3 py-2`
- ボーダー: `border border-gray-300`
- 角丸: `rounded-lg`
- フォーカス時: タイトル入力欄と同じ
- リサイズ: 可能（デフォルト動作）

### 操作ボタン

#### 保存ボタン
```html
<button id="save-node-btn"
        class="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-lg shadow hover:shadow-md">
  <i class="fas fa-save"></i> 保存
</button>
```

**スタイル**:
- 背景: `bg-green-500 hover:bg-green-600`
- テキスト色: `text-white`
- パディング: `px-6 py-2`
- 角丸: `rounded-lg`
- シャドウ: `shadow hover:shadow-md`

#### 削除ボタン
```html
<button id="delete-node-btn"
        class="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg shadow hover:shadow-md">
  <i class="fas fa-trash"></i> 削除
</button>
```

**スタイル**:
- 背景: `bg-red-500 hover:bg-red-600`
- その他: 保存ボタンと同じ

#### 子ノード追加ボタン
```html
<button id="add-child-node-btn"
        class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg shadow hover:shadow-md">
  <i class="fas fa-plus"></i> 子ノード追加
</button>
```

**スタイル**:
- 背景: `bg-blue-500 hover:bg-blue-600`
- その他: 保存ボタンと同じ

### ボタン配置
- **配置**: `flex gap-2`（横並び、間隔8px）
- **順序**: 保存 → 削除 → 子ノード追加

### 未選択時の表示

```html
<div class="flex items-center justify-center h-full text-gray-400">
  <p class="text-lg">
    <i class="fas fa-hand-pointer"></i>
    左側のツリーからノードを選択してください
  </p>
</div>
```

**スタイル**:
- 中央配置: `flex items-center justify-center h-full`
- テキスト色: `text-gray-400`
- フォントサイズ: `text-lg`
- アイコン: `fas fa-hand-pointer`

---

## 共通UI要素

### ローディングオーバーレイ

```html
<div id="loading-overlay" style="display: none;">
  <div class="loading-spinner">
    <div class="spinner"></div>
    <div class="loading-text">処理中...</div>
  </div>
</div>
```

**スタイル**:
- **オーバーレイ**:
  - 位置: `position: fixed; top: 0; left: 0;`
  - サイズ: `width: 100vw; height: 100vh;`
  - 背景: `background: rgba(0, 0, 0, 0.5)`（半透明黒）
  - 配置: `display: flex; align-items: center; justify-content: center;`
  - z-index: `1000`

- **スピナー**:
  - ボーダーアニメーション（回転）
  - 色: 青と白
  - サイズ: `50px × 50px`

- **テキスト**:
  - 色: `white`
  - フォントサイズ: `text-lg`
  - 上マージン: `mt-4`

### トースト通知

```html
<div class="toast toast-success show">
  <div class="toast-icon">✓</div>
  <span class="toast-message">ノードを保存しました</span>
  <button class="toast-close">×</button>
</div>
```

**種類**:
- `toast-success`: 成功（緑）
- `toast-error`: エラー（赤）

**スタイル**:
- **基本**:
  - 位置: `position: fixed; bottom: 20px; right: 20px;`
  - 背景: 成功時 `bg-green-500`、エラー時 `bg-red-500`
  - テキスト色: `text-white`
  - パディング: `px-4 py-3`
  - 角丸: `rounded-lg`
  - シャドウ: `shadow-lg`
  - z-index: `1000`

- **アニメーション**:
  - 初期: `opacity: 0; transform: translateY(20px)`
  - 表示時 (`.show`): `opacity: 1; transform: translateY(0)`
  - トランジション: `0.3s ease-out`

- **閉じるボタン**:
  - 色: `text-white`
  - フォントサイズ: `text-xl`
  - カーソル: `cursor: pointer`

**表示時間**:
- デフォルト: 5秒
- 自動で非表示→削除

### 確認ダイアログ

**使用箇所**:
- ノード削除
- 親子関係削除

**実装**:
```javascript
if (confirm('本当に削除しますか？')) {
  // 削除処理
}
```

**スタイル**: ブラウザネイティブダイアログ

### プロンプトダイアログ

**使用箇所**:
- ノード作成（タイトル・作成者入力）

**実装**:
```javascript
const title = prompt('ルートノードのタイトルを入力してください:')
const author = prompt('作成者名を入力してください:')
```

**スタイル**: ブラウザネイティブダイアログ

---

## インタラクション仕様

### ノード選択

**トリガー**: ツリー内のノードをクリック

**動作**:
1. 前の選択を解除（`active`クラス削除）
2. クリックしたノードを選択（`active`クラス追加）
3. 右ペインに詳細を表示
   - タイトル、作成者、内容を入力欄に設定
   - 親ノードリストを取得・表示
4. `selectedNodeId`を更新

**視覚フィードバック**:
- 選択中ノード: 青背景 + 左ボーダー
- 複数親ノード選択時: 紫背景 + 左ボーダー

### ノード展開/折りたたみ

**トリガー**: 展開アイコン（▼/▶）をクリック

**動作**:
1. `expandedNodes` Setを更新（トグル）
2. ツリーを再描画
3. アイコンを更新（▼ ⇔ ▶）

**アニメーション**: なし（即座に表示/非表示）

### ドラッグ&ドロップ並び替え

**トリガー**: ノードをドラッグして別の位置にドロップ

**動作**:
1. SortableJSがDOM要素を並び替え
2. `onEnd`イベントで新しい位置を検出
3. 同一親内の場合:
   - API `PATCH /api/relations/:parent_id/:child_id/position` で位置更新
4. 異なる親への移動の場合:
   - 親子関係変更（循環参照チェック付き）
5. ツリーを再描画

**制約**:
- ルートノード間の並び替え: `root_position`を更新
- 子ノード間の並び替え: `position`を更新

### 検索

**トリガー**: 検索バーに入力

**動作**:
1. `input`イベントで即座に実行
2. API `GET /api/search?q={query}` で検索
3. 検索結果を `searchResults` に保存
4. ツリーを再描画
5. ヒットしたノードに黄色リング (`ring-2 ring-yellow-300`)

**検索対象**:
- ノードのタイトル
- ノードの内容

**検索方式**: 部分一致（大文字小文字区別なし）

### コピー&ペースト

#### コピー（Ctrl+C / Cmd+C）

**トリガー**: キーボードショートカット

**条件**:
- ノードが選択されている
- input/textareaにフォーカスがない

**動作**:
1. `selectedNodeId`を`clipboard`に保存
2. トースト通知「ノードをコピーしました」

#### ペースト（Ctrl+V / Cmd+V）

**トリガー**: キーボードショートカット

**条件**:
- ノードが選択されている
- クリップボードにノードがある
- input/textareaにフォーカスがない

**動作**:
1. 循環参照チェック
2. 既存の親子関係チェック
3. API `POST /api/relations` で親子関係追加
4. 親ノードを展開
5. ツリーを再描画
6. トースト通知「親子関係を追加しました」

**エラーケース**:
- 循環参照: 「循環参照です。この操作はできません。」
- 既存関係: 「この親子関係はすでに存在します」
- 自己参照: 「自己参照はできません」

### 保存

**トリガー**: 保存ボタンクリック

**動作**:
1. フォームから値を取得（タイトル、内容）
2. API `PUT /api/nodes/:id` で更新
3. `nodes`配列を更新
4. ツリーを再描画
5. トースト通知「ノードを保存しました」

### 削除

**トリガー**: 削除ボタンクリック

**動作**:
1. 確認ダイアログ表示
2. OKの場合:
   - API `DELETE /api/nodes/:id` でノード削除
   - `nodes`配列からノードを削除
   - `relations`配列から関連する親子関係を削除
   - 選択を解除
   - ツリーを再描画
   - 右ペインをクリア
   - トースト通知「ノードを削除しました」

**注意**:
- 子ノードがある場合も削除可能
- データベースのCASCADE制約により関連データも自動削除

---

## 状態管理

### グローバル変数

```javascript
let nodes = []              // 全ノードデータ配列
let relations = []          // 全親子関係データ配列
let selectedNodeId = null   // 選択中ノードID
let selectedNodePath = null // 選択中ノードパス (例: "1-2-5")
let selectedNodeElement = null // 選択中DOM要素
let expandedNodes = new Set()  // 展開中ノードIDのSet
let searchQuery = ''        // 検索クエリ文字列
let searchResults = []      // 検索結果配列
let clipboard = null        // コピーしたノードID
let treeViewMode = 'normal' // ツリー表示モード ('normal' | 'reverse')
```

### 主要関数

#### データ取得
- `fetchVersion()`: バージョン情報取得
- `fetchNodes()`: 全ノード・親子関係取得
- `fetchParentNodes(nodeId)`: 特定ノードの親ノード取得

#### UI更新
- `renderTree()`: ツリー全体を再描画
- `selectNode(id)`: ノードを選択して詳細表示
- `showLoading()` / `hideLoading()`: ローディング表示制御
- `showToast(message, type, duration)`: トースト通知表示

#### CRUD操作
- `createNode(parentId)`: ノード作成
- `updateNode(id, data)`: ノード更新
- `deleteNode(id)`: ノード削除
- `moveNode(childId, newParentId, position)`: ノード移動

#### 検索
- `performSearch(query)`: 検索実行

#### ツリー構造
- `buildTree(nodes, relations, parentId)`: ツリー構造構築
- `renderTreeNode(node, level, path)`: 個別ノードレンダリング

---

## レスポンシブ対応

### 現在の実装
- **デスクトップ専用設計**（最小幅制限なし）
- 2カラムレイアウト固定

### 今後の対応予定
- タブレット: 左ペイン40%、右ペイン60%
- スマートフォン:
  - タブ切り替え方式
  - ツリー表示 / 詳細表示の2画面切り替え
  - ハンバーガーメニュー

---

## カラーパレット

### 主要色

| 用途 | Tailwind クラス | 色コード |
|------|----------------|---------|
| プライマリ（青） | `bg-blue-500` | #3B82F6 |
| 成功（緑） | `bg-green-500` | #10B981 |
| 警告（黄） | `bg-yellow-500` | #F59E0B |
| エラー（赤） | `bg-red-500` | #EF4444 |
| 選択（紫） | `bg-purple-50` | #FAF5FF |
| グレー背景 | `bg-gray-50` | #F9FAFB |
| グレーテキスト | `text-gray-700` | #374151 |

### 状態別色

| 状態 | 背景色 | ボーダー色 |
|------|--------|-----------|
| 通常 | `transparent` | なし |
| ホバー | `bg-gray-100` | なし |
| 選択中 | `bg-blue-100` | `border-l-4 border-blue-500` |
| 複数親選択中 | `bg-purple-100` | `border-l-4 border-purple-500` |
| 検索ヒット | `transparent` | `ring-2 ring-yellow-300` |

---

## アイコン一覧

使用ライブラリ: **Font Awesome 6**

| アイコン | クラス | 用途 |
|---------|--------|------|
| ➕ | `fas fa-plus-circle` | ルートノード追加 |
| ➕ | `fas fa-plus` | 子ノード追加 |
| 💾 | `fas fa-save` | 保存 |
| 🗑️ | `fas fa-trash` | 削除 |
| 🔄 | `fas fa-exchange-alt` | 表示モード切替 |
| ▼ | `fas fa-chevron-down` | 展開 |
| ▶ | `fas fa-chevron-right` | 折りたたみ |
| 📄 | `fas fa-file` | ルートノード |
| 📎 | `fas fa-paperclip` | 子ノード |
| 🕸️ | `fas fa-sitemap` | 親ノード表示 |
| ✖️ | `fas fa-times` | 削除/閉じる |
| 👆 | `fas fa-hand-pointer` | 選択を促す |

---

## アクセシビリティ

### 現在の実装
- キーボードショートカット対応（Ctrl+C, Ctrl+V）
- ホバー時の視覚フィードバック
- 明確なボタンラベル

### 今後の改善予定
- フォーカスインジケーター強化
- スクリーンリーダー対応（aria-label追加）
- キーボード操作のみでの完全な操作対応
- カラーコントラスト比の改善（WCAG 2.1 AA準拠）

---

## パフォーマンス最適化

### 現在の実装
- ツリー全体再描画（シンプルだが非効率）
- イベントリスナーを毎回再登録

### 今後の改善予定
- 仮想スクロール（大量ノード対応）
- 差分レンダリング
- イベント委譲によるリスナー削減
- デバウンス処理（検索、保存など）

---

## ブラウザ対応

### 対応ブラウザ
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### 非対応
- Internet Explorer（全バージョン）

### 使用している主要API
- Fetch API
- ES6+ (let/const, arrow function, async/await)
- Set
- Flexbox
- CSS Custom Properties
