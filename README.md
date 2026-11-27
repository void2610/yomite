# Yomite — AIの報告を、読み手が判断に集中して読むための読書室

AI が作った HTML 報告を「読むためだけ」のサイトです。みのるん（@minorun365）の講演
『認知負荷の減らし方 ～開発にも日常業務にも活かせるノウハウ～』で紹介された「HTML共有くん」の仕組みを Cloudflare で再実装したものです。

- 報告ページは案件（プロジェクト）ごとに新しい順で並ぶ
- 未読バッジと未読件数が出て、既読は D1 に残るので Mac とスマホで同期する
- 進行中の案件・ページはピン留めで上に固定できる
- 判断ポイントは末尾にまとめず、ページの入口にハイライトで表示する
- スマホから依頼を1件置けるインボックスがあり、Mac 側のエージェントが後で取り込む

## 構成

| 部品 | 役割 |
|---|---|
| Cloudflare Worker (`src/worker.js`) | 読む側の画面（UI同梱）と JSON API |
| R2 バケット `yomite-pages` | 公開された HTML 本体を `pages/<slug>.html` で保存 |
| D1 データベース `yomite` | ページのメタ情報（タイトル・案件・既読・ピン留め）とインボックス |
| Worker Secret `PUBLISH_TOKEN` | 公開 API とインボックス取得 API の Bearer トークン |

元の講演では裏側が AWS（S3 + CloudFront + Cognito + Lambda）でしたが、本実装では Cloudflare に置き換えています。

## API

| メソッドとパス | 認証 | 説明 |
|---|---|---|
| `GET /` | Access 前提 | 読む側の画面 |
| `GET /api/pages` | Access 前提 | 一覧。`?project=` と `?q=`（検索）対応。並びはピン留め→新しい順 |
| `POST /api/pages` | `Authorization: Bearer <PUBLISH_TOKEN>` | 公開。JSON: `{title, project, summary, decision_points, html, slug?}` |
| `GET /p/:slug` | Access 前提 | R2 から HTML 本体を返す |
| `POST /api/pages/:slug/read` | Access 前提 | 既読にする |
| `POST /api/pages/:slug/pin` | Access 前提 | ピン留めの切り替え |
| `GET /api/inbox` | `PUBLISH_TOKEN` | 未取り込みの依頼一覧（Mac 側エージェント用） |
| `POST /api/inbox` | Access 前提 | スマホの画面から依頼を1件置く `{body}` |
| `POST /api/inbox/:id/taken` | `PUBLISH_TOKEN` | 依頼を取り込み済みにする |
| `POST /api/answers/:slug` | なし（ページのリンクが前提） | 判断キットの回答を保存 `{question, choice, comment}`。同じ質問は最新で上書き |
| `GET /api/answers/:slug` | なし | その記事の回答一覧。ページ側が復元に使う |
| `GET /api/answers` | `PUBLISH_TOKEN` | 全記事の回答を新しい順に最大200件 |

判断キットの回答はサーバー側 (D1 の `answers` テーブル) に保存されます。ページで選ぶ・書くと自動で送られ、開き直すと復元されます。Muse 側は `scripts/answers.mjs <slug>` または `--all` で読みます。コピーバーは手元の控えとして残してあります。

## デプロイ済み

**公開 URL: https://yomite.void2610.workers.dev**

2026-11-24 に Muse の Cloudflare 公式コネクタ（API）経由でデプロイ済みです。D1 データベース `yomite`（マイグレーション適用済み）、R2 バケット `yomite-pages`、Worker `yomite`、Secret `PUBLISH_TOKEN`（値はリポジトリ外の `.publish-token` に保管、gitignore 済み）を作成済みでございます。動作確認済み: 一覧 UI 200、トークン付き公開、`/p/:slug` 表示、既読化、トークンなし公開は 401。

以下は再デプロイや作り直しが必要な場合の手順です。

## デプロイ手順（GitHub 連携 / Workers Builds）

手元の端末で wrangler にログインするのではなく、Cloudflare の GitHub 連携でこのリポジトリから直接デプロイします。GitHub へ push するたびに自動でデプロイされます。

1. Cloudflare ダッシュボード → **Workers & Pages** → **Create** → **Import a repository**（GitHub）を選ぶ
2. GitHub と連携し、リポジトリ **`void2610/yomite`** を選ぶ
3. 設定は次のとおりにして **Save and Deploy**
   - Production branch: `master`
   - Build command: （空欄）
   - Deploy command: `npx wrangler deploy`
4. 初回デプロイが完了すると `yomite.<サブドメイン>.workers.dev` で公開される

### D1 と R2 の用意

`wrangler.toml` では D1（`yomite`）と R2（`yomite-pages`）を名前だけで指定してあります。現在の wrangler は初回デプロイ時に同名のリソースを自動で用意します。

自動で用意されなかった場合は、ダッシュボードで次を作ってから再デプロイ（GitHub へ push、または Workers Builds の画面から Retry）してください。

- D1: Workers & Pages → D1 → Create database、名前は `yomite`
- R2: R2 → Create bucket、名前は `yomite-pages`（R2 の有効化が済んでいない場合は先に有効化）

### マイグレーション（初回のみ）

