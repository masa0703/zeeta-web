# データベーススキーマ仕様書

このドキュメントは、Zeeta Webのマルチユーザー対応データベーススキーマを記載します。

## 目次

- [データベース情報](#データベース情報)
- [テーブル一覧](#テーブル一覧)
  - [users テーブル](#users-テーブル)
  - [trees テーブル](#trees-テーブル)
  - [tree_members テーブル](#tree_members-テーブル)
  - [invitations テーブル](#invitations-テーブル)
  - [notifications テーブル](#notifications-テーブル)
  - [sessions テーブル](#sessions-テーブル)
  - [nodes テーブル](#nodes-テーブル)
  - [node_relations テーブル](#node_relations-テーブル)
- [データモデルの関係](#データモデルの関係)
- [マイグレーション履歴](#マイグレーション履歴)
- [クエリ例](#クエリ例)
- [パフォーマンス考慮事項](#パフォーマンス考慮事項)

## データベース情報

- **種類**: Cloudflare D1 (SQLite)
- **バインディング名**: `DB`
- **データベース名**: `zeeta2-production`
- **マイグレーション**: `migrations/` ディレクトリで管理

## テーブル一覧

### users テーブル

OAuth認証されたユーザー情報を格納するテーブル。

**スキーマ**:
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oauth_provider TEXT NOT NULL,
  oauth_provider_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME,
  UNIQUE(oauth_provider, oauth_provider_id)
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | ユーザーの一意識別子 |
| oauth_provider | TEXT | NOT NULL | OAuth プロバイダー ('google', 'github') |
| oauth_provider_id | TEXT | NOT NULL | OAuth プロバイダーのユーザーID |
| email | TEXT | NOT NULL | メールアドレス |
| display_name | TEXT | - | 表示名 |
| avatar_url | TEXT | - | アバター画像URL |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | アカウント作成日時 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 最終更新日時 |
| last_login_at | DATETIME | - | 最終ログイン日時 |

**インデックス**:
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_provider_id);
```

**制約**:
- `UNIQUE(oauth_provider, oauth_provider_id)`: 同じプロバイダーで重複したユーザーID登録を防止

---

### trees テーブル

ワークスペース（ツリー）情報を格納するテーブル。

**スキーマ**:
```sql
CREATE TABLE trees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  owner_user_id INTEGER NOT NULL,
  is_deleted INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | ツリーの一意識別子 |
| name | TEXT | NOT NULL | ツリー名 |
| description | TEXT | - | ツリーの説明 |
| owner_user_id | INTEGER | NOT NULL, FOREIGN KEY | オーナーのユーザーID |
| is_deleted | INTEGER | DEFAULT 0 | 削除フラグ (0=有効, 1=削除済み) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 最終更新日時 |

**インデックス**:
```sql
CREATE INDEX idx_trees_owner ON trees(owner_user_id);
CREATE INDEX idx_trees_updated ON trees(updated_at);
CREATE INDEX idx_trees_is_deleted ON trees(is_deleted);
```

**制約**:
- `FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE`: オーナーが削除されるとツリーも削除

**注記**:
- `is_deleted`はソフトデリート用のフラグ（物理削除ではなく論理削除）
- ツリー一覧取得時は`is_deleted = 0`でフィルタリング

---

### tree_members テーブル

ツリーへのユーザーアクセス権限を管理するテーブル。

**スキーマ**:
```sql
CREATE TABLE tree_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
  added_by_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(tree_id, user_id)
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | メンバーシップの一意識別子 |
| tree_id | INTEGER | NOT NULL, FOREIGN KEY | ツリーID |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | ユーザーID |
| role | TEXT | NOT NULL, CHECK | 役割 ('owner', 'editor', 'viewer') |
| added_by_user_id | INTEGER | FOREIGN KEY | 招待したユーザーのID |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | メンバー追加日時 |

**インデックス**:
```sql
CREATE INDEX idx_tree_members_tree ON tree_members(tree_id);
CREATE INDEX idx_tree_members_user ON tree_members(user_id);
CREATE INDEX idx_tree_members_role ON tree_members(tree_id, role);
```

**制約**:
- `UNIQUE(tree_id, user_id)`: 同じユーザーが同じツリーに重複して登録されることを防止
- `CHECK(role IN ('owner', 'editor', 'viewer'))`: 役割は3つのいずれか

**役割の権限**:
- `owner`: 全権限（編集、メンバー管理、ツリー削除）
- `editor`: 編集権限、メンバー招待可能
- `viewer`: 読み取り専用

---

### invitations テーブル

ツリーへの招待情報を管理するテーブル。

**スキーマ**:
```sql
CREATE TABLE invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id INTEGER NOT NULL,
  inviter_user_id INTEGER NOT NULL,
  invitee_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('editor', 'viewer')),
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | 招待の一意識別子 |
| tree_id | INTEGER | NOT NULL, FOREIGN KEY | ツリーID |
| inviter_user_id | INTEGER | NOT NULL, FOREIGN KEY | 招待者のユーザーID |
| invitee_email | TEXT | NOT NULL | 被招待者のメールアドレス |
| role | TEXT | NOT NULL, CHECK | 付与する役割 ('editor', 'viewer') |
| token | TEXT | NOT NULL, UNIQUE | 招待トークン（URL用） |
| status | TEXT | NOT NULL, DEFAULT, CHECK | ステータス |
| expires_at | DATETIME | NOT NULL | 有効期限（7日間） |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 招待作成日時 |
| accepted_at | DATETIME | - | 受諾日時 |

**インデックス**:
```sql
CREATE INDEX idx_invitations_email ON invitations(invitee_email);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_status ON invitations(status, expires_at);
```

**ステータス**:
- `pending`: 招待中
- `accepted`: 受諾済み
- `declined`: 拒否済み
- `expired`: 期限切れ

---

### notifications テーブル

アプリ内通知を管理するテーブル。

**スキーマ**:
```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | 通知の一意識別子 |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | 通知先ユーザーID |
| type | TEXT | NOT NULL | 通知タイプ ('invitation', 'tree_shared', など) |
| title | TEXT | NOT NULL | 通知タイトル |
| message | TEXT | - | 通知メッセージ |
| link | TEXT | - | 関連ページへのリンク |
| is_read | INTEGER | DEFAULT 0 | 既読フラグ (0=未読, 1=既読) |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 通知作成日時 |

**インデックス**:
```sql
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);
```

**通知タイプ**:
- `invitation`: ツリーへの招待
- `invitation_accepted`: 招待が受諾された
- `member_added`: メンバーが追加された
- `tree_shared`: ツリーが共有された

---

### sessions テーブル

ユーザーセッション（JWT）を管理するテーブル。

**スキーマ**:
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | TEXT | PRIMARY KEY | セッションID (UUID) |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | ユーザーID |
| token | TEXT | NOT NULL, UNIQUE | JWTトークン |
| expires_at | DATETIME | NOT NULL | セッション有効期限（30日間） |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | セッション作成日時 |
| last_activity_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 最終アクティビティ日時 |

**インデックス**:
```sql
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

---

### nodes テーブル

ノード（アイテム）の基本情報を格納するテーブル。**マルチユーザー対応版**。

**スキーマ**:
```sql
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  author TEXT NOT NULL,
  created_by_user_id INTEGER,
  updated_by_user_id INTEGER,
  version INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  root_position INTEGER DEFAULT 0,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

**カラム定義**:

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | ノードの一意識別子 |
| tree_id | INTEGER | NOT NULL, FOREIGN KEY | 所属するツリーID |
| title | TEXT | NOT NULL | ノードのタイトル |
| content | TEXT | - | ノードの内容（Markdown形式） |
| author | TEXT | NOT NULL | 作成者名（後方互換性のため保持） |
| created_by_user_id | INTEGER | FOREIGN KEY | 作成したユーザーID |
| updated_by_user_id | INTEGER | FOREIGN KEY | 最終更新したユーザーID |
| version | INTEGER | DEFAULT 1 | 楽観的ロック用バージョン番号 |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 更新日時 |
| root_position | INTEGER | DEFAULT 0 | ルートノードの表示順序 |

**インデックス**:
```sql
CREATE INDEX idx_nodes_tree ON nodes(tree_id);
CREATE INDEX idx_nodes_tree_root ON nodes(tree_id, root_position);
CREATE INDEX idx_nodes_created_at ON nodes(created_at);
CREATE INDEX idx_nodes_root_position ON nodes(root_position);
```

**注記**:
- `tree_id`: ノードは必ず1つのツリーに所属（ツリー間でノード共有不可）
- `version`: 同時編集時の競合検出に使用（更新のたびにインクリメント）
- `author`: 後方互換性のため保持（migration前のデータ用）
- `parent_id`と`position`カラムは削除済み（マイグレーション0003で削除）
- 親子関係は`node_relations`テーブルで管理
- ルートノード（親を持たないノード）の順序は`root_position`で管理

---

### node_relations テーブル

ノード間の親子関係を管理するテーブル。複数の親を持つことができる（DAG構造）。

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
- **ツリー分離**: 親子関係は同一ツリー内のノードのみ許可（APIレベルで検証）

**注記**:
- 1つのノードが複数の親を持つことが可能（多対多関係）
- `position`は同一親内での順序（0から始まる連番）
- ルートノード: `child_node_id`として存在しないノード

---

## データモデルの関係

### ユーザー・ツリー・ノードの関係

```
users (1) ----< trees >---- (∞) nodes
          ↓
      tree_members (役割管理)
```

### ツリーメンバーシップ

```
users (∞) ----< tree_members >---- (∞) trees
            (role: owner/editor/viewer)
```

### ノード間の親子関係（ツリー内DAG構造）

```
nodes (1) ----< node_relations >---- (∞) nodes
  親ノード              関係             子ノード
```

### 招待フロー

```
users (inviter) → invitations → users (invitee) → tree_members
```

### 通知フロー

```
events → notifications → users
```

**特徴**:
- **ツリー分離**: 各ツリーは独立したワークスペース、ノードはツリー間で共有不可
- **多対多関係**: 1ユーザーが複数ツリーにアクセス可能、1ツリーに複数メンバー
- **DAG構造**: ツリー内で1つの子ノードが複数の親を持てる（ただしツリー境界を超えない）
- **楽観的ロック**: バージョン番号で同時編集の競合を検出

---

## マイグレーション履歴

| ファイル | 説明 |
|---------|------|
| 0001_initial_schema.sql | 初期スキーマ作成（parent_id使用） |
| 0002_add_node_relations.sql | node_relationsテーブル追加 |
| 0003_remove_parent_id.sql | parent_idとpositionカラム削除 |
| 0004_add_position_to_relations.sql | node_relationsにpositionカラム追加 |
| 0005_add_root_position.sql | nodesにroot_positionカラム追加 |
| 0006_add_multi_user_tables.sql | マルチユーザー対応（users, trees, tree_members, invitations, notifications, sessions追加、nodesにtree_id/version追加） |
| **0007_add_trees_deleted_flag.sql** | **treesテーブルにis_deletedカラム追加（ソフトデリート対応）** |

**マイグレーション実行方法**:

```bash
# ローカル環境（推奨）
npm run db:migrate:local

# または手動実行
wrangler d1 migrations apply zeeta2-production --local

# 本番環境
npm run db:migrate:prod
```

**データベースヘルスチェック**:
```bash
# 自動チェック（dev:sandbox起動時に自動実行）
npm run dev:sandbox

# 手動チェック
npm run db:check
```

---

## クエリ例

### ユーザーがアクセス可能なツリー一覧

```sql
SELECT
  t.id, t.name, t.description, t.updated_at,
  tm.role,
  u.display_name AS owner_display_name
FROM trees t
JOIN tree_members tm ON t.id = tm.tree_id
LEFT JOIN users u ON t.owner_user_id = u.id
WHERE tm.user_id = ?
  AND t.is_deleted = 0
ORDER BY t.updated_at DESC;
```

### ツリー内のルートノード取得（権限チェック付き）

```sql
SELECT n.*
FROM nodes n
JOIN tree_members tm ON n.tree_id = tm.tree_id
WHERE n.tree_id = ?
  AND tm.user_id = ?
  AND n.id NOT IN (SELECT child_node_id FROM node_relations WHERE parent_node_id IN (SELECT id FROM nodes WHERE tree_id = ?))
ORDER BY n.root_position;
```

### 特定ノードの子ノード取得（同一ツリー内）

```sql
SELECT n.*, nr.position
FROM nodes n
JOIN node_relations nr ON n.id = nr.child_node_id
WHERE nr.parent_node_id = ?
  AND n.tree_id = (SELECT tree_id FROM nodes WHERE id = ?)
ORDER BY nr.position;
```

### 未読通知の取得

```sql
SELECT * FROM notifications
WHERE user_id = ? AND is_read = 0
ORDER BY created_at DESC
LIMIT 20;
```

### 循環参照チェック（祖先ノード取得）

```sql
WITH RECURSIVE ancestors AS (
  SELECT parent_node_id FROM node_relations WHERE child_node_id = ?
  UNION
  SELECT nr.parent_node_id
  FROM node_relations nr
  JOIN ancestors a ON nr.child_node_id = a.parent_node_id
)
SELECT parent_node_id FROM ancestors;
```

### 楽観的ロック - バージョンチェック付き更新

```sql
UPDATE nodes
SET title = ?, content = ?, updated_by_user_id = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
WHERE id = ? AND version = ?;
-- affected rows = 0 なら競合発生
```

---

## パフォーマンス考慮事項

1. **インデックス戦略**:
   - 頻繁に検索される`tree_id`, `user_id`, `created_at`にインデックス
   - 複合インデックス: `(tree_id, root_position)`, `(user_id, is_read)`

2. **カスケード削除**:
   - 外部キー制約で関連データを自動削除
   - ツリー削除時: nodes, tree_members, invitations, notificationsも連鎖削除

3. **ツリー分離**:
   - `tree_id`でデータを分離、クエリは常に特定ツリーに限定
   - ツリー間のJOINを避けることでパフォーマンス向上

4. **楽観的ロック**:
   - バージョン番号で競合検出、ロック不要で高速

5. **通知ポーリング**:
   - 未読通知のみを取得（`is_read = 0`）
   - 作成日時降順でLIMIT制限

---

## セキュリティ考慮事項

1. **権限チェック**:
   - 全APIエンドポイントで`tree_members`を確認
   - role別のアクセス制御（owner > editor > viewer）

2. **ツリー分離の厳格な適用**:
   - ノード操作は常に`tree_id`で制限
   - 異なるツリー間の親子関係を禁止

3. **招待トークンのセキュリティ**:
   - ランダム生成トークン（crypto.randomUUID）
   - 有効期限付き（7日間）
   - 使用後はステータス変更で再利用防止

4. **セッション管理**:
   - JWTトークンはhttpOnly Cookieで保存
   - 30日間の有効期限
   - ログアウト時にDBから削除

---

## 今後の拡張予定

- タグテーブル（`tags`）
- ノード-タグ関連テーブル（`node_tags`）
- 監査ログテーブル（`audit_logs`） - 変更履歴追跡
- コメントテーブル（`comments`） - ノードへのコメント機能
- リアルタイムコラボレーション対応（Durable Objects統合）
