```toc
```
# Zeeta Web マルチユーザー対応 実装計画

## 概要

現在のシングルユーザーアウトラインエディタ「Zeeta Web」を、複数ユーザーで共同作業可能なマルチユーザーシステムに変換する実装計画です。

**現在のシステム:** シングルユーザー、認証なし、全ノードが1つのDAG構造
**目標システム:** マルチユーザー、OAuth認証、ワークスペース型ツリー管理、権限管理

---

## 進捗管理

### 現在の状態
- **開始日**: 2026-01-26
- **現在のフェーズ**: Phase 1（完了）→ Phase 2 準備中
- **全体の進捗**: 12.5% (1/8 フェーズ完了)
- **最終更新**: 2026-01-26

### Phase別進捗

#### Phase 1: 基盤 ✅
- [x] マイグレーション `0006_add_multi_user_tables.sql` 作成 → [migrations/0006_add_multi_user_tables.sql](migrations/0006_add_multi_user_tables.sql)
- [x] OAuth認証実装（Google & GitHub） → [src/config/oauth.ts](src/config/oauth.ts)
- [x] JWT セッション管理実装 → [src/utils/jwt.ts](src/utils/jwt.ts)
- [x] 認証ミドルウェア実装 → [src/middleware/auth.ts](src/middleware/auth.ts)
- [x] データベースヘルパー関数実装 → [src/utils/database.ts](src/utils/database.ts)
- [x] ログインページ作成 → [public/login.html](public/login.html)
- [x] 認証ルートを index.tsx に追加 → [src/index.tsx](src/index.tsx)
- [x] 環境変数設定（wrangler.toml, .dev.vars.example） → [wrangler.toml](wrangler.toml), [.dev.vars.example](.dev.vars.example)
- [x] Phase 1 セットアップガイド作成 → [docs/phase1-setup-guide.md](docs/phase1-setup-guide.md)

#### Phase 2: ツリー・権限管理 ⏸️
- [ ] ツリー管理API実装（GET /api/trees）
- [ ] ツリー管理API実装（POST /api/trees）
- [ ] ツリー管理API実装（PUT/DELETE）
- [ ] 権限チェックヘルパー関数実装
- [ ] マイページUI作成
- [ ] メンバー管理API実装
- [ ] メンバー管理モーダルUI作成

#### Phase 3: ノード管理のツリー対応 ⏸️
- [ ] ノードAPI のツリースコープ化
- [ ] 関係API のツリースコープ化
- [ ] 同一ツリー内検証ロジック追加
- [ ] エディタページのURL変更（/trees/:tree_id/editor）
- [ ] エディタヘッダー追加（パンくず、メンバー管理ボタン）
- [ ] 権限ベースUI実装（閲覧者制限）

#### Phase 4: 楽観的ロック ⏸️
- [ ] ノードテーブルに version カラム追加（マイグレーション）
- [ ] PUT /api/trees/:tree_id/nodes/:id でバージョンチェック
- [ ] 409 Conflict レスポンス実装
- [ ] クライアント側競合検出処理
- [ ] 競合解決ダイアログUI作成

#### Phase 5: 招待システム ⏸️
- [ ] 招待API実装（POST /api/trees/:tree_id/invitations）
- [ ] 招待トークン生成・検証ロジック
- [ ] メールサービス統合（SendGrid or Resend）
- [ ] 招待メールテンプレート作成
- [ ] 招待受諾ページ作成
- [ ] 招待有効期限チェック

#### Phase 6: 通知システム ⏸️
- [ ] 通知API実装（GET /api/notifications）
- [ ] 通知作成ロジック（招待時、受諾時など）
- [ ] 通知ベルアイコンUIコンポーネント
- [ ] 通知ドロップダウンUI
- [ ] 通知ポーリング実装（60秒ごと）

#### Phase 7: プロフィール管理 ⏸️
- [ ] プロフィールAPI実装（GET /api/profile）
- [ ] プロフィール更新API（PUT /api/profile）
- [ ] プロフィール設定ページUI
- [ ] 表示名編集機能

#### Phase 8: テスト・ポリッシュ ⏸️
- [ ] Playwright E2Eテスト作成
- [ ] バグ修正
- [ ] ローディング状態UI追加
- [ ] エラーハンドリング改善
- [ ] パフォーマンス最適化

