# データベーススキーマ仕様書

このドキュメントは、アウトラインエディタのデータベーススキーマを記載します。

## 目次

- [データベース情報](#データベース情報)
- [テーブル一覧](#テーブル一覧)
  - [users テーブル](#users-テーブル)
  - [oauth_accounts テーブル](#oauth_accounts-テーブル)
  - [verification_tokens テーブル](#verification_tokens-テーブル)
  - [nodes テーブル](#nodes-テーブル)
  - [node_relations テーブル](#node_relations-テーブル)
- [データモデルの関係](#データモデルの関係)
- [マイグレーション履歴](#マイグレーション履歴)
- [クエリ例](#クエリ例)
- [パフォーマンス考慮事項](#パフォーマンス考慮事項)
- [今後の拡張予定](#今後の拡張予定)

## データベース情報

- **種類**: Cloudflare D1 (SQLite)
- **バインディング名**: `DB`
- **マイグレーション**: `migrations/` ディレクトリで管理

## テーブル一覧

### users テーブル

アプリケーションのユーザー情報を管理するテーブル。

**スキーマ**:
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  google_id TEXT,
  is_verified INTEGER DEFAULT 0
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | ユーザーID |
| username | TEXT | NOT NULL, UNIQUE | ユーザー名（ログインID） |
| password_hash | TEXT | NOT NULL | ハッシュ化されたパスワード（OAuthユーザーは固定値） |
| email | TEXT | UNIQUE | メールアドレス |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| google_id | TEXT | - | GoogleアカウントID（OAuth連携用） |
| is_verified | INTEGER | DEFAULT 0 | メールアドレス確認済みフラグ (0: 未確認, 1: 確認済み) |

**インデックス**:
```sql
CREATE INDEX idx_users_username ON users(username);
CREATE UNIQUE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
```

---

### oauth_accounts テーブル

ユーザーのOAuth連携情報（GitHub, Google等）を管理するテーブル。1ユーザーが複数のプロバイダーと連携可能。

**スキーマ**:
```sql
CREATE TABLE oauth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, provider_user_id)
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | ID |
| user_id | INTEGER | NOT NULL | `users`テーブルへの外部キー |
| provider | TEXT | NOT NULL | プロバイダー名 ('google', 'github' 等) |
| provider_user_id | TEXT | NOT NULL | プロバイダー側のユーザーID |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 連携日時 |

**インデックス**:
```sql
CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id);
```

---

### verification_tokens テーブル

メールアドレス確認用のトークンを一時的に保存するテーブル。

**スキーマ**:
```sql
CREATE TABLE verification_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | ID |
| user_id | INTEGER | NOT NULL | `users`テーブルへの外部キー |
| token | TEXT | NOT NULL | 検証用トークン（UUID等） |
| expires_at | DATETIME | NOT NULL | トークンの有効期限 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 作成日時 |

**インデックス**:
```sql
CREATE INDEX idx_verification_tokens_token ON verification_tokens(token);
```

---

### nodes テーブル

ノード（アイテム）の基本情報を格納するテーブル。

**スキーマ**:
```sql
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  author TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  root_position INTEGER DEFAULT 0
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | ノードの一意識別子 |
| title | TEXT | NOT NULL | ノードのタイトル |
| content | TEXT | - | ノードの内容（Markdown形式） |
| author | TEXT | NOT NULL | 作成者名 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 更新日時 |
| root_position | INTEGER | DEFAULT 0 | ルートノードの表示順序 |

**インデックス**:
```sql
CREATE INDEX idx_nodes_created_at ON nodes(created_at);
CREATE INDEX idx_nodes_root_position ON nodes(root_position);
```

**注記**:
- `parent_id`と`position`カラムは削除済み（マイグレーション0003で削除）
- 親子関係は`node_relations`テーブルで管理
- ルートノード（親を持たないノード）の順序は`root_position`で管理
- `root_position`はルートノードのみ使用（子ノードでは無視される）

---

### node_relations テーブル

ノード間の親子関係を管理するテーブル。複数の親を持つことができる。

**スキーマ**:
```sql
CREATE TABLE node_relations (
  parent_node_id INTEGER NOT NULL,
  child_node_id INTEGER NOT NULL,
  position INTEGER DEFAULT 0,
  PRIMARY KEY (parent_node_id, child_node_id),
  FOREIGN KEY (parent_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (child_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| parent_node_id | INTEGER | NOT NULL, PRIMARY KEY (複合) | 親ノードのID |
| child_node_id | INTEGER | NOT NULL, PRIMARY KEY (複合) | 子ノードのID |
| position | INTEGER | DEFAULT 0 | 同一親内での子ノードの表示順序 |

**インデックス**:
```sql
CREATE INDEX idx_relations_parent ON node_relations(parent_node_id);
CREATE INDEX idx_relations_child ON node_relations(child_node_id);
```

**制約**:
- 複合主キー: `(parent_node_id, child_node_id)` → 同じ親子関係は1つのみ
- 外部キー制約: 親ノード・子ノードが削除されると関係も自動削除（CASCADE）
- 循環参照防止: アプリケーションレベルでチェック（`checkCircularReference`関数）

**注記**:
- 1つのノードが複数の親を持つことが可能（多対多関係）
- `position`は同一親内での順序（0から始まる連番）
- ルートノード: `child_node_id`として存在しないノード

---

## データモデルの関係

```
users (1) ----< oauth_accounts
  |
  +----< verification_tokens

nodes (1) ----< node_relations >---- (∞) nodes
  親ノード              関係             子ノード
```

**特徴**:
- **ユーザー認証**: `users`テーブルを中心に、OAuth連携やメール認証情報を管理
- **多対多関係**: 1つの子ノードが複数の親を持てる
- **階層構造**: ツリー構造を表現可能
- **ルートノード**: 親を持たないノード（`node_relations`の`child_node_id`に存在しない）

**例**:

```
ノード構造:
  親A
  ├─ 子X (position: 0)
  └─ 子Y (position: 1)
  親B
  └─ 子X (position: 0)  ← 子Xは親Aと親Bの両方の子

データ:
nodes:
  id=1, title="親A", root_position=0
  id=2, title="親B", root_position=1
  id=3, title="子X"
  id=4, title="子Y"

node_relations:
  parent_node_id=1, child_node_id=3, position=0
  parent_node_id=1, child_node_id=4, position=1
  parent_node_id=2, child_node_id=3, position=0
```

---

## マイグレーション履歴

| ファイル | 説明 |
|---------|------|
| 0001_initial_schema.sql | 初期スキーマ作成（parent_id使用） |
| 0002_add_node_relations.sql | node_relationsテーブル追加 |
| 0003_remove_parent_id.sql | parent_idとpositionカラム削除 |
| 0004_add_position_to_relations.sql | node_relationsにpositionカラム追加 |
| 0005_add_root_position.sql | nodesにroot_positionカラム追加 |
| 0006_add_users_table.sql | usersテーブル追加 |
| 0007_add_auth_fields.sql | 認証関連フィールド・テーブル（OAuth, Token）追加 |
| 0008_create_oauth_accounts.sql | oauth_accountsテーブル追加 |

**マイグレーション実行方法**:

```bash
# ローカル環境
npx wrangler d1 migrations apply [database-name] --local

# 本番環境
npx wrangler d1 migrations apply [database-name] --remote
```

---

## クエリ例

### ルートノードの取得

```sql
SELECT * FROM nodes
WHERE id NOT IN (SELECT child_node_id FROM node_relations)
ORDER BY root_position;
```

### 特定ノードの子ノード取得

```sql
SELECT n.*, nr.position
FROM nodes n
JOIN node_relations nr ON n.id = nr.child_node_id
WHERE nr.parent_node_id = ?
ORDER BY nr.position;
```

### 特定ノードの親ノード取得

```sql
SELECT n.*
FROM nodes n
JOIN node_relations nr ON n.id = nr.parent_node_id
WHERE nr.child_node_id = ?;
```

### 循環参照チェック（祖先ノード取得）

```sql
-- 再帰的にparent_node_idを辿る
WITH RECURSIVE ancestors AS (
  SELECT parent_node_id FROM node_relations WHERE child_node_id = ?
  UNION
  SELECT nr.parent_node_id
  FROM node_relations nr
  JOIN ancestors a ON nr.child_node_id = a.parent_node_id
)
SELECT parent_node_id FROM ancestors;
```

---

## パフォーマンス考慮事項

1. **インデックス**: 頻繁に検索される`created_at`, `root_position`, `parent_node_id`, `child_node_id`, `username`, `token`にインデックスを作成
2. **カスケード削除**: 外部キー制約でノード削除時に関連も自動削除
3. **position更新**: 並び替え時は該当の親の子ノードのみ更新

---

## 今後の拡張予定

- ユーザーごとのノード管理（マルチテナント化: `owner_id`の追加）
- タグテーブル（`tags`）
- ノード-タグ関連テーブル（`node_tags`）
- 権限管理テーブル（`permissions`）
