# Zeeta Web 設計書

## 目次

- [プロジェクト概要](#プロジェクト概要)
- [アーキテクチャ](#アーキテクチャ)
- [データモデル](#データモデル)
- [API](#api)
- [フロントエンド構造](#フロントエンド構造)
- [認証・権限](#認証権限)
- [ビルド・デプロイ](#ビルドデプロイ)
- [技術スタック](#技術スタック)
- [セキュリティ・考慮事項](#セキュリティ考慮事項)
- [UI・操作仕様](#ui操作仕様)
- [テスト](#テスト)
- [今後の拡張予定](#今後の拡張予定)

## プロジェクト概要

Zeeta Web は、マルチユーザー対応の協調アウトラインエディタです。階層的なツリー構造でアイデアやプロジェクトを管理し、チームで共有・編集できます。HonoフレームワークとCloudflare D1データベースを使用して構築されています。

### 主な機能

#### コア機能
- ツリー構造でのノード管理（左ペイン）
- ノード詳細編集（右ペイン）
- ノードの作成・編集・削除
- 階層構造の展開/折りたたみ
- 子ノードの追加
- ドラッグ&ドロップ並び替え
- 親子関係の変更（循環参照チェック付き）
- リアルタイム検索機能
- 保存ショートカット（Cmd/Ctrl + Enter）

#### マルチユーザー機能
- OAuth認証（Google/GitHub）
- ワークスペース型ツリー管理
- 権限管理（オーナー/編集者/閲覧者）
- メールベース招待システム
- 通知システム
- プロフィール管理
- 楽観的ロックによる同時編集の競合検出

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
- `users`: OAuth認証ユーザー情報
- `trees`: ワークスペース（ツリー）
- `tree_members`: ツリーへのアクセス権限
- `nodes`: ノードの基本情報（タイトル、内容、作成者など）
- `node_relations`: ノード間の親子関係（多対多関係をサポート）
- `invitations`: 招待管理
- `notifications`: 通知
- `sessions`: セッション管理

**特徴**:
- ツリー分離: 各ツリーは独立したワークスペース
- DAG構造: 1つのノードが複数の親を持てる（同一ツリー内のみ）
- 楽観的ロック: バージョン番号で同時編集の競合を検出

## API

REST APIの詳細仕様は [api-specification.md](./api-specification.md) を参照してください。

**主要エンドポイント**:
- 認証: `GET /auth/login/:provider`, `POST /auth/logout`, `GET /auth/me`
- ツリー管理: `GET/POST/PUT/DELETE /api/trees`
- メンバー管理: `GET/POST/PUT/DELETE /api/trees/:id/members`
- ノード管理: `GET/POST/PUT/DELETE /api/trees/:tree_id/nodes`
- 親子関係: `POST/DELETE /api/trees/:tree_id/relations`
- 招待: `POST /api/trees/:tree_id/invitations`, `POST /api/invitations/:token/accept`
- 通知: `GET /api/notifications`
- プロフィール: `GET/PUT /api/profile`

## フロントエンド構造

UI画面の詳細仕様は [screen-definition.md](./screen-definition.md) を参照してください。

**ページ構成**:
- **マイページ** (`my-page.html`): ツリー一覧、通知、メンバー管理
- **ツリーエディタ** (`index.html`): ノード編集、ツリー操作
- **ログイン** (`login.html`): OAuth認証
- **招待受諾** (`accept-invitation.html`): 招待の確認と受諾
- **プロフィール** (`profile.html`): ユーザー情報編集

**主要コンポーネント** (ツリーエディタ):
- **左ペイン（ツリー表示部）**: 階層構造の表示、ドラッグ&ドロップ操作
- **右ペイン（ノード詳細編集部）**: 選択ノードの編集、親ノード表示、作成者ドロップダウン
- **ヘッダー**: 検索バー、バージョン表示、メンバー管理
- **共通UI**: ローディング、トースト通知、ダイアログ

## 認証・権限

### 認証フロー
1. OAuth 2.0認証（Google/GitHub）
2. JWT発行（httpOnly Cookie、30日間有効）
3. セッションをデータベースに保存

### 権限管理

| 役割 | ツリー管理 | ノード編集 | 招待送信 | 閲覧 |
|------|-----------|-----------|---------|------|
| Owner | ○ | ○ | ○ | ○ |
| Editor | × | ○ | ○ | ○ |
| Viewer | × | × | × | ○ |

### 招待フロー
1. Owner/Editorがメールアドレスで招待
2. 招待メールを送信（7日間有効）
3. 被招待者がリンクをクリック
4. 未ログインの場合はログイン後に自動リダイレクト（`redirect`パラメータ対応）
5. 招待受諾でメンバーに追加

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

### 認証セキュリティ
- OAuth 2.0 state パラメータで CSRF 保護
- JWT 署名（HS256、強力なシークレット）
- httpOnly Cookie でトークン保存
- セッション有効期限（30日）

### 認可セキュリティ
- 全 API エンドポイントで権限チェック
- 最小権限の原則（閲覧者は読み取りのみ）
- ツリー間の厳密な分離
- 招待トークン検証（有効期限7日）

### データセキュリティ
- パラメータ化クエリで SQL インジェクション防止
- 入力バリデーション（型チェック・長さ制限）
- CORS 設定

### 循環参照防止
- 親子関係追加時に循環参照チェックを実施
- 祖先ノードを再帰的に探索
- 同一ツリー内のみ親子関係を許可

### 楽観的ロック
- バージョン番号で同時編集の競合を検出
- 競合時は 409 Conflict を返却

### エラーハンドリング
- 統一されたエラーレスポンス形式
- フロントエンドでのトースト通知

## UI・操作仕様

キーボードショートカット、画面レイアウト、インタラクションなどの詳細は [screen-definition.md](./screen-definition.md) を参照してください。

## テスト

テストケースの詳細は [../testing/test-cases.md](../testing/test-cases.md) を参照してください。

- **テストツール**: Playwright (E2Eテスト自動化)
- **テストカバレッジ**:
  - 基本機能テスト: TC-FUNC-001～TC-FUNC-016
  - マルチユーザーテスト: 70件（Phase 4, 6, 8, 10, 11）
- **実行方法**: `npx playwright test`

**テストスイート**:
| Phase | 機能 | テスト数 |
|-------|------|---------|
| Phase 4 | 認証・ツリー・権限 | 15 |
| Phase 6 | 楽観的ロック | 9 |
| Phase 8 | 招待システム | 17 |
| Phase 10 | 通知システム | 9 |
| Phase 11 | プロフィール管理 | 20 |

## 今後の拡張予定

### 近日実装予定
- **未保存変更の確認ダイアログ** (S100): 編集後、保存せずに他のノードに移動する際の確認機能

### 将来機能
- リアルタイムコラボレーション（WebSocket）
- 監査ログ（変更履歴追跡）
- コメント・メンション機能
- タグ・ラベル
- エクスポート/インポート機能
- マークダウンエディタ統合
- Undo/Redo 機能
- 高度な検索（フィルタ、ソート）