### 作業ログ

#### 2026-01-26
- ✅ マルチユーザー対応の仕様確定
- ✅ 実装計画書作成完了
- ✅ Phase 1 完了: データベースマイグレーション、OAuth認証、JWT、ログインページ
- ✅ 作成ファイル:
  - `migrations/0006_add_multi_user_tables.sql` - マルチユーザー対応テーブル
  - `src/config/oauth.ts` - OAuth設定（Google/GitHub）
  - `src/utils/jwt.ts` - JWT生成・検証ユーティリティ
  - `src/middleware/auth.ts` - 認証ミドルウェア
  - `src/utils/database.ts` - データベースヘルパー関数
  - `public/login.html` - ログインページ
  - `docs/phase1-setup-guide.md` - セットアップガイド
  - `.dev.vars.example` - 環境変数テンプレート
- ✅ 修正ファイル:
  - `src/index.tsx` - 認証ルート追加
  - `wrangler.toml` - 環境変数設定追加
- 📝 次回: Phase 2 開始（ツリー管理API、権限システム、マイページUI）

---

## 確定した要件

### 1. データモデル
- **ワークスペース型ツリー**: 各ツリーは独立したワークスペースとして完全分離
- **ノード所属**: 1つのノードは1つのツリーにのみ所属
- **マルチペアレント**: 同一ツリー内でのみDAG構造を維持（ツリー間の親子関係は禁止）
- **複数ツリー所有**: 1ユーザーが複数のツリーを作成・所有可能

### 2. 権限モデル
- **オーナー**: ツリー作成者、編集者・閲覧者を招待可能、フルアクセス
- **編集者**: ツリー編集可能、さらに編集者・閲覧者の招待も可能
- **閲覧者**: 読み取り専用アクセス

### 3. 認証方式
- **OAuth (Google/GitHub)**: 外部認証プロバイダーを使用
- **JWT セッション管理**: httpOnly Cookie、30日間有効

### 4. 招待システム
- **メールベース招待**: メールアドレスでユーザーを招待
- **招待通知**: メール通知またはログイン時に画面内通知

### 5. UI構成
- **マイページ**: ツリー一覧ページ（エディタとは別画面）
  - 「マイツリー」セクション
  - 「共有されたツリー」セクション
  - ツリーをクリック → エディタ画面に遷移
- **エディタ**: 既存のエディタUI + ツリーコンテキスト + 権限ベースUI

### 6. 競合解決
- **楽観的ロック**: バージョン管理で競合を検出し、ユーザーに解決方法を提示

### 7. MVP機能範囲
**必須機能:**
1. ユーザー認証（OAuth）
2. ツリー管理（CRUD）
3. 権限管理（オーナー/編集者/閲覧者）
4. ユーザー招待（メールベース）
5. 楽観的ロック（バージョン管理）
6. マイページ（ツリー一覧・選択）
7. 通知機能（招待通知など）
8. プロフィール管理（表示名、アバター）

**保留（将来実装）:**
- 監査ログ（変更履歴）
- リアルタイム同期
- コメント・メンション機能

---

## データベース設計

### 新規テーブル

#### users（ユーザー）
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  oauth_provider TEXT NOT NULL,           -- 'google' or 'github'
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

#### trees（ツリー/ワークスペース）
```sql
CREATE TABLE trees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  owner_user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### tree_members（ツリーメンバー・権限管理）
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
  UNIQUE(tree_id, user_id)
);
```

#### invitations（招待管理）
```sql
CREATE TABLE invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id INTEGER NOT NULL,
  inviter_user_id INTEGER NOT NULL,
  invitee_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('editor', 'viewer')),
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  accepted_at DATETIME,
  FOREIGN KEY (tree_id) REFERENCES trees(id) ON DELETE CASCADE
);
```

#### notifications（通知）
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

#### sessions（セッション管理）
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

### 既存テーブルの変更

#### nodes（ノード）
**追加カラム:**
- `tree_id INTEGER NOT NULL` - どのツリーに属するか
- `version INTEGER DEFAULT 1` - 楽観的ロック用バージョン番号
- `created_by_user_id INTEGER` - 作成者
- `updated_by_user_id INTEGER` - 最終更新者

**既存カラムの保持:**
- `author TEXT` - 後方互換性のため残す

