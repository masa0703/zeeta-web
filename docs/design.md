# アウトラインエディタ設計書

## プロジェクト概要

このプロジェクトは、階層的なツリー構造でアイデアやプロジェクトを管理できるWebベースのアウトラインエディタです。HonoフレームワークとCloudflare D1データベースを使用して構築されています。

### 主な機能
- ツリー構造でのノード管理（左ペイン）
- ノード詳細編集（右ペイン）
- ノードの作成・編集・削除
- 階層構造の展開/折りたたみ
- 子ノードの追加
- ドラッグ&ドロップ並び替え
- 親子関係の変更（循環参照チェック付き）
- リアルタイム検索機能

## アーキテクチャ

### 全体構成
- **フロントエンド**: Vanilla JavaScript + HTML/CSS
- **バックエンド**: Hono (TypeScript) on Cloudflare Workers
- **データベース**: Cloudflare D1 (SQLite)
- **デプロイ**: Cloudflare Pages

### データフロー
1. フロントエンド（Vanilla JS）→ Axios で API リクエスト
2. バックエンド（Hono）→ Cloudflare D1 でデータ取得/更新
3. レスポンス JSON → フロントエンドでツリー表示

## データモデル

### nodes テーブル
```sql
- id: INTEGER (主キー, 自動採番)
- title: TEXT (ノードのタイトル)
- content: TEXT (ノードの内容)
- author: TEXT (作成者名)
- created_at: DATETIME (作成日時)
- updated_at: DATETIME (更新日時)
- root_position: INTEGER (ルートノードの表示順序, デフォルト: 0)
```

**注記**:
- `parent_id`と`position`カラムは削除済み（マイグレーション0003で削除）
- 親子関係は`node_relations`テーブルで管理
- ルートノード（親を持たないノード）の順序は`root_position`で管理

### node_relations テーブル
```sql
- parent_node_id: INTEGER (親ノードID)
- child_node_id: INTEGER (子ノードID)
- position: INTEGER (同一親内での順序)
```

## API仕様

### エンドポイント一覧

| メソッド | パス                                           | 説明                 |
| -------- | ---------------------------------------------- | -------------------- |
| GET      | `/api/version`                                 | バージョン情報取得   |
| GET      | `/api/nodes`                                   | 全ノード取得         |
| GET      | `/api/nodes/:id`                               | 特定ノード取得       |
| GET      | `/api/nodes/:id/children`                      | 子ノード取得         |
| GET      | `/api/nodes/:id/parents`                       | 親ノード取得         |
| GET      | `/api/nodes/root/list`                         | ルートノード取得     |
| GET      | `/api/relations`                               | 全リレーション取得   |
| POST     | `/api/nodes`                                   | ノード作成           |
| PUT      | `/api/nodes/:id`                               | ノード更新           |
| DELETE   | `/api/nodes/:id`                               | ノード削除           |
| POST     | `/api/relations`                               | 親子関係追加         |
| DELETE   | `/api/relations/:parent_id/:child_id`          | 親子関係削除         |
| PATCH    | `/api/relations/:parent_id/:child_id/position` | リレーション位置更新 |
| PATCH    | `/api/nodes/:id/root-position`                 | ルート位置更新       |
| GET      | `/api/search?q=検索語`                         | 検索                 |
| DELETE   | `/api/test/clear`                              | テスト用全データクリア |

### 主要API詳細

#### ノード作成 (POST /api/nodes)
- リクエストボディ: `{title, content?, author, root_position?}`
- 必須フィールド: title, author
- root_position未指定時は自動計算

#### ノード更新 (PUT /api/nodes/:id)
- リクエストボディ: `{title?, content?, author?}`
- 部分更新可能

#### 親子関係追加 (POST /api/relations)
- リクエストボディ: `{parent_node_id, child_node_id}`
- 循環参照チェックを実施
- 位置は自動計算（親の最後に追加）

#### テスト用全データクリア (DELETE /api/test/clear)
- テスト実行時にデータベースをクリーンな状態にリセット
- `node_relations`テーブルと`nodes`テーブルの全データを削除
- `sqlite_sequence`のauto_incrementカウンターをリセット
- レスポンス: `{success: true, message: 'All data cleared'}`
- **注意**: 本番環境では使用禁止（テスト専用）

## フロントエンド構造

### 主要コンポーネント
- **ツリー表示部**: 左ペイン、階層構造を表示
- **詳細編集部**: 右ペイン、選択ノードの編集
- **検索バー**: リアルタイム検索機能
- **ツールバー**: 各種操作ボタン

### 状態管理
- `nodes`: 全ノードデータ
- `relations`: 親子関係データ
- `selectedNodeId`: 現在選択中のノードID
- `expandedNodes`: 展開されているノードのセット
- `searchQuery`: 検索クエリ
- `searchResults`: 検索結果

