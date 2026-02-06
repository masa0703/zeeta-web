# アウトラインエディタ設計書

## 目次

- [プロジェクト概要](#プロジェクト概要)
- [アーキテクチャ](#アーキテクチャ)
- [データモデル](#データモデル)
- [API](#api)
- [フロントエンド構造](#フロントエンド構造)
- [ビルド・デプロイ](#ビルドデプロイ)
- [技術スタック](#技術スタック)
- [セキュリティ・考慮事項](#セキュリティ考慮事項)
- [UI・操作仕様](#ui操作仕様)
- [テスト](#テスト)
- [今後の拡張予定](#今後の拡張予定)

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

データベーススキーマの詳細仕様は [database-schema.md](./database-schema.md) を参照してください。

**主要テーブル**:
- `nodes`: ノードの基本情報（タイトル、内容、作成者など）
- `node_relations`: ノード間の親子関係（多対多関係をサポート）

## API

REST APIの詳細仕様は [api-specification.md](./api-specification.md) を参照してください。

**主要エンドポイント**:
- ノード管理: `GET/POST/PUT/DELETE /api/nodes`
- 親子関係: `POST/DELETE /api/relations`
- 検索: `GET /api/search`
- テスト用: `DELETE /api/test/clear`

## フロントエンド構造

UI画面の詳細仕様は [screen-definition.md](./screen-definition.md) を参照してください。

**主要コンポーネント**:
- **左ペイン（ツリー表示部）**: 階層構造の表示、ドラッグ&ドロップ操作
- **右ペイン（ノード詳細編集部）**: 選択ノードの編集、親ノード表示
- **ヘッダー**: 検索バー、バージョン表示
- **共通UI**: ローディング、トースト通知、ダイアログ

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

## UI・操作仕様

キーボードショートカット、画面レイアウト、インタラクションなどの詳細は [screen-definition.md](./screen-definition.md) を参照してください。

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