#### node_relations（ノード関係）
- スキーマ変更なし
- API レベルで同一ツリー内のみ関係を許可する検証を追加

---

## 主要API エンドポイント

### 認証関連
- `GET /auth/login/:provider` - OAuth ログインフローの開始
- `GET /auth/callback/:provider` - OAuth コールバック処理
- `POST /auth/logout` - ログアウト
- `GET /auth/me` - 現在のユーザー情報取得

### ツリー管理
- `GET /api/trees` - アクセス可能なツリー一覧（自分のツリー + 共有されたツリー）
- `POST /api/trees` - 新しいツリー作成
- `GET /api/trees/:id` - ツリー詳細取得
- `PUT /api/trees/:id` - ツリー情報更新（オーナーのみ）
- `DELETE /api/trees/:id` - ツリー削除（オーナーのみ）

### ノード管理（ツリースコープ）
- `GET /api/trees/:tree_id/nodes` - ツリー内の全ノード取得
- `POST /api/trees/:tree_id/nodes` - ノード作成（オーナー/編集者）
- `PUT /api/trees/:tree_id/nodes/:id` - ノード更新（楽観的ロック付き）
- `DELETE /api/trees/:tree_id/nodes/:id` - ノード削除（オーナー/編集者）
- `GET /api/trees/:tree_id/relations` - ツリー内の全関係取得
- `POST /api/trees/:tree_id/relations` - 親子関係作成（同一ツリー内のみ）

### 招待・メンバー管理
- `POST /api/trees/:tree_id/invitations` - メールで招待送信
- `GET /api/invitations/:token` - 招待詳細取得（公開）
- `POST /api/invitations/:token/accept` - 招待を受諾
- `GET /api/trees/:tree_id/members` - ツリーメンバー一覧
- `DELETE /api/trees/:tree_id/members/:user_id` - メンバー削除
- `PUT /api/trees/:tree_id/members/:user_id/role` - 役割変更（オーナーのみ）

### 通知
- `GET /api/notifications` - 通知一覧取得
- `PUT /api/notifications/:id/read` - 通知を既読にする
- `PUT /api/notifications/read-all` - 全通知を既読にする

### プロフィール
- `GET /api/profile` - プロフィール取得
- `PUT /api/profile` - プロフィール更新（表示名）

---

## UIの変更点

### 新規ページ

#### 1. ログインページ (`/login.html`)
- シンプルなランディングページ
- 「Googleでログイン」「GitHubでログイン」ボタン
- ログイン後は `/my-page` にリダイレクト

#### 2. マイページ (`/my-page.html`)
**レイアウト:**
```
┌─────────────────────────────────────────────────────┐
│  [Avatar] User Name        [Notifications] [Logout] │
├─────────────────────────────────────────────────────┤
│  My Trees                           [+ New Tree]   │
│  ┌─────────────────────────────────────────────┐  │
│  │  Project Alpha                  Owner       │  │
│  │  Updated 2 hours ago  •  5 members          │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  Shared with Me                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │  Team Project               Editor          │  │
│  │  Owned by John  •  Updated 1 day ago        │  │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**機能:**
- 「マイツリー」と「共有されたツリー」を分けて表示
- 各ツリーカードに役割バッジ（Owner/Editor/Viewer）
- ツリーをクリック → エディタに遷移
- 通知ベルアイコン（未読件数表示）
- プロフィールドロップダウン

#### 3. エディタページ (`/trees/:tree_id/editor`)
**既存エディタの変更点:**
- URL構造: `/trees/:tree_id/editor`
- ヘッダー追加:
  - パンくずナビ: 「My Page > Project Alpha」
  - 「メンバー管理」ボタン（オーナー/編集者のみ）
  - ユーザーアバターと役割バッジ
- 権限ベースUI:
  - **閲覧者**: 編集ボタン非表示、入力欄を読み取り専用、ドラッグ&ドロップ無効
  - **編集者**: フル編集機能
  - **オーナー**: 編集 + メンバー管理

### 新規モーダル

#### メンバー管理モーダル
```
┌─────────────────────────────────────────┐
│  Manage Members - Project Alpha     [X] │
├─────────────────────────────────────────┤
│  Invite by Email                        │
│  [email@example.com] [Editor▼] [Invite]│
│                                         │
│  Current Members (5)                    │
│  ┌─────────────────────────────────┐   │
│  │ [Avatar] John Doe    Owner      │   │
│  └─────────────────────────────────┘   │
│  ┌─────────────────────────────────┐   │
│  │ [Avatar] Jane Smith  Editor [▼] │   │
│  │          [Remove]               │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