テーブル作成の SQL は `migrations/0001_init.sql` です。次のどちらかで当ててください。

- Workers Builds の Deploy command を一度だけ `npx wrangler d1 migrations apply yomite --remote && npx wrangler deploy` に変えてデプロイし、終わったら元の `npx wrangler deploy` に戻す
- D1 のコンソール（ダッシュボード → D1 → `yomite` → Console）で `migrations/0001_init.sql` の内容をそのまま実行する

### 公開用トークン（デプロイ後）

デプロイが済んだら、Worker の **Settings → Variables and Secrets** で Secret `PUBLISH_TOKEN` を追加してください（任意の長い文字列。publish CLI の `YOMITE_TOKEN` と同じ値を使います）。

### Cloudflare Access を前に置く（推奨）

個人専用サイトなので、Workers の URL の前に Cloudflare Access を置いて自分だけが入れるようにしてください。

1. Cloudflare ダッシュボード → Zero Trust → Access → Applications → Add an application（Self-hosted）
2. ドメインにデプロイ先のホスト名（`yomite.<サブドメイン>.workers.dev` または独自ドメイン）を指定
3. ポリシーは Allow で自分のメールアドレスのみ許可

注意: Access を置くと publish CLI からも Access の認証が求められます。CLI から公開する場合は、Access の Service Token を作って `CF-Access-Client-Id` / `CF-Access-Client-Secret` ヘッダーを併用するか、公開用だけ別ホスト名にする運用にしてください。本実装の `PUBLISH_TOKEN` は Access の内側での二重の守りとして置いています。

## ローカル開発

```bash
npm install
npx wrangler d1 migrations apply yomite --local
npx wrangler dev
```

`PUBLISH_TOKEN` が未設定の環境では、開発用にトークン認証を素通しします。本番では必ず secret を設定してください。ローカルでトークンを試す場合は `.dev.vars` に `PUBLISH_TOKEN=dev-token` と書きます（gitignore 済み）。

## 使い方

### 報告を公開する

記事は **Markdown で書くのが基本形**（2026-11-27 の md 化以降）。見た目は Yomite 側が
統一テンプレート（`/kit/report.css` + md 用スタイル）で描くので、書き手は中身だけに集中する。
Worker は描画結果を `pages/<slug>.html` に、原稿を `pages/<slug>.md` に保存し、
原稿は `GET /src/<slug>` で取り戻せる（再編集は md から行う）。

```bash
export YOMITE_URL=https://yomite.<your>.workers.dev
export YOMITE_TOKEN=<PUBLISH_TOKEN>
node scripts/publish.mjs examples/sample-report.md \
  --title "サンプル報告" --project "動作確認" \
  --summary "全件合格" --decision "この形式で進めてよいか"
# → https://.../p/2026-...-xxxxxx が表示される
# 同じ記事の直しは --slug <slug> を付けると同じ URL で差し替わる
```

md の Yomite 独自形式（`src/markdown.js` が描画）:

```markdown
:::html
<div class="rpt-flow">… md で書けない構造は raw HTML で …</div>
:::

:::html src="parts/flow.html"
（外部 HTML ファイルの読み込み。publish CLI が送信前に中身へ展開する）

:::decision
判断してほしい点を該当箇所に置く（中身は md で書ける）
:::

:::ask この進め方でよいか
- このまま進める (おすすめ)
- 止める
:::
（判断キット。質問と選択肢を md で書くだけで、選択とコメントはサーバーへ保存される）
```

対応する md 記法: `#`〜`####` 見出し（先頭の `#` タイトルはページ見出しと重なるため取り除かれる。
`##` が節になり3節以上で目次が自動で付く）、段落、箇条書き・番号リスト・チェックリスト、
表、引用、`コード` とコードブロック、リンク・画像、`**太字**`、`==ハイライト==`、区切り線。
`.html` の直接公開も移行期間用に残してあるが、新規の報告は md で書くこと。

運用ルール（講演の「3行ルール」）: 結論が3行を超える報告や表を使う報告は md 1枚にしてここへ出し、チャットには結論とリンクだけを書く。判断してほしい点は該当箇所に置く。

### インボックスを取り込む（Mac 側）

```bash
node scripts/inbox-fetch.mjs            # 未取り込み一覧
node scripts/inbox-fetch.mjs --take-all # 一覧＋全部を取り込み済みに
node scripts/inbox-fetch.mjs --take 3   # 1件だけ取り込み済みに
```

## スライド照合による全面実装（2026-11-24）

講演の全69枚を画像で読み、`slide-inventory.md` に棚卸ししてから実装した。

- リーダーUIはスライド12の配置（日付セクション＋「Nテーマ・M件」、案件カード、未読ドット、相対時刻、案件チップ、案件のピン／スター）
- インボックスはスライド21の画面（案件名任意、画像添付、件数ピル、完了したもの）
- 判断キット: `/kit/review.js`・`/kit/review.css`（使用例は `templates/review-example.html`）、定型書式 `/kit/report.css`（雛形は `templates/report.html`）
- 公開前 lint: `scripts/lint.mjs`（publish 時に自動で警告）
- 運用ルール: `docs/workflows.md`、スレッド名係の最小実装 `scripts/session-status.mjs`、E2E質問集の雛形 `templates/e2e-cases.json`
