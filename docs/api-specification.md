# API仕様書

このドキュメントは、アウトラインエディタのREST API仕様を記載します。

## 目次

- [基本情報](#基本情報)
- [認証](#認証)
- [エンドポイント一覧](#エンドポイント一覧)
  - [認証関連](#認証関連)
  - [ノード操作関連](#ノード操作関連)
- [API詳細](#api詳細)
  - [認証関連](#api詳細-認証関連)
  - [ノード操作関連](#api詳細-ノード操作関連)
  - [テスト用](#api詳細-テスト用)
- [エラーレスポンス](#エラーレスポンス)
- [実装](#実装)

## 基本情報

- **ベースURL**: `http://localhost:3000` (開発環境)
- **フォーマット**: JSON
- **認証方式**: JWT (Bearer Token)

## 認証

一部の公開API（`GET /api/version`など）を除き、原則としてすべてのAPIリクエストには認証が必要です。

**リクエストヘッダー**:
```
Authorization: Bearer <jwt_token>
```

トークンは `/api/auth/login` または `/api/auth/register` のレスポンスから取得できます。

## エンドポイント一覧

### 認証関連

| メソッド | パス | 説明 | 認証 |
| -------- | ---- | ---- | ---- |
| POST | `/api/auth/register` | ユーザー登録 | 不要 |
| POST | `/api/auth/login` | ログイン | 不要 |
| GET | `/api/auth/me` | 現在のユーザー情報取得 | 必須 |
| GET | `/api/auth/verify-email` | メールアドレス検証 | 不要 |
| GET | `/api/auth/google` | Google OAuth開始 | 不要 |
| GET | `/api/auth/google/callback` | Google OAuthコールバック | 不要 |
| GET | `/api/auth/github` | GitHub OAuth開始 | 不要 |
| GET | `/api/auth/github/callback` | GitHub OAuthコールバック | 不要 |

### ノード操作関連

| メソッド | パス | 説明 | 認証 |
| -------- | ---- | ---- | ---- |
| GET | `/api/version` | バージョン情報取得 | 不要 |
| GET | `/api/nodes` | 全ノード取得 | 必須 |
| GET | `/api/nodes/:id` | 特定ノード取得 | 必須 |
| GET | `/api/nodes/:id/children` | 子ノード取得 | 必須 |
| GET | `/api/nodes/:id/parents` | 親ノード取得 | 必須 |
| GET | `/api/nodes/root/list` | ルートノード取得 | 必須 |
| GET | `/api/relations` | 全リレーション取得 | 必須 |
| POST | `/api/nodes` | ノード作成 | 必須 |
| PUT | `/api/nodes/:id` | ノード更新 | 必須 |
| DELETE | `/api/nodes/:id` | ノード削除 | 必須 |
| POST | `/api/relations` | 親子関係追加 | 必須 |
| DELETE | `/api/relations/:parent_id/:child_id` | 親子関係削除 | 必須 |
| PATCH | `/api/relations/:parent_id/:child_id/position` | リレーション位置更新 | 必須 |
| PATCH | `/api/nodes/:id/root-position` | ルート位置更新 | 必須 |
| GET | `/api/search?q=検索語` | 検索 | 必須 |

---

## API詳細 (認証関連)

### ユーザー登録

**エンドポイント**: `POST /api/auth/register`

**リクエストボディ**:
```json
{
  "username": "ユーザー名",
  "password": "パスワード",
  "email": "メールアドレス"
}
```

**レスポンス**: `201 Created`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "user1",
    "email": "user1@example.com",
    "created_at": "..."
  },
  "message": "Account created. Please verify your email."
}
```

### ログイン

**エンドポイント**: `POST /api/auth/login`

**リクエストボディ**:
```json
{
  "username": "ユーザー名",
  "password": "パスワード"
}
```

**レスポンス**: `200 OK`
```json
{
  "success": true,
  "token": "eyJhbGciOi...",
  "user": {
    "id": 1,
    "username": "user1",
    "email": "user1@example.com"
  }
}
```

### 現在のユーザー取得

**エンドポイント**: `GET /api/auth/me`
**認証**: 必須

**レスポンス**: `200 OK`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "user1",
    "email": "user1@example.com",
    "created_at": "..."
  }
}
```

---

## API詳細 (ノード操作関連)

### バージョン情報取得

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

### ノード作成

**エンドポイント**: `POST /api/nodes`
**認証**: 必須

**リクエストボディ**:
```json
{
  "title": "ノードタイトル",
  "content": "ノード内容（オプション）",
  "author": "作成者名",
  "root_position": 0
}
```

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "ノードタイトル",
    "content": "ノード内容",
    "author": "作成者名",
    "created_at": "2025-12-19 15:30:00",
    "updated_at": "2025-12-19 15:30:00",
    "root_position": 0
  }
}
```

### ノード更新

**エンドポイント**: `PUT /api/nodes/:id`
**認証**: 必須

**リクエストボディ**:
```json
{
  "title": "更新タイトル",
  "content": "更新内容",
  "author": "更新者名"
}
```

**レスポンス**:
```json
{
  "success": true,
  "message": "Node updated"
}
```

### ノード削除

**エンドポイント**: `DELETE /api/nodes/:id`
**認証**: 必須

**レスポンス**:
```json
{
  "success": true,
  "message": "Node deleted"
}
```

### 全ノード取得

**エンドポイント**: `GET /api/nodes`
**認証**: 必須

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "ノード1",
      ...
    }
  ]
}
```

### 特定ノード取得

**エンドポイント**: `GET /api/nodes/:id`
**認証**: 必須

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "ノード1",
    ...
  }
}
```

### 親子関係追加

**エンドポイント**: `POST /api/relations`
**認証**: 必須

**リクエストボディ**:
```json
{
  "parent_node_id": 1,
  "child_node_id": 2
}
```

**レスポンス**:
```json
{
  "success": true,
  "message": "Relation created"
}
```

**エラー**:
- 循環参照の場合: `{success: false, error: "Circular reference detected"}`

### 親子関係削除

**エンドポイント**: `DELETE /api/relations/:parent_id/:child_id`
**認証**: 必須

**レスポンス**:
```json
{
  "success": true,
  "message": "Relation deleted"
}
```

### 検索

**エンドポイント**: `GET /api/search?q=検索語`
**認証**: 必須

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "検索にヒットしたノード",
      ...
    }
  ]
}
```

---

## API詳細 (テスト用)

### テスト用全データクリア

**エンドポイント**: `DELETE /api/test/clear`
**認証**: 不要（ただし本番環境では無効化すべき）

**レスポンス**:
```json
{
  "success": true,
  "message": "All data cleared"
}
```

---

## エラーレスポンス

全てのエラーは以下の形式で返されます:

```json
{
  "success": false,
  "error": "エラーメッセージ"
}
```

**一般的なHTTPステータスコード**:
- `200 OK`: 成功
- `401 Unauthorized`: 認証トークンが無い、または無効
- `403 Forbidden`: アクセス権限がない（例: メール未認証）
- `404 Not Found`: リソースが見つからない
- `409 Conflict`: ユーザー名重複など
- `500 Internal Server Error`: サーバーエラー

## 実装

APIの実装は [src/index.tsx](../src/index.tsx) を参照してください。