#### 競合解決ダイアログ
```
┌─────────────────────────────────────────────────┐
│  Conflict Detected                          [X] │
├─────────────────────────────────────────────────┤
│  このノードは他のユーザーによって更新されました。│
│                                                 │
│  あなたのバージョン:                            │
│  [表示]                                         │
│                                                 │
│  サーバーのバージョン（現在）:                  │
│  [表示]                                         │
│                                                 │
│  [サーバー版を使用]  [自分の版を維持]         │
│  [手動でマージ]                                 │
└─────────────────────────────────────────────────┘
```

---

## 楽観的ロックの仕組み

### 概念
各ノードに `version` フィールド（整数）を持たせ、更新のたびにインクリメント。更新時にクライアントが現在のバージョン番号を送信し、サーバー側でバージョンが一致するか確認。不一致の場合は競合として扱う。

### フロー
1. **ノード読み込み時**: クライアントがノードのデータと `version` を取得
2. **編集中**: ユーザーがノードを編集
3. **保存時**: クライアントが `version` を含めて PUT リクエスト送信
4. **サーバー側チェック**:
   - データベースの現在の `version` と比較
   - 一致 → 更新成功、`version` を +1 してレスポンス
   - 不一致 → 409 Conflict エラーを返し、現在のサーバーデータを含める
5. **競合発生時**: クライアント側で競合解決ダイアログを表示
   - 「サーバー版を使用」: ローカル変更を破棄、サーバーデータをロード
   - 「自分の版を維持」: サーバーバージョンを使って強制上書き
   - 「手動でマージ」: 両方を並べて表示し、手動マージ

### API実装例
```typescript
// PUT /api/trees/:tree_id/nodes/:id
{
  title: "Updated Title",
  content: "Updated content...",
  version: 5  // クライアントが保持しているバージョン
}

// 成功レスポンス
{
  success: true,
  data: {
    id: 123,
    title: "Updated Title",
    version: 6,  // インクリメント済み
    ...
  }
}

// 競合レスポンス (409 Conflict)
{
  success: false,
  error: "Version conflict",
  current_version: 7,
  server_data: {
    id: 123,
    title: "Another User's Title",
    content: "Another user's content...",
    version: 7,
    ...
  }
}
```

---

## 実装時間見積もり

### AI（Claude）が実装する場合の現実的な見積もり

#### 純粋な実装時間（コーディング）

| フェーズ | 作業内容 | 時間 |
|---------|---------|------|
| Phase 1 | DB設計、OAuth認証、JWT、ログインページ | 5-7時間 |
| Phase 2 | ツリー管理API、マイページUI、権限システム | 8-10時間 |
| Phase 3 | ノードAPI修正、エディタ修正、権限UI | 8-10時間 |
| Phase 4 | 楽観的ロック（バックエンド+UI） | 4-5時間 |
| Phase 5 | 招待システム、メール統合 | 5-6時間 |
| Phase 6 | 通知システム | 3-4時間 |
| Phase 7 | プロフィール管理 | 2-3時間 |
| Phase 8 | テスト、バグ修正、ポリッシュ | 8-10時間 |

**純粋な実装時間: 約45-55時間**

#### 実際にかかる時間

以下の追加時間が必要：
- **デバッグ・修正の反復**: +15-20時間
- **テスト実行・確認待ち**: +5-10時間
- **予期しない問題の解決**: +10-15時間

**合計: 75-100時間相当の作業**

#### カレンダー上の実装期間

**🚀 集中実装モード（推奨）**
- **期間: 2-3週間**
- 毎日作業セッション
- ユーザーが頻繁に確認・フィードバック
- 各フェーズごとに動作確認

**📅 通常ペース**
- **期間: 4-6週間**
- 週に3-4回の作業セッション
- フェーズごとに数日の確認期間
- バランスの取れたペース

**🐢 ゆっくりペース**
- **期間: 8-10週間**
- 週に1-2回の作業
- じっくり検討しながら進める
- 並行して他のタスクも可能

#### 超ミニマル版の場合

