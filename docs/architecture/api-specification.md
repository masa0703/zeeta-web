# API仕様書

このドキュメントは、Zeeta Web のREST API仕様を記載します。

## 目次

- [基本情報](#基本情報)
- [エンドポイント一覧](#エンドポイント一覧)
- [API詳細](#api詳細)
  - [認証](#認証)
  - [ツリー管理](#ツリー管理)
  - [メンバー管理](#メンバー管理)
  - [ノード管理](#ノード管理)
  - [親子関係](#親子関係)
  - [招待](#招待)
  - [通知](#通知)
  - [プロフィール](#プロフィール)
  - [その他](#その他)
- [エラーレスポンス](#エラーレスポンス)
- [実装](#実装)

## 基本情報

- **ベースURL**: `http://localhost:3000` (開発環境)
- **フォーマット**: JSON
- **認証**: JWT (httpOnly Cookie)
- **セッション有効期限**: 30日

## エンドポイント一覧

### 認証

| メソッド | パス | 説明 | 認証 |
|----------|------|------|------|
| GET | `/auth/login/:provider` | OAuth ログイン開始 | 不要 |
| GET | `/auth/callback/:provider` | OAuth コールバック | 不要 |
| POST | `/auth/logout` | ログアウト | 必要 |
| GET | `/auth/me` | 現在のユーザー情報取得 | 必要 |
| GET | `/auth/test-login` | テスト用ログイン (開発環境のみ) | 不要 |

### ツリー管理

| メソッド | パス | 説明 | 認証 |
|----------|------|------|------|
| GET | `/api/trees` | アクセス可能なツリー一覧 | 必要 |
| POST | `/api/trees` | ツリー作成 | 必要 |
| GET | `/api/trees/:id` | ツリー詳細取得 | 必要 |
| PUT | `/api/trees/:id` | ツリー更新 | 必要 (Owner) |
| DELETE | `/api/trees/:id` | ツリー削除 | 必要 (Owner) |

### メンバー管理

| メソッド | パス | 説明 | 認証 |
|----------|------|------|------|
| GET | `/api/trees/:id/members` | メンバー一覧取得 | 必要 |
| POST | `/api/trees/:id/members` | メンバー追加 | 必要 (Owner) |
| DELETE | `/api/trees/:id/members/:userId` | メンバー削除 | 必要 (Owner) |
| PUT | `/api/trees/:id/members/:userId/role` | 役割変更 | 必要 (Owner) |

### ノード管理 (ツリースコープ)

| メソッド | パス | 説明 | 認証 |
|----------|------|------|------|
| GET | `/api/trees/:tree_id/nodes` | ツリー内のノード一覧 | 必要 |
| POST | `/api/trees/:tree_id/nodes` | ノード作成 | 必要 (Owner/Editor) |
| PUT | `/api/trees/:tree_id/nodes/:id` | ノード更新 (楽観的ロック) | 必要 (Owner/Editor) |
| DELETE | `/api/trees/:tree_id/nodes/:id` | ノード削除 | 必要 (Owner/Editor) |
| GET | `/api/trees/:tree_id/nodes/:id/parents` | 親ノード取得 | 必要 |
| GET | `/api/trees/:tree_id/nodes/:id/children` | 子ノード取得 | 必要 |
| GET | `/api/trees/:tree_id/relations` | ツリー内の関係一覧 | 必要 |
| POST | `/api/trees/:tree_id/relations` | 親子関係作成 | 必要 (Owner/Editor) |
| DELETE | `/api/trees/:tree_id/relations/:parent_id/:child_id` | 親子関係削除 | 必要 (Owner/Editor) |
| PATCH | `/api/trees/:tree_id/relations/:parent_id/:child_id/position` | 位置更新 | 必要 (Owner/Editor) |
| PATCH | `/api/trees/:tree_id/nodes/:id/root-position` | ルート位置更新 | 必要 (Owner/Editor) |
| GET | `/api/trees/:tree_id/search?q=検索語` | ツリー内検索 | 必要 |

### 招待

| メソッド | パス | 説明 | 認証 |
|----------|------|------|------|
| POST | `/api/trees/:tree_id/invitations` | 招待送信 | 必要 (Owner/Editor) |
| GET | `/api/invitations/:token` | 招待詳細取得 | 不要 |
| POST | `/api/invitations/:token/accept` | 招待受諾 | 必要 |
| DELETE | `/api/invitations/:id` | 招待削除 | 必要 (Owner/Editor) |

### 通知

| メソッド | パス | 説明 | 認証 |
|----------|------|------|------|
| GET | `/api/notifications` | 通知一覧取得 | 必要 |
| PUT | `/api/notifications/:id/read` | 個別通知を既読 | 必要 |
| PUT | `/api/notifications/read-all` | 全通知を既読 | 必要 |

### プロフィール

| メソッド | パス | 説明 | 認証 |
|----------|------|------|------|
| GET | `/api/profile` | プロフィール取得 | 必要 |
| PUT | `/api/profile` | プロフィール更新 | 必要 |

### その他

| メソッド | パス | 説明 | 認証 |
|----------|------|------|------|
| GET | `/api/version` | バージョン情報取得 | 不要 |
| DELETE | `/api/test/clear` | テスト用全データクリア (開発環境のみ) | 不要 |

## API詳細

---

### 認証

#### OAuth ログイン開始

**エンドポイント**: `GET /auth/login/:provider`

**パラメータ**:
- `provider`: `google` または `github`

**クエリパラメータ**:
- `redirect` (オプション): 認証後のリダイレクト先URL

**動作**: OAuth認証フローを開始し、プロバイダーの認証ページにリダイレクト

---

#### 現在のユーザー情報取得

**エンドポイント**: `GET /auth/me`

**レスポンス**:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "display_name": "山田 太郎",
    "avatar_url": "https://...",
    "oauth_provider": "google"
  }
}
```

**エラー** (未認証時):
```json
{
  "success": false,
  "error": "Not authenticated"
}
```

---

#### ログアウト

**エンドポイント**: `POST /auth/logout`

**レスポンス**:
```json
{
  "success": true,
  "message": "Logged out"
}
```

---

### ツリー管理

#### ツリー一覧取得

**エンドポイント**: `GET /api/trees`

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "プロジェクトA",
      "description": "説明文",
      "owner_user_id": 1,
      "owner_display_name": "山田 太郎",
      "role": "owner",
      "member_count": 3,
      "updated_at": "2026-02-07 10:00:00"
    }
  ]
}
```

---

#### ツリー作成

**エンドポイント**: `POST /api/trees`

**リクエストボディ**:
```json
{
  "name": "新しいツリー",
  "description": "説明（オプション）"
}
```

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "新しいツリー",
    "description": "説明"
  }
}
```

---

#### ツリー削除

**エンドポイント**: `DELETE /api/trees/:id`

**権限**: Owner のみ

**レスポンス**:
```json
{
  "success": true,
  "message": "Tree deleted"
}
```

---

### メンバー管理

#### メンバー一覧取得

**エンドポイント**: `GET /api/trees/:id/members`

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "user_id": 1,
      "display_name": "山田 太郎",
      "email": "user@example.com",
      "avatar_url": "https://...",
      "role": "owner"
    }
  ]
}
```

---

#### 役割変更

**エンドポイント**: `PUT /api/trees/:id/members/:userId/role`

**権限**: Owner のみ

**リクエストボディ**:
```json
{
  "role": "editor"
}
```

**役割**: `owner`, `editor`, `viewer`

---

### ノード管理

#### ノード一覧取得

**エンドポイント**: `GET /api/trees/:tree_id/nodes`

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "tree_id": 1,
      "title": "ノードタイトル",
      "content": "内容",
      "author": "山田 太郎",
      "created_by_user_id": 1,
      "version": 1,
      "created_at": "2026-02-07 10:00:00",
      "updated_at": "2026-02-07 10:00:00",
      "root_position": 0
    }
  ]
}
```

---

#### ノード作成

**エンドポイント**: `POST /api/trees/:tree_id/nodes`

**権限**: Owner または Editor

**リクエストボディ**:
```json
{
  "title": "ノードタイトル",
  "content": "内容（オプション）",
  "author": "作成者名"
}
```

---

#### ノード更新 (楽観的ロック)

**エンドポイント**: `PUT /api/trees/:tree_id/nodes/:id`

**権限**: Owner または Editor

**リクエストボディ**:
```json
{
  "title": "更新タイトル",
  "content": "更新内容",
  "author": "作成者名",
  "version": 1
}
```

**注記**:
- `version` を指定すると楽観的ロックが有効
- バージョン不一致の場合は 409 Conflict を返す

**競合エラー**:
```json
{
  "success": false,
  "error": "Conflict: Node has been modified",
  "currentVersion": 2
}
```

---

#### ノード削除

**エンドポイント**: `DELETE /api/trees/:tree_id/nodes/:id`

**権限**: Owner または Editor

---

### 親子関係

#### 親子関係作成

**エンドポイント**: `POST /api/trees/:tree_id/relations`

**リクエストボディ**:
```json
{
  "parent_node_id": 1,
  "child_node_id": 2
}
```

**エラー**:
- 循環参照: `{success: false, error: "Circular reference detected"}`
- 異なるツリー: `{success: false, error: "Nodes must belong to the same tree"}`

---

### 招待

#### 招待送信

**エンドポイント**: `POST /api/trees/:tree_id/invitations`

**権限**: Owner または Editor

**リクエストボディ**:
```json
{
  "email": "invitee@example.com",
  "role": "editor"
}
```

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "token": "abc123...",
    "invitee_email": "invitee@example.com",
    "role": "editor",
    "expires_at": "2026-02-14 10:00:00"
  }
}
```

---

#### 招待詳細取得 (公開)

**エンドポイント**: `GET /api/invitations/:token`

**認証**: 不要

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "tree_name": "プロジェクトA",
    "inviter_name": "山田 太郎",
    "invitee_email": "invitee@example.com",
    "role": "editor",
    "expires_at": "2026-02-14 10:00:00"
  }
}
```

---

#### 招待受諾

**エンドポイント**: `POST /api/invitations/:token/accept`

**認証**: 必要

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "tree_id": 1,
    "role": "editor"
  }
}
```

---

### 通知

#### 通知一覧取得

**エンドポイント**: `GET /api/notifications`

**クエリパラメータ**:
- `unread_only`: `true` で未読のみ取得

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "invitation",
      "title": "招待を受けました",
      "message": "山田太郎さんがプロジェクトAに招待しました",
      "link": "/accept-invitation.html?token=...",
      "is_read": 0,
      "created_at": "2026-02-07 10:00:00"
    }
  ]
}
```

---

#### 通知を既読

**エンドポイント**: `PUT /api/notifications/:id/read`

---

#### 全通知を既読

**エンドポイント**: `PUT /api/notifications/read-all`

---

### プロフィール

#### プロフィール取得

**エンドポイント**: `GET /api/profile`

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "user@example.com",
    "display_name": "山田 太郎",
    "avatar_url": "https://...",
    "oauth_provider": "google",
    "created_at": "2026-01-01 10:00:00"
  }
}
```

---

#### プロフィール更新

**エンドポイント**: `PUT /api/profile`

**リクエストボディ**:
```json
{
  "display_name": "新しい表示名"
}
```

**バリデーション**:
- `display_name`: 必須、100文字以内

---

### その他

#### バージョン情報取得

**エンドポイント**: `GET /api/version`

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "buildNumber": "72",
    "version": "build #72"
  }
}
```

---

#### テスト用全データクリア

**エンドポイント**: `DELETE /api/test/clear`

**注記**: **開発環境専用**

**レスポンス**:
```json
{
  "success": true,
  "message": "All data cleared"
}
```

## エラーレスポンス

全てのエラーは以下の形式で返されます:

```json
{
  "success": false,
  "error": "エラーメッセージ"
}
```

**HTTPステータスコード**:

| コード | 説明 | 例 |
|--------|------|-----|
| 200 | 成功 | - |
| 400 | バリデーションエラー | 必須フィールド不足 |
| 401 | 認証エラー | 未ログイン、トークン期限切れ |
| 403 | 権限エラー | 操作権限なし |
| 404 | リソースが見つからない | ノード/ツリー不存在 |
| 409 | 競合 | 楽観的ロック競合 |
| 500 | サーバーエラー | - |

**権限エラーの例**:
```json
{
  "success": false,
  "error": "Permission denied: editor or higher role required"
}
```

**楽観的ロック競合の例**:
```json
{
  "success": false,
  "error": "Conflict: Node has been modified",
  "currentVersion": 3
}
```

---

## 実装

APIの実装は [src/index.tsx](../../src/index.tsx) を参照してください。
