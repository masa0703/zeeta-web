# Phase 1 Setup Guide: Authentication & User Management

このガイドでは、Phase 1（OAuth認証とユーザー管理）のセットアップ手順を説明します。

## 前提条件

- Node.js と npm がインストールされていること
- Cloudflare アカウントがあること
- wrangler CLI がインストールされていること

## 1. データベースマイグレーション

Phase 1 では、マルチユーザー対応のためのテーブルを追加します。

### ローカル開発環境

```bash
# マイグレーションを適用
wrangler d1 execute zeeta2-production --local --file=migrations/0006_add_multi_user_tables.sql
```

### 本番環境

```bash
# 本番データベースにマイグレーションを適用（注意: 本番データに影響します）
wrangler d1 execute zeeta2-production --remote --file=migrations/0006_add_multi_user_tables.sql
```

## 2. OAuth プロバイダーの設定

### Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成または選択
3. 「APIとサービス」→ 「認証情報」に移動
4. 「認証情報を作成」→「OAuthクライアントID」を選択
5. アプリケーションの種類: 「ウェブアプリケーション」
6. 承認済みのリダイレクトURI:
   - 開発: `http://localhost:8787/auth/callback/google`
   - 本番: `https://your-domain.com/auth/callback/google`
7. クライアントIDとクライアントシークレットをコピー

### GitHub OAuth

1. [GitHub Settings](https://github.com/settings/developers) にアクセス
2. 「OAuth Apps」→ 「New OAuth App」をクリック
3. 情報を入力:
   - Application name: Zeeta Web
   - Homepage URL: `http://localhost:8787` (開発) または `https://your-domain.com` (本番)
   - Authorization callback URL: `http://localhost:8787/auth/callback/github` (開発) または `https://your-domain.com/auth/callback/github` (本番)
4. クライアントIDとクライアントシークレットをコピー

## 3. 環境変数の設定

### 開発環境

1. `.dev.vars.example` を `.dev.vars` にコピー:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. `.dev.vars` を編集して、OAuth認証情報を設定:
   ```bash
   # JWT Secret (ランダムな32文字以上の文字列を生成)
   JWT_SECRET=$(openssl rand -base64 32)

   # Google OAuth
   GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-google-client-secret

   # GitHub OAuth
   GITHUB_CLIENT_ID=your-github-client-id
   GITHUB_CLIENT_SECRET=your-github-client-secret

   # Application URL
   APP_URL=http://localhost:8787
   ```

### 本番環境

本番環境では、Cloudflare のシークレット機能を使用します:

```bash
# JWT Secret を設定
wrangler secret put JWT_SECRET

# Google OAuth を設定
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# GitHub OAuth を設定
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET

# アプリケーションURLを設定（wrangler.toml の [vars] セクションで設定済み）
```

## 4. ビルドと起動

### 開発環境

```bash
# 依存関係をインストール
npm install

# ビルド
npm run build

# 開発サーバーを起動
npm run dev
```

ブラウザで `http://localhost:8787/login.html` にアクセスして、ログインページが表示されることを確認します。

### 本番環境へのデプロイ

```bash
# ビルド
npm run build

# デプロイ
wrangler pages deploy
```

## 5. 動作確認

### 認証フローのテスト

1. `http://localhost:8787/login.html` にアクセス
2. 「Googleでログイン」または「GitHubでログイン」をクリック
3. OAuth プロバイダーで認証
4. `/my-page` にリダイレクトされる（Phase 2 で実装予定）

### API エンドポイントのテスト

#### 現在のユーザー情報を取得

```bash
# ログイン後、セッションCookieを使用して
curl -X GET http://localhost:8787/auth/me \
  --cookie "session=your-jwt-token"
```

#### ログアウト

```bash
curl -X POST http://localhost:8787/auth/logout \
  --cookie "session=your-jwt-token"
```

## トラブルシューティング

### OAuth エラー: "redirect_uri_mismatch"

- Google Cloud Console または GitHub の OAuth App 設定で、リダイレクトURI が正しく設定されているか確認
- `.dev.vars` の `APP_URL` が正しいか確認

### JWT エラー: "JWT_SECRET environment variable is not set"

- `.dev.vars` ファイルが存在し、`JWT_SECRET` が設定されているか確認
- 本番環境では `wrangler secret put JWT_SECRET` が実行されているか確認

### データベースエラー

- マイグレーションが正しく適用されているか確認:
  ```bash
  wrangler d1 execute zeeta2-production --local --command "SELECT name FROM sqlite_master WHERE type='table';"
  ```
- `users`, `trees`, `tree_members`, `invitations`, `notifications`, `sessions` テーブルが存在することを確認

## 次のステップ

Phase 1 が完了したら、[Phase 2: ツリー・権限管理](multi-user-implementation-plan.md#phase-2-ツリー権限管理3-4週間) に進みます。

- ツリー管理API実装
- 権限チェック機能
- マイページUI作成
- メンバー管理機能