もし機能を絞れば：

**Phase 1 + Phase 2 + Phase 3のみ**
- OAuth認証（Googleのみ）
- ツリー管理
- 基本的なノード編集
- 権限チェック（簡易版）

**実装時間: 20-25時間 = 1-2週間で動作するものができます**

### なぜ時間がかかるのか

マルチユーザー対応は見た目以上に複雑：
- **データベース設計の大幅変更**: 6つの新規テーブル、既存テーブルの変更
- **認証・セッション管理**: OAuth統合、JWT、セキュリティ実装
- **全APIの権限チェック追加**: 各エンドポイントでの権限検証
- **UIの全面的な調整**: 権限ベースUI、新規ページ、モーダル
- **複雑なロジック**: 楽観的ロック、招待フロー、通知システム
- **テスト・デバッグ**: 各機能の動作確認と問題修正

---

## 実装フェーズ

**注意:** 以下の期間は人間のエンジニアがパートタイムで作業する場合の保守的な見積もりです。AIによる実装は上記「実装時間見積もり」を参照してください。

### Phase 1: 基盤（1-2週間）
**目標:** データベーススキーマ、認証、基本的なユーザー管理

**タスク:**
1. マイグレーション `0006_add_multi_user_tables.sql` 作成
   - 全新規テーブル作成
   - 既存ノードをデフォルトツリーに移行
   - nodes テーブルに tree_id と version を追加
2. OAuth 認証実装（Google + GitHub）
3. JWT セッション管理実装
4. 認証ミドルウェア実装
5. ログインページ作成

**成果物:**
- マイグレーション完了
- OAuth ログインが動作
- セッション管理が機能

---

### Phase 2: ツリー・権限管理（3-4週間）
**目標:** ツリーCRUD、権限システム、メンバー管理

**タスク:**
1. ツリー管理API実装
2. 権限チェック機能実装（ヘルパー関数 + ミドルウェア）
3. マイページUI作成
4. メンバー管理API実装
5. メンバー管理モーダルUI作成

**成果物:**
- ツリーCRUD動作
- マイページでツリー一覧表示
- 権限システム動作
- メンバー管理が機能

---

### Phase 3: ノード管理のツリー対応（5-6週間）
**目標:** 既存ノード/関係APIをツリーコンテキストで動作させる

**タスク:**
1. ノードAPIのリファクタリング（`/api/trees/:tree_id/nodes`）
2. 関係APIのリファクタリング（同一ツリー内検証）
3. フロントエンドエディタの修正（ツリーコンテキスト対応）
4. 権限ベースUI実装（閲覧者は編集不可）

**成果物:**
- ノード操作がツリースコープで動作
- エディタがツリーコンテキストで動作
- 権限ベースUIが機能
- マルチペアレントがツリー内で動作

---

### Phase 4: 楽観的ロック（7週間目）
**目標:** バージョンベースの競合検出と解決

**タスク:**
1. ノード更新時のバージョンチェック実装
2. 競合時に 409 レスポンス返却
3. クライアント側競合処理実装
4. 競合解決ダイアログ作成

**成果物:**
- 楽観的ロックが動作
- 同時編集時に競合検出
- 競合解決UIが機能

---

### Phase 5: 招待システム（8週間目）
**目標:** メールベースの招待機能

**タスク:**
1. 招待API実装
2. メールサービス統合（SendGrid または Resend）
3. 招待UI実装（メンバー管理モーダル内）
4. 招待受諾ページ作成
5. 招待有効期限処理

**成果物:**
- メール招待が動作
- 招待受諾フローが完成
- メール通知が送信される

---

### Phase 6: 通知システム（9週間目）
**目標:** アプリ内通知機能

**タスク:**
1. 通知API実装
2. 各種イベントでの通知トリガー実装
3. 通知UIコンポーネント作成（ベルアイコン + ドロップダウン）
4. 通知ポーリング実装（60秒ごと）

**成果物:**
- アプリ内通知が動作
- 未読カウント表示
- クリックで既読 + 遷移

---

### Phase 7: プロフィール管理（10週間目）
**目標:** ユーザープロフィール編集

**タスク:**
1. プロフィールAPI実装
2. プロフィール設定ページ作成
3. 表示名編集機能

**成果物:**
- プロフィールページが機能
- 表示名の更新が可能

