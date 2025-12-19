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
- parent_id: INTEGER (親ノードのID、NULL = ルートノード) ※ 非推奨、node_relations使用
- title: TEXT (ノードのタイトル)
- content: TEXT (ノードの内容)
- author: TEXT (作成者名)
- created_at: DATETIME (作成日時)
- updated_at: DATETIME (更新日時)
- position: INTEGER (表示順序) ※ 非推奨、node_relations使用
- root_position: INTEGER (ルートノードの表示順序)
```

### node_relations テーブル
```sql
- parent_node_id: INTEGER (親ノードID)
- child_node_id: INTEGER (子ノードID)
- position: INTEGER (同一親内での順序)
```

## API仕様

### エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/version` | バージョン情報取得 |
| GET | `/api/nodes` | 全ノード取得 |
| GET | `/api/nodes/:id` | 特定ノード取得 |
| GET | `/api/nodes/:id/children` | 子ノード取得 |
| GET | `/api/nodes/:id/parents` | 親ノード取得 |
| GET | `/api/nodes/root/list` | ルートノード取得 |
| GET | `/api/relations` | 全リレーション取得 |
| POST | `/api/nodes` | ノード作成 |
| PUT | `/api/nodes/:id` | ノード更新 |
| DELETE | `/api/nodes/:id` | ノード削除 |
| POST | `/api/relations` | 親子関係追加 |
| DELETE | `/api/relations/:parent_id/:child_id` | 親子関係削除 |
| PATCH | `/api/relations/:parent_id/:child_id/position` | リレーション位置更新 |
| PATCH | `/api/nodes/:id/root-position` | ルート位置更新 |
| GET | `/api/search?q=検索語` | 検索 |

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

## 今後の拡張予定

- エクスポート/インポート機能
- 複数ユーザー対応（認証）
- リアルタイム同期
- マークダウンエディタ統合
- タグ機能
- Undo/Redo 機能