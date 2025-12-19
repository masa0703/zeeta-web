# API仕様書

このドキュメントは、アウトラインエディタのREST API仕様を記載します。

## 目次

- [基本情報](#基本情報)
- [エンドポイント一覧](#エンドポイント一覧)
- [API詳細](#api詳細)
  - [バージョン情報取得](#バージョン情報取得)
  - [ノード作成](#ノード作成)
  - [ノード更新](#ノード更新)
  - [ノード削除](#ノード削除)
  - [全ノード取得](#全ノード取得)
  - [特定ノード取得](#特定ノード取得)
  - [子ノード取得](#子ノード取得)
  - [親ノード取得](#親ノード取得)
  - [ルートノード取得](#ルートノード取得)
  - [親子関係追加](#親子関係追加)
  - [親子関係削除](#親子関係削除)
  - [リレーション位置更新](#リレーション位置更新)
  - [ルート位置更新](#ルート位置更新)
  - [全リレーション取得](#全リレーション取得)
  - [検索](#検索)
  - [テスト用全データクリア](#テスト用全データクリア)
- [エラーレスポンス](#エラーレスポンス)
- [実装](#実装)

## 基本情報

- **ベースURL**: `http://localhost:3000` (開発環境)
- **フォーマット**: JSON
- **認証**: なし（現在未実装）

## エンドポイント一覧

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

## API詳細

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

**リクエストボディ**:
```json
{
  "title": "ノードタイトル",
  "content": "ノード内容（オプション）",
  "author": "作成者名",
  "root_position": 0
}
```

**必須フィールド**: `title`, `author`

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

**注記**:
- `root_position`未指定時は自動計算（既存ルートノードの最大値+1）

### ノード更新

**エンドポイント**: `PUT /api/nodes/:id`

**リクエストボディ**:
```json
{
  "title": "更新タイトル",
  "content": "更新内容",
  "author": "更新者名"
}
```

**注記**:
- 部分更新可能（指定したフィールドのみ更新）

**レスポンス**:
```json
{
  "success": true,
  "message": "Node updated"
}
```

### ノード削除

**エンドポイント**: `DELETE /api/nodes/:id`

**レスポンス**:
```json
{
  "success": true,
  "message": "Node deleted"
}
```

### 全ノード取得

**エンドポイント**: `GET /api/nodes`

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "ノード1",
      "content": "内容",
      "author": "作成者",
      "created_at": "2025-12-19 15:30:00",
      "updated_at": "2025-12-19 15:30:00",
      "root_position": 0
    }
  ]
}
```

**注記**:
- `root_position`, `created_at`の昇順でソート

### 特定ノード取得

**エンドポイント**: `GET /api/nodes/:id`

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "ノード1",
    "content": "内容",
    "author": "作成者",
    "created_at": "2025-12-19 15:30:00",
    "updated_at": "2025-12-19 15:30:00",
    "root_position": 0
  }
}
```

### 子ノード取得

**エンドポイント**: `GET /api/nodes/:id/children`

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "id": 2,
      "title": "子ノード",
      "position": 0
    }
  ]
}
```

**注記**:
- `position`の昇順でソート

### 親ノード取得

**エンドポイント**: `GET /api/nodes/:id/parents`

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "親ノード"
    }
  ]
}
```

### ルートノード取得

**エンドポイント**: `GET /api/nodes/root/list`

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "ルートノード1",
      "root_position": 0
    }
  ]
}
```

**注記**:
- 親を持たないノード（`node_relations`の`child_node_id`に存在しないノード）
- `root_position`の昇順でソート

### 親子関係追加

**エンドポイント**: `POST /api/relations`

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

**注記**:
- 循環参照チェックを実施
- `position`は自動計算（親の子ノード数）

### 親子関係削除

**エンドポイント**: `DELETE /api/relations/:parent_id/:child_id`

**レスポンス**:
```json
{
  "success": true,
  "message": "Relation deleted"
}
```

### リレーション位置更新

**エンドポイント**: `PATCH /api/relations/:parent_id/:child_id/position`

**リクエストボディ**:
```json
{
  "position": 2
}
```

**レスポンス**:
```json
{
  "success": true,
  "message": "Position updated"
}
```

### ルート位置更新

**エンドポイント**: `PATCH /api/nodes/:id/root-position`

**リクエストボディ**:
```json
{
  "root_position": 3
}
```

**レスポンス**:
```json
{
  "success": true,
  "message": "Root position updated"
}
```

### 全リレーション取得

**エンドポイント**: `GET /api/relations`

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "parent_node_id": 1,
      "child_node_id": 2,
      "position": 0
    }
  ]
}
```

### 検索

**エンドポイント**: `GET /api/search?q=検索語`

**クエリパラメータ**:
- `q`: 検索キーワード（必須）

**レスポンス**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "検索にヒットしたノード",
      "content": "検索キーワードを含む内容"
    }
  ]
}
```

**注記**:
- `title`と`content`を部分一致検索（大文字小文字区別なし）

### テスト用全データクリア

**エンドポイント**: `DELETE /api/test/clear`

**レスポンス**:
```json
{
  "success": true,
  "message": "All data cleared"
}
```

**注記**:
- **テスト専用エンドポイント（本番環境では使用禁止）**
- `node_relations`テーブルと`nodes`テーブルの全データを削除
- `sqlite_sequence`のauto_incrementカウンターをリセット
- Playwrightテストの`beforeEach`フックで使用

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
- `404 Not Found`: リソースが見つからない
- `500 Internal Server Error`: サーバーエラー

## 実装

APIの実装は [src/index.tsx](../src/index.tsx) を参照してください。