---

### Phase 8: テスト・ポリッシュ（11-12週間目）
**目標:** E2Eテスト、バグ修正、UI改善

**タスク:**
1. Playwright E2Eテスト作成
2. バグ修正とエッジケース対応
3. UI/UX改善（ローディング状態、エラーハンドリング）
4. パフォーマンス最適化

**成果物:**
- 包括的なテストスイート
- 主要バグ修正済み
- 洗練されたUX

---

## クリティカルファイル

以下のファイルが実装の中心となります:

### 1. データベースマイグレーション
- [migrations/0006_add_multi_user_tables.sql](migrations/0006_add_multi_user_tables.sql)
  - 全新規テーブル作成
  - 既存テーブル変更
  - データマイグレーション

### 2. バックエンド
- [src/index.tsx](src/index.tsx:1) (845行)
  - 認証ミドルウェア追加
  - ツリースコープAPIエンドポイント追加
  - 権限チェック実装
  - 全新規APIルート実装

- `src/middleware/auth.ts`（新規作成）
  - JWT検証ミドルウェア
  - ユーザーコンテキスト注入

- `src/config/oauth.ts`（新規作成）
  - OAuth設定（Google/GitHub）

- `src/services/email.ts`（新規作成）
  - メール送信機能（SendGrid/Resend）

- `src/utils/jwt.ts`（新規作成）
  - JWT生成・検証ヘルパー

- `src/utils/permissions.ts`（新規作成）
  - 権限チェックヘルパー関数

### 3. フロントエンド
- [public/static/app.js](public/static/app.js:1) (1,646行)
  - ツリーコンテキスト対応
  - 権限ベースUI実装
  - 楽観的ロック処理
  - 状態管理の更新

- `public/login.html`（新規作成）
  - ログインページ

- `public/my-page.html`（新規作成）
  - ツリー一覧ページ

- `public/static/my-page.js`（新規作成）
  - マイページのロジック

- `public/static/auth.js`（新規作成）
  - 認証状態管理

- `public/static/notifications.js`（新規作成）
  - 通知機能

### 4. 設定ファイル
- [wrangler.toml](wrangler.toml:1)
  - 環境変数追加（OAuth credentials、JWT secret、SendGrid API key）

---

## データ移行戦略

### 既存データの扱い
- 全既存ノードは「Default Tree」（tree_id = 1）に移行
- デフォルト管理者ユーザー作成（user_id = 1）
- 既存の `author` フィールドは保持（履歴として）

### マイグレーションスクリプト
```sql
-- デフォルト管理者ユーザー作成
INSERT INTO users (oauth_provider, oauth_provider_id, email, display_name)
VALUES ('system', 'admin', 'admin@zeeta.local', 'System Admin');

-- デフォルトツリー作成
INSERT INTO trees (name, description, owner_user_id)
VALUES ('Default Tree', 'Migrated from single-user data', 1);

-- 全既存ノードを tree_id=1 に移行
INSERT INTO nodes_new (id, tree_id, title, content, author, created_by_user_id, version, ...)
SELECT id, 1, title, content, author, 1, 1, ...
FROM nodes;
```

### デプロイ戦略
1. データベースマイグレーション実行
2. バックエンドデプロイ（新旧APIの共存）
3. フロントエンドデプロイ
4. ユーザーに新機能通知

---

## 検証方法

### Phase 1 検証
- [ ] Googleでログイン成功
- [ ] GitHubでログイン成功
- [ ] セッションがページ更新後も保持される
- [ ] ログアウトでセッションがクリアされる

### Phase 2 検証
- [ ] ツリーの作成・編集・削除が可能
- [ ] マイページに自分のツリーが表示される
- [ ] 共有されたツリーが表示される
- [ ] 権限チェックが不正アクセスを防ぐ
- [ ] メンバーの役割変更が可能（オーナーのみ）
- [ ] メンバーの削除が可能（権限による）

### Phase 3 検証
- [ ] ツリー選択後、そのツリーのノードのみ表示される
- [ ] ノードの作成・編集・削除が可能（オーナー/編集者）
- [ ] 閲覧者は編集ボタンが表示されない
- [ ] 閲覧者は入力欄が読み取り専用
- [ ] マルチペアレント関係が同一ツリー内で動作
- [ ] 異なるツリー間での親子関係追加が拒否される
- [ ] 循環参照防止が機能する

