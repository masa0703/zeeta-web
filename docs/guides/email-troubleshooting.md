# 招待メール送信のトラブルシューティング

## 問題: 招待メールが届かない

招待メールが送信されない場合、以下の手順で診断・修正してください。

---

## 診断手順

### 1. ログの確認

開発サーバーのコンソールログを確認してください。招待を送信すると、以下のいずれかのメッセージが表示されます：

#### ✅ 正常な場合
```
📧 Sending invitation email to: user@example.com
✅ Invitation email sent successfully to: user@example.com
```

#### ⚠️ API キーが未設定の場合
```
⚠️  RESEND_API_KEY not configured. Invitation email will NOT be sent.
📧 Would send invitation email to: user@example.com
```

#### ❌ メール送信に失敗した場合
```
📧 Sending invitation email to: user@example.com
❌ Failed to send invitation email: [エラーメッセージ]
```

---

## 解決方法

### ケース 1: RESEND_API_KEY が未設定

**症状:**
```
⚠️  RESEND_API_KEY not configured. Invitation email will NOT be sent.
```

**解決方法:**

#### Step 1: Resend アカウントの作成

1. https://resend.com にアクセス
2. アカウントを作成（無料プランあり）
3. メールアドレスを確認

#### Step 2: API キーの取得

1. Resend ダッシュボードにログイン
2. https://resend.com/api-keys にアクセス
3. 「Create API Key」をクリック
4. 名前を入力（例: "zeeta-dev"）
5. 権限は「Sending access」を選択
6. 「Add」をクリック
7. 表示された API キーをコピー（**一度しか表示されません！**）

#### Step 3: .dev.vars ファイルに設定

1. プロジェクトルートの `.dev.vars` ファイルを開く
   ```bash
   cd /Users/masaharu_mikami/Documents/cloude\ code/zeeta-web
   nano .dev.vars  # または vi, code など
   ```

2. `RESEND_API_KEY` の値を更新
   ```bash
   RESEND_API_KEY=re_YourActualAPIKeyHere
   ```

3. ファイルを保存

#### Step 4: 開発サーバーを再起動

```bash
# サーバーを停止 (Ctrl+C)
# サーバーを再起動
npm run build
npm run dev:sandbox
```

#### Step 5: テスト

1. マイページで招待を送信
2. コンソールログで以下を確認:
   ```
   📧 Sending invitation email to: test@example.com
   ✅ Invitation email sent successfully
   ```

---

### ケース 2: メール送信に失敗

**症状:**
```
❌ Failed to send invitation email: [エラーメッセージ]
```

#### エラー: "Invalid API key"

**原因:** API キーが間違っているか、期限切れ

**解決方法:**
1. Resend ダッシュボードで API キーを確認
2. 新しい API キーを作成
3. `.dev.vars` を更新
4. サーバー再起動

#### エラー: "Domain not verified"

**原因:** Resend で送信ドメインが未認証

**解決方法（開発環境）:**

開発環境では `onboarding@resend.dev` から送信されます（デフォルト）。これは Resend の検証済みドメインなので、そのまま使用できます。

**解決方法（本番環境）:**

1. Resend ダッシュボードで独自ドメインを追加
2. DNS レコードを設定して認証
3. `src/services/email.ts` の `from` アドレスを変更:
   ```typescript
   from: params.from || 'Zeeta <noreply@yourdomain.com>'
   ```

#### エラー: "Rate limit exceeded"

**原因:** 無料プランの送信制限を超えた

**解決方法:**
1. Resend ダッシュボードで使用量を確認
2. 有料プランにアップグレード、または制限がリセットされるまで待機
3. テスト環境では実際のメール送信をスキップするオプションを検討

---

### ケース 3: メールが送信されたがメールボックスに届かない

**症状:**
```
✅ Invitation email sent successfully to: user@example.com
```
でも、メールボックスに届かない。

#### 確認事項

1. **スパムフォルダを確認**
   - Gmail の場合: 「迷惑メール」「プロモーション」タブも確認

2. **Resend ダッシュボードで配信ログを確認**
   - https://resend.com/emails にアクセス
   - 最近送信されたメールの一覧が表示される
   - ステータスが "Delivered" か確認
   - エラーがある場合、詳細を確認

3. **メールアドレスが正しいか確認**
   - タイポがないか
   - 実際に存在するアドレスか

4. **テスト用の個人メールアドレスで試す**
   - 会社のメールアドレスは厳しいフィルタリングがある場合がある
   - Gmail や Yahoo などの個人アドレスで試す

---

## 開発環境でのメール送信スキップ（オプション）

開発環境で実際のメール送信をスキップしたい場合、環境変数を設定しないか、モックモードを有効にできます。

### 方法 1: RESEND_API_KEY を設定しない

`.dev.vars` から `RESEND_API_KEY` を削除またはコメントアウト:
```bash
# RESEND_API_KEY=re_YourAPIKey
```

この場合、メールは送信されず、コンソールに警告が表示されます:
```
⚠️  RESEND_API_KEY not configured. Invitation email will NOT be sent.
📧 Would send invitation email to: user@example.com
```

### 方法 2: ローカルメールサーバー（高度）

MailHog などのローカルメールサーバーを使用して、実際のメール送信なしでメールをキャプチャできます。

---

## 本番環境でのメール設定

本番環境では、以下の追加設定が推奨されます：

### 1. 独自ドメインの設定

Resend で独自ドメインを認証:
1. Resend ダッシュボードで「Domains」→「Add Domain」
2. ドメイン名を入力（例: yourdomain.com）
3. 表示された DNS レコードを追加:
   - TXT レコード（認証用）
   - MX レコード（受信用、オプション）
   - DKIM レコード（送信者認証）
4. 認証を待つ（通常数分～数時間）

### 2. From アドレスの変更

`src/services/email.ts` を編集:
```typescript
from: params.from || 'Zeeta <noreply@yourdomain.com>'
```

### 3. 環境変数の設定

Cloudflare Pages の環境変数に `RESEND_API_KEY` を設定:
1. Cloudflare Pages ダッシュボード
2. プロジェクト → Settings → Environment variables
3. Production 環境に `RESEND_API_KEY` を追加

---

## よくある質問

### Q: 無料プランで何通まで送信できますか？

A: Resend の無料プランは月間 3,000 通まで送信可能です。開発・テスト環境では十分です。

### Q: メール送信が失敗しても招待は作成されますか？

A: はい。招待はデータベースに作成され、招待トークンは有効です。メール送信は非ブロッキングなので、メールが送信できなくても招待リンクを手動でコピーして送ることができます。

### Q: テスト環境で実際のメールアドレスにメールを送信したくない場合は？

A: Resend API キーを設定しない、または Mailhog などのローカルメールサーバーを使用してください。

### Q: メールテンプレートをカスタマイズしたい場合は？

A: `src/services/email.ts` の `generateInvitationEmailHtml()` 関数を編集してください。

---

## まとめ

招待メールが届かない問題は、ほとんどの場合 **RESEND_API_KEY が未設定** または **API キーが無効** です。

**チェックリスト:**
- [ ] Resend アカウントを作成
- [ ] API キーを取得
- [ ] `.dev.vars` に `RESEND_API_KEY` を設定
- [ ] 開発サーバーを再起動
- [ ] コンソールログで「✅ Invitation email sent successfully」を確認
- [ ] Resend ダッシュボードで配信ログを確認

それでも問題が解決しない場合は、コンソールログとエラーメッセージを確認してください。
