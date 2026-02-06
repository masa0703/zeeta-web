# Zeeta Web プロジェクト メモリー

## TODO・変更履歴管理

### ファイル構成
```
docs/
├── README.md            # ドキュメント目次
├── TODO.md              # 未完了タスクのみ
├── CHANGELOG.md         # 完了履歴（日付降順で追記）
│
├── architecture/        # 設計・仕様
│   ├── design.md
│   ├── api-specification.md
│   ├── database-schema.md
│   ├── screen-definition.md
│   └── multi-user/      # マルチユーザー実装
│
├── guides/              # 開発ガイド
│
└── testing/             # テスト関連
    ├── test-cases.md
    ├── test-plan-phase*.md
    └── reports/         # テスト詳細レポート
        └── YYYY-MM-DD.md
```

### 運用フロー

1. **タスク追加時**: `docs/TODO.md` に記載
2. **タスク完了時**:
   - `docs/TODO.md` から削除
   - `docs/CHANGELOG.md` の先頭（日付セクション）に追記
   - テスト詳細を `docs/test-reports/YYYY-MM-DD.md` に保存
3. **テスト実行後**: 結果を CHANGELOG と test-reports に記録

### CHANGELOG.md フォーマット
```markdown
## YYYY-MM-DD

### 実装内容
- 機能A
- 機能B

### 修正ファイル
- `path/to/file.ts` - 説明

### テスト結果
- **成功**: X/Y (Z%)
- **テストファイル**: `tests/xxx.spec.js`
- **詳細レポート**: [testing/reports/YYYY-MM-DD.md](testing/reports/YYYY-MM-DD.md)
```

---

## 技術メモ

### メールサービス
- **使用中**: Mailgun API
- **ドメイン**: mail.zeetaweb.jp
- **環境変数**: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`

### データベース
- **ローカルD1パス**: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`
- **GUIツール**: DB Browser for SQLite で開ける

### 開発サーバー
- **起動コマンド**: `npm run dev:sandbox`
- **ポート**: 3000
- **ビルド**: `npm run build` 後に実行

### テスト
- **フレームワーク**: Playwright
- **ES Modules**: `import { test, expect } from '@playwright/test'` を使用
- **実行**: `npx playwright test tests/xxx.spec.js`