### Phase 4 検証
- [ ] 2人のユーザーが同じノードを同時編集
- [ ] 2番目の保存時に競合ダイアログが表示される
- [ ] 「サーバー版を使用」でローカル変更が破棄される
- [ ] 「自分の版を維持」でサーバーが上書きされる
- [ ] バージョン番号が正しくインクリメントされる

### Phase 5 検証
- [ ] メールアドレスで招待を送信できる
- [ ] 受信者にメールが届く
- [ ] 招待リンクをクリックして受諾できる
- [ ] 受諾後、tree_membersに追加される
- [ ] 有効期限切れの招待が拒否される

### Phase 6 検証
- [ ] 招待受信時に通知が作成される
- [ ] 通知ベルに未読カウントが表示される
- [ ] 通知をクリックで既読になり、該当ページに遷移
- [ ] 通知が60秒ごとにポーリングされる

### Phase 7 検証
- [ ] プロフィールページが表示される
- [ ] 表示名を変更できる
- [ ] 表示名がUI全体に反映される

### Phase 8 検証
- [ ] 全E2Eテストが通過
- [ ] 主要なバグが修正されている
- [ ] ローディング状態が適切に表示される
- [ ] エラーメッセージが分かりやすい
- [ ] レスポンシブデザインが機能する

---

## セキュリティ考慮事項

### 認証セキュリティ
- OAuth stateパラメータでCSRF保護
- JWT署名に強力なシークレット（256ビット以上）使用
- httpOnly Cookieでセッショントークン保存
- セッション有効期限（30日）

### 認可セキュリティ
- 全APIエンドポイントで権限チェック実施
- クライアント側の権限チェックを信頼しない
- 最小権限の原則（閲覧者は読み取りのみ）

### データセキュリティ
- パラメータ化クエリでSQLインジェクション防止
- ユーザー生成コンテンツのサニタイズ（XSS防止）
- 認証エンドポイントでのレート制限
- CORS設定で許可されたオリジンのみアクセス可能

### ツリー分離
- tree_id による厳密なデータ分離
- ツリー間のクロスクエリ禁止
- 親子関係作成時に両ノードが同一ツリーか検証

---

## リスクと対策

### リスク1: マイグレーション中のデータ損失
- **対策:** マイグレーション前にデータベースバックアップ
- **ロールバック:** 30日間バックアップ保持、復元スクリプト用意

### リスク2: OAuthプロバイダーのダウンタイム
- **対策:** 複数プロバイダーサポート（Google + GitHub）
- **将来対策:** メール/パスワード認証の追加

### リスク3: 同時編集競合
- **対策:** 楽観的ロックでバージョン管理
- **UX:** 明確な競合解決UI

### リスク4: パフォーマンス低下（大規模ツリー）
- **対策:** tree_id にインデックス、大規模ツリーのページネーション
- **モニタリング:** クエリパフォーマンスのログ記録

### リスク5: 招待スパム
- **対策:** 招待APIでレート制限
- **将来対策:** メール検証、CAPTCHA

---

## 今後の拡張機能（MVP後）

### 監査ログ
全ノード変更の履歴記録（誰がいつ何をしたか）

### リアルタイムコラボレーション
WebSocketまたはDurable Objectsで他ユーザーの編集をリアルタイム表示

### コメント・メンション機能
ノードへのコメント、@メンション通知

### タグ・ラベル
カスタムタグでノードを分類

### エクスポート・インポート
ツリーをJSON、Markdown、OPML形式でエクスポート

### 高度な検索
全ツリー横断の全文検索

---

## まとめ

この実装計画により、Zeeta Webは単一ユーザーエディタから本格的なマルチユーザー協調作業プラットフォームに進化します。

**主な成果:**
- OAuth認証で安全なユーザー管理
- ワークスペース型ツリーで柔軟な情報整理
- きめ細かい権限管理（オーナー/編集者/閲覧者）
- 楽観的ロックで同時編集の競合を解決
- メール招待で簡単なチーム構築
- 通知システムでスムーズなコミュニケーション

**実装期間:** 約12週間（3ヶ月）
**主要技術:** Cloudflare Workers, D1, Hono.js, OAuth, JWT, SendGrid/Resend

実装を始める準備ができました！