### 主な関数
- `renderTree()`: ツリーの再描画
- `selectNode(id)`: ノード選択
- `createNode(parentId)`: ノード作成
- `updateNode(id, data)`: ノード更新
- `deleteNode(id)`: ノード削除
- `moveNode(childId, newParentId, position)`: ノード移動
- `performSearch(query)`: 検索実行

## ビルド・デプロイ

### ビルドツール
- **Vite**: 開発サーバーとビルド
- **Wrangler**: Cloudflare Workers/Pages デプロイ

### 主要スクリプト
- `npm run dev`: 開発サーバー起動
- `npm run build`: プロダクションビルド
- `npm run deploy:prod`: Cloudflare Pages デプロイ

### データベース操作
- `npm run db:migrate:local`: ローカルDBマイグレーション
- `npm run db:migrate:prod`: 本番DBマイグレーション
- `npm run db:seed`: シードデータ投入

## 技術スタック

### フロントエンド
- Vanilla JavaScript
- Tailwind CSS (CDN)
- Font Awesome (CDN)
- Axios (CDN)
- SortableJS (ドラッグ&ドロップ)

### バックエンド
- Hono v4 (軽量Webフレームワーク)
- TypeScript
- Cloudflare Workers

### データベース
- Cloudflare D1 (SQLiteベース)

### 開発ツール
- Vite
- Wrangler
- PM2 (開発サーバー管理)

## セキュリティ・考慮事項

### 循環参照防止
- 親子関係追加時に循環参照チェックを実施
- 祖先ノードを再帰的に探索

### 入力検証
- APIレベルでの必須フィールドチェック
- 自己参照防止

### エラーハンドリング
- 統一されたエラーレスポンス形式
- フロントエンドでのトースト通知

## キーボードショートカット

### コピー&ペースト機能
- **Ctrl+C (Mac: Cmd+C)**: 選択中のノードをクリップボードにコピー
- **Ctrl+V (Mac: Cmd+V)**: クリップボードのノードを選択中のノードの子として追加

#### 動作仕様
1. ノードをコピー（Ctrl+C）
   - 現在選択中のノードのIDをクリップボードに保存
   - トースト通知「ノードをコピーしました」を表示
   - エディタ内（input/textarea）でのテキスト選択時は動作しない

2. ノードをペースト（Ctrl+V）
   - クリップボードのノードを、現在選択中のノードの子として親子関係を追加
   - 循環参照チェックを実施
   - 既存の親子関係がある場合はエラー
   - 成功時は親ノードを展開して表示
   - トースト通知「親子関係を追加しました」を表示
   - エディタ内（input/textarea）でのテキスト選択時は動作しない

#### エラーケース
- 循環参照が検出された場合: 「循環参照です。この操作はできません。」
- 既存の親子関係がある場合: 「この親子関係はすでに存在します」
- 自己参照の場合: 「自己参照はできません」

## 右ペイン（ノード詳細）

### 親ノード表示機能
選択中のノードの親ノードを右ペインに表示します。

#### 表示仕様
1. **ルートノード**（親を持たないノード）
   - 親ノード表示エリアは非表示

2. **非ルートノード**（1つ以上の親を持つノード）
   - 親ノード表示エリアを表示（紫色の背景: `bg-purple-50 border-purple-200`）
   - ヘッダー: 「親ノード (N)」（Nは親の数）
   - 親ノードリストを白背景のカードで表示
   - 各カードに親タイトルと削除ボタン（×）を表示

#### UI実装詳細
- **親ノードセクション**
  - クラス: `bg-purple-50 border border-purple-200 rounded`
  - アイコン: `fas fa-sitemap`
  - 親の数を表示: 「親ノード (2)」

- **親ノードカード**
  - 各親を白背景カード（`bg-white`）で表示
  - 親タイトル（紫色テキスト: `text-purple-700`）
  - 削除ボタン（クラス: `.remove-parent-btn`, `data-parent-id`属性に親ID）
  - 削除ボタンアイコン: `fas fa-times`（赤色）

#### 親削除機能
- 削除ボタン（×）クリックで確認ダイアログを表示
- 確認後、該当の親子関係を削除（`DELETE /api/relations/:parent_id/:child_id`）
- 削除後、ノードを再選択して表示を更新
- **最後の親を削除した場合**
  - ノードはルートノードになる
  - 親ノード表示エリアが非表示になる
  - ツリー表示が更新され、ルートレベルに表示される

## テスト

テストケースの詳細は [test-cases.md](./test-cases.md) を参照してください。

- **テストツール**: Playwright (E2Eテスト自動化)
- **テストカバレッジ**: 13件の機能テスト（TC-FUNC-001～TC-FUNC-013）
- **実行方法**: `npx playwright test`

## 今後の拡張予定

- エクスポート/インポート機能
- 複数ユーザー対応（認証）
- リアルタイム同期
- マークダウンエディタ統合
- タグ機能
- Undo/Redo 機能