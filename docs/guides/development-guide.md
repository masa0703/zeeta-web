# Zeeta Web 開発ガイド

```toc
```
## 開発環境のセットアップ

### 初回セットアップ

```bash
# 依存関係のインストール
npm install

# データベースのマイグレーション実行
npm run db:migrate:local

# シードデータの投入（オプション）
npm run db:seed

# 開発サーバー起動
npm run dev:sandbox
```

### 環境変数の設定

`.dev.vars` ファイルを作成し、以下の環境変数を設定してください：

```bash
# JWT Secret (minimum 32 characters)
JWT_SECRET=your-jwt-secret-here-minimum-32-characters-recommended

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Application URL (for OAuth redirects)
APP_URL=http://localhost:3000

# Resend API Key (for sending invitation emails)
RESEND_API_KEY=your-resend-api-key
```

## 開発サーバー起動コマンド

### 推奨：自動DBチェック付き起動（デフォルト）

```bash
npm run dev:sandbox
```

このコマンドは：
1. **自動的にデータベースの健全性をチェック**
2. 必要なテーブルが欠けている場合、**自動的にマイグレーションを実行**
3. 開発サーバーを起動

### チェックなし起動（非推奨）

```bash
npm run dev:unsafe
```

**⚠️ 警告**: このコマンドはデータベースチェックをスキップします。データベースが正しくセットアップされていない場合、エラーが発生します。

## データベース管理コマンド

### データベースの健全性チェック

```bash
npm run db:check
```

データベースに必要なテーブルが存在するか確認します。問題があれば自動的にマイグレーションを実行します。

### マイグレーションの手動実行

```bash
# ローカル環境
npm run db:migrate:local

# 本番環境
npm run db:migrate:prod
```

### データベースの完全リセット

```bash
npm run db:reset
```

**⚠️ 警告**: このコマンドは：
1. ローカルデータベースを**完全に削除**
2. マイグレーションを再実行
3. シードデータを投入

**全てのデータが失われます。本番環境では絶対に使用しないでください。**

## キャッシュ管理

### ビルドキャッシュのクリア（データベースは保持）

```bash
npm run clean-cache
```

ビルドキャッシュのみをクリアします。データベースは保持されます。

### データベースを含む完全クリーンアップ

```bash
npm run db:reset
```

## トラブルシューティング

### 問題: OAuth ログインで「Authentication failed」エラー

**原因**: データベースに `users` テーブルが存在しない

**解決方法**:
```bash
npm run db:check
# または
npm run db:migrate:local
```

### 問題: ビルドキャッシュによる古いコードの実行

**原因**: `.wrangler/tmp` に古いビルドキャッシュが残っている

**解決方法**:
```bash
npm run clean-cache
npm run build
npm run dev:sandbox
```

### 問題: データベースが壊れた・おかしくなった

**解決方法**:
```bash
npm run db:reset
```

**注意**: 全てのローカルデータが失われます。

## ベストプラクティス

### ✅ DO (推奨)

- **常に `npm run dev:sandbox` を使用**してサーバーを起動（自動DBチェック付き）
- マイグレーションファイルを追加したら、必ず `npm run db:migrate:local` を実行
- `.wrangler` ディレクトリを削除する前に、データベースのバックアップが必要か確認
- ビルドキャッシュのみをクリアする場合は `npm run clean-cache` を使用

### ❌ DON'T (非推奨)

- `npm run dev:unsafe` の使用（データベースチェックがスキップされる）
- `.wrangler` ディレクトリを直接削除（データベースも削除される）
- マイグレーションなしでサーバーを起動
- 本番環境で `npm run db:reset` を実行

## データベース構造

### 重要なテーブル

- `users` - ユーザー情報（OAuth認証）
- `trees` - ツリー/ワークスペース
- `tree_members` - ツリーへのアクセス権限
- `nodes` - ノードデータ
- `node_relations` - ノード間の親子関係
- `invitations` - 招待管理
- `notifications` - 通知
- `sessions` - セッション管理

### マイグレーション履歴

マイグレーションファイルは `migrations/` ディレクトリに保存されています：

- `0001_initial_schema.sql` - 初期スキーマ
- `0002_add_node_relations.sql` - ノード関係テーブル追加
- `0003_remove_parent_id.sql` - parent_id 削除
- `0004_add_position_to_relations.sql` - 順序管理
- `0005_add_root_position.sql` - ルート位置
- `0006_add_multi_user_tables.sql` - マルチユーザー対応

## 開発フロー

### 新機能開発時

1. ブランチを作成
2. **必ず `npm run dev:sandbox` でサーバー起動**（DBチェック付き）
3. 開発
4. テスト実行
5. コミット・プッシュ

### データベーススキーマ変更時

1. マイグレーションファイルを `migrations/` に作成
2. `npm run db:migrate:local` を実行
3. 変更をテスト
4. コミット

### `.wrangler` ディレクトリを削除した場合

```bash
# 1. データベースのマイグレーションを再実行
npm run db:migrate:local

# 2. シードデータの投入（必要な場合）
npm run db:seed

# 3. サーバー起動
npm run dev:sandbox
```

または、一括で：

```bash
npm run db:reset
npm run dev:sandbox
```

## FAQ

**Q: `.wrangler` を削除してもデータベースを保持する方法は？**

A: ビルドキャッシュのみを削除してください：
```bash
npm run clean-cache
```

**Q: データベースがおかしくなった場合は？**

A: 完全リセットを実行してください：
```bash
npm run db:reset
```

**Q: `npm run dev:sandbox` と `npm run dev:unsafe` の違いは？**

A:
- `dev:sandbox` (推奨): 起動前に自動的にデータベースをチェック・修復
- `dev:unsafe` (非推奨): チェックをスキップ（高速だが危険）

**Q: マイグレーションが自動実行されないのはなぜ？**

A: `npm run dev:unsafe` を使用している可能性があります。`npm run dev:sandbox` を使用してください。
