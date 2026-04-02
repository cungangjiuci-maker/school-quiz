# 商業高校 工業簿記 小テスト自動化システム

授業プリント（Word/PDF）をアップロードすると、Claude AIが自動で工業簿記の小テストを作問します。生徒はスマホからCBT形式で受験でき、即時採点・成績集計が可能です。

---

## 機能

- **AI作問**: Word(.docx)/PDF(.pdf)をアップロード → Claude APIが仕訳・計算・選択問題を自動生成
- **4桁コード配布**: テスト公開時に4桁コードを発行、生徒に伝えるだけ
- **生徒CBT**: スマホ対応の受験画面（仕訳・計算・選択の3形式）
- **即時採点**: 送信後すぐに○×と正解を表示
- **成績集計**: 伸び率・ランク付き、Excelエクスポート、グラフ表示

---

## ローカル開発環境のセットアップ

### 1. 依存関係インストール

```bash
npm install
```

### 2. Supabaseセットアップ

1. [Supabase](https://supabase.com) でプロジェクトを作成
2. ダッシュボードの **SQL Editor** を開き、`schema.sql` の内容を貼り付けて実行
3. **Authentication → Providers → Email** を開き、「Confirm email」を**オフ**に設定（開発中はメール確認不要にすると便利）

### 3. 環境変数の設定

`.env.local` ファイルをプロジェクトルートに作成し、以下を記入します：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
ANTHROPIC_API_KEY=sk-ant-api03-...
```

各値の取得場所は後述の「環境変数一覧」を参照してください。

### 4. 開発サーバー起動

```bash
npm run dev
```

`http://localhost:3000` をブラウザで開く。

### キャッシュをクリアして再起動したい場合

```bash
npm run clean   # .next フォルダを削除
npm run dev
```

---

## Vercel へのデプロイ手順

### 前提条件

- [Vercel アカウント](https://vercel.com) を作成済みであること
- [Vercel CLI](https://vercel.com/docs/cli) をインストール済みであること（`npm i -g vercel`）
- リポジトリが GitHub / GitLab / Bitbucket にプッシュ済みであること（推奨）

---

### 方法 A：Vercel ダッシュボードから（推奨）

1. **[vercel.com/new](https://vercel.com/new) を開く**

2. **リポジトリをインポート**  
   GitHub 等のリポジトリ一覧から本プロジェクトを選択して「Import」をクリック

3. **Framework Preset の確認**  
   自動で `Next.js` が選択されていることを確認する

4. **環境変数を設定する**  
   「Environment Variables」セクションを開き、以下の3つを追加する（詳細は下の「環境変数一覧」参照）

   | 変数名 | 値の例 |
   |--------|--------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` |
   | `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |

   > **注意**: `ANTHROPIC_API_KEY` はサーバーサイドのみで使用するため、`NEXT_PUBLIC_` プレフィックスは**不要**です。

5. **「Deploy」ボタンをクリック**  
   ビルドが完了すると `https://your-app.vercel.app` のような URL が発行される

6. **Supabase の Redirect URL を更新する**  
   Supabase ダッシュボード → **Authentication → URL Configuration** を開き、  
   「Site URL」と「Redirect URLs」に Vercel の本番 URL を追加する  
   例: `https://your-app.vercel.app`

---

### 方法 B：Vercel CLI から

```bash
# Vercel CLI のインストール（未インストールの場合）
npm install -g vercel

# ログイン
vercel login

# デプロイ（初回は対話式で設定）
vercel

# 本番環境へデプロイ
vercel --prod
```

CLI での環境変数追加：

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add ANTHROPIC_API_KEY
```

---

### デプロイ後の確認チェックリスト

- [ ] `/login` でアカウント登録・ログインができる
- [ ] `/dashboard/create` で Word ファイルをアップロードして問題が生成される
- [ ] 生成された問題に4桁コードが発行される
- [ ] `/quiz` でコードを入力してテストを受験できる
- [ ] 採点結果が表示され、DB に保存される
- [ ] `/dashboard/results` で成績一覧が確認できる

---

## 環境変数一覧

| 変数名 | 必須 | 説明 | 取得場所 |
|--------|:----:|------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase プロジェクトの URL | Supabase ダッシュボード → **Project Settings → API → Project URL** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase の匿名アクセスキー（公開可） | Supabase ダッシュボード → **Project Settings → API → anon public** |
| `ANTHROPIC_API_KEY` | ✅ | Claude API キー（秘密・公開厳禁） | [console.anthropic.com](https://console.anthropic.com) → **API Keys** |

> **セキュリティ注意**  
> - `ANTHROPIC_API_KEY` は絶対に Git にコミットしないでください。`.gitignore` に `.env.local` が含まれていることを確認してください。  
> - Vercel の環境変数は暗号化されて保存されるため、ダッシュボードへの入力は安全です。

---

## ページ構成

| パス | 対象 | 説明 |
|------|------|------|
| `/login` | 教員 | ログイン・新規登録 |
| `/dashboard` | 教員 | テスト一覧・コード確認 |
| `/dashboard/create` | 教員 | AI作問（ファイルアップロード→生成→公開） |
| `/dashboard/results` | 教員 | 成績集計・伸び率・Excelエクスポート |
| `/quiz` | 生徒 | 4桁コード入力→受験→即時採点 |

---

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フレームワーク | Next.js 14 (App Router) |
| スタイリング | Tailwind CSS |
| データベース・認証 | Supabase |
| AI作問 | Anthropic Claude API (claude-sonnet-4-20250514) |
| Word読み込み | mammoth |
| Excel出力 | xlsx |
| グラフ | recharts |
| 言語 | TypeScript |

---

## トラブルシューティング

### CSS が崩れた場合

```bash
npm run clean && npm run dev
```

### ログイン後にダッシュボードに遷移しない場合

Supabase ダッシュボード → **Authentication → URL Configuration** の  
「Site URL」が正しいドメイン（ローカルなら `http://localhost:3000`）になっているか確認する。

### AI が問題を生成しない場合

- `ANTHROPIC_API_KEY` が正しく設定されているか確認する
- Vercel の場合：ダッシュボード → **Settings → Environment Variables** で値を確認する
- ログ確認：Vercel ダッシュボード → **Deployments → Functions** でエラーログを確認する
