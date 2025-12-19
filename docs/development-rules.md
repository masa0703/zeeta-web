# 開発ルール

このドキュメントでは、プロジェクトの開発を進める上でのルールとガイドラインを記載します。

## 設計書管理ルール

### ドキュメント構成
このプロジェクトの設計書は以下のように分離されています：

- **[design.md](./design.md)**: アーキテクチャ概要、全体設計
- **[database-schema.md](./database-schema.md)**: データベーススキーマ詳細
- **[api-specification.md](./api-specification.md)**: REST API仕様
- **[test-cases.md](./test-cases.md)**: テストケース仕様
- **[development-rules.md](./development-rules.md)**: 開発ルールとガイドライン（本ファイル）

### 設計書更新のルール

1. **機能追加時は関連する全ての設計書を更新する**
   - 例: 新しいAPIを追加した場合
     - `api-specification.md`: エンドポイント仕様を追加
     - `design.md`: 必要に応じてアーキテクチャ図を更新
     - `test-cases.md`: テストケースを追加

2. **データベーススキーマ変更時は必ず更新する**
   - マイグレーションファイル作成時に `database-schema.md` を更新
   - テーブル定義、カラム説明、マイグレーション履歴を記載

3. **重複を避け、参照リンクを使う**
   - 同じ情報を複数のファイルに書かない
   - 詳細は専門ファイルに記載し、概要ファイルからリンクで参照
   - 例: `design.md` → 「詳細は [api-specification.md](./api-specification.md) を参照」

4. **設計書が肥大化したら分離を検討する**
   - 1つのファイルが200行を超えたら分離を検討
   - 将来的に拡張予定のセクションは早めに分離

## タスク実施のルール

### 1. 新しい機能は、設計書も更新する
- 機能追加時には、必ず対応する設計書を更新してください
- 設計書と実装の整合性を保つことが重要です
- 上記「設計書管理ルール」に従って適切なファイルを更新

### 2. 実装する前にテストケースを作成する
- テスト駆動開発（TDD）のアプローチを採用します
- 実装前に期待される動作を明確にするため、先にテストケースを作成します

### 3. 実装後テストケースに従ってテストする
- 実装完了後、作成したテストケースを実行します
- テスト結果を確認し、期待通りの動作をすることを検証します

### 4. テストが全てpassした時点で完了とする
- 全てのテストケースがパスして初めて、タスク完了とみなします
- テストが失敗している状態では、タスクは未完了です

## デバッグガイド

### テスト失敗時のチェックリスト（優先順位順）

1. **サーバーログを最初に確認する**
   - 開発サーバーのログに500エラーが出ていないか確認
   - APIエンドポイントのエラーログを確認
   - ログの場所: `/tmp/claude/-Users-masaharu-mikami-Documents-cloude-code-zeeta-web/tasks/*.output`
   - コマンド例: `tail -100 /tmp/claude/-Users-masaharu-mikami-Documents-cloude-code-zeeta-web/tasks/[task-id].output`

2. **データベースの状態を確認する**
   - テーブルが正しく存在するか確認
   - コマンド例: `sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite "SELECT name FROM sqlite_master WHERE type='table';"`

3. **クライアント側のエラーメッセージを確認する**
   - ブラウザのコンソールログ
   - Playwrightのエラーメッセージ

4. **テストコードのロジックを確認する**
   - ダイアログハンドラーの登録タイミング
   - waitForTimeoutの値
   - セレクターの正確性

### よくある問題と解決方法

#### APIが500エラーを返す場合
- **原因**: データベーステーブルが存在しない、またはスキーマが不正
- **解決**: マイグレーションを実行してテーブルを再作成
- **コマンド**:
  ```bash
  rm -rf .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite*
  for i in migrations/*.sql; do
    sqlite3 .wrangler/state/v3/d1/miniflare-D1DatabaseObject/[db-file].sqlite < "$i"
  done
  ```

#### テスト間でデータが干渉する場合
- **原因**: 前のテストのデータがクリアされていない
- **解決**: beforeEachフックで`DELETE /api/test/clear`を呼び出す
- **確認**: ビルド後のコードに反映されているか確認（`npm run build`実行）

#### フロントエンドの変更が反映されない場合
- **原因**: `src/index.tsx`の変更はビルドが必要
- **解決**: `npm run build`を実行してサーバー再起動
- **ファイル別の対応**:
  - `public/static/app.js` → すぐ反映（静的ファイル、リロードのみ）
  - `src/index.tsx` → ビルド + サーバー再起動が必要
- **コマンド**:
  ```bash
  npm run build
  # サーバーを再起動（Ctrl+C して npm run dev:sandbox）
  ```