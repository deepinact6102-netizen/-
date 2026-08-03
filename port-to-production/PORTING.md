# 本番（mycomise/mycomise-1p の main）への移植手順

2026-08-01〜08-03 にこのリポジトリ（`deepinact6102-netizen/-`）で作った修正5件を、
本番リポジトリ `mycomise/mycomise-1p` の `main` へ移すための一式。

## ⚠️ なぜここに置いてあるのか

**このリポジトリを持つセッションからは `mycomise/mycomise-1p` に触れられない。**
1セッションに追加できるのは同一所有者のリポジトリだけで、`add_repo` は次を返す:

```
cross-tier adds are not supported in v1: requested "mycomise/mycomise-1p"
but session already has repos from owner(s) [deepinact6102-netizen]
```

**`mycomise/mycomise-1p` を最初のソースにした新しいセッションを立てて、そこで作業すること。**
そのセッションから、この一式は公開リポジトリとして取得できる:

```bash
git clone https://github.com/deepinact6102-netizen/-.git /tmp/src
cd /tmp/src && git checkout claude/port-5-fixes-to-main-w2unym
# パッチは port-to-production/patches/ にある
```

## ファイル配置の対応

| こちら（`-`） | 本番（`mycomise-1p`） |
|---|---|
| `mycomise-api/api/*.js` | `api/*.js`（リポジトリ直下） |
| `mycomise-api/lib/*.js` | `lib/*.js`（リポジトリ直下） |
| `v5.html` / `demo.html` / `print.html` | 同じ（直下） |

**パッチのパスは本番の配置に書き換え済み**なので、リポジトリのルートでそのまま
`git apply` できる。`stripe-webhook.js` の `import { getRedis } from '../lib/redis.js'`
は、どちらの配置でも `api/` の1つ上が `lib/` なので**書き換え不要**。

## 適用前に必ず確認すること

本番の画面ファイルはこちらより**新しい可能性がある**（本番の最終デプロイは 07-29 の `cd5540e`、
こちらの画面ファイルの最終更新は 07-21）。**先に差分を取ること。**

```bash
# 本番リポジトリのルートで
for f in v5.html demo.html print.html; do
  echo "=== $f ==="; diff "$f" "/tmp/src/$f"
done
diff api/stripe-webhook.js /tmp/src/mycomise-api/api/stripe-webhook.js
diff lib/redis.js          /tmp/src/mycomise-api/lib/redis.js
```

- **差分が無い、または修正5件の分だけ** → パッチをそのまま適用してよい。
- **本番側に別の変更がある** → パッチは当たらない可能性が高い。下の「各修正の中身」を読んで
  **手で当てる**。機械的なコピーは本番側の変更を消すので**しないこと**。

## 適用

```bash
cd <mycomise-1p のルート>
git apply --check port-to-production/patches/01-v5-auth-failopen.patch   # まず --check
git apply           port-to-production/patches/01-v5-auth-failopen.patch
```

`05` と `01` は同じコミット（`c01b6e5`）の `v5.html` を分けたもの。**`05` → `01` の順**で当てる。
`03` は `01`/`05` を当てた後の `v5.html` を前提にしている。**推奨順: 05 → 01 → 02 → 03 → 04。**

| # | パッチ | 対象ファイル | 元コミット |
|---|---|---|---|
| 1 | `01-v5-auth-failopen.patch` | `v5.html` | `c01b6e5` |
| 2 | `02-demo-localstorage-isolation.patch` | `demo.html`, `print.html` | `62d75c2` |
| 3 | `03-ocr-name-matching.patch` | `v5.html`, `demo.html` | `d49aacf` |
| 4 | `04-stripe-subscription.patch` | `api/stripe-webhook.js` | `49f55b3` |
| 5 | `05-v5-gate-links.patch` | `v5.html` | `c01b6e5` |

検証済み: この5枚を `-` 側の修正前の状態に当てると、`-` の現在のファイルと**バイト単位で一致**する。

## 触ってはいけないもの

- **`index.html` を変更しないこと。** 元コミット `c01b6e5` は `index.html` も変えているが、
  それは `-` 側の話（`yakitori_order.html` → `demo.html` へのリダイレクト先修正）。
  **本番の `index.html` は宣伝ページ（LP）で別物。パッチからは意図的に除外してある。**
- **本番にしか無いファイル（LP用画像、`マニュアル.html` 等）を消さないこと。**
- **`verify-code.js` の `source: 'repo:-'` は移植しないこと。** これは「本番がどちらの
  リポジトリで動いているか」を判別するためにこちらに付けた目印（コミット `4b43605`）で、
  本番に入れると逆に嘘の表示になる。5件のうちには含まれていない。

---

# 各修正の中身（手で当てる場合の指針）

## 1. アクセスコード認証のフェイルオープン封鎖（`v5.html`）

**問題:** 保存済みコードの再確認で通信が失敗すると `catch` で無条件に `showApp()` を
呼んでいた。**オフラインにするだけでゲートを迂回できた。**

**修正:**
- `yakitori_access_verified_at` に「サーバーが最後に有効と認めた時刻」を保存。
- サーバーに確認できないときは、そこから **7日以内なら通す／超えたらゲートへ戻す**。
- **猶予期間中は確認時刻を更新しない。** 更新すると猶予が無限に延びて元の穴に戻る。
- `Date.now() - verifiedAt < 0`（端末の時計を未来にした場合）は拒否。
- **`!res.ok` を `throw` して通信エラー扱いにする。** 従来は 500 などのサーバー障害を
  「コードが無効」と誤判定し、`localStorage.removeItem` で
  **課金中の顧客の保存済みコードを消していた。**
- コードと確認時刻がずれないよう、消すときは `clearAccess()` で必ず両方まとめて消す。

## 2. デモと本番の localStorage 分離（`demo.html`, `print.html`）

**問題:** デモと本番が同一オリジンで**同じ保存キー**を使っていた。
**デモを試すと実店舗の発注データが上書きされて消えた。**

**修正:**
- `demo.html` の全読み書きを `demo_` プレフィックスを付ける `demoStorage` ラッパー経由に。
- `print.html` は `?demo=1` の有無で読むキーのプレフィックスを切り替える。
- `demo.html` からの記録用紙リンクを `./print.html?demo=1` に。
- `print.html` の「戻る」も `?demo=1` を優先（`document.referrer` が空でデモ利用者が
  ゲートへ飛ばされる問題も同時に解消）。
- デモのバナーに「本番版をお持ちの方はこちら」（`./v5.html`）を追加。

## 3. OCR の行ズレ修正（`v5.html` と `demo.html` の両方）★最も危険だったバグ

**問題:** Tesseract の出力から数字を抜き、**読めなかった行を詰めてから**上から順に品目へ
割り当てていた。**1品目でも読み落とすと以降が全部ズレる。**
店は気づかないまま、ある品目の残数を別の品目として保存し、それを元に発注していた。

**修正:** 位置ではなく**品目名で照合**する（`readSheet()`）。
- 記録用紙には品目名が印字されており、Tesseract は日本語で動いているので名前を手がかりにできる。
- 1文字までの誤認識を許容（レーベンシュタイン距離 ≤ 1）。ただし**2文字以下の名前は曖昧一致させない**
  （他の品目に紛れ込むため）。
- 名前の**右側**の数字を拾う（用紙は名前の右が記入欄）。次の行に落ちた数字も拾う。
- 長い名前を優先して割り当てる（「むね」が「とりむね」の行を取らないように）。
- 同じ行を同じ確からしさで複数品目が取り合う場合は、取り違えを避けて**捨てる**。
- **名前が見つからない品目は空欄のまま。** 店主が埋める空欄の方が、気づかれない誤った数字より良い。
- 位置ベースの割り当ては「**名前が1つも読めなかった場合**」のみ残し、その旨を画面に明示する。

**`v5.html` と `demo.html` は本体約2200行が重複しているので、必ず両方に入れること。**

## 4. Stripe サブスク対応（`api/stripe-webhook.js`）

**問題:** サブスク販売なのに `customer.subscription.deleted`（完全な解約）にしか反応せず、
**カードが止まった購読者が、Stripe が再請求を試みる数週間ずっとフルアクセスを保っていた。**

**修正:**
- `customer.subscription.updated` を追加し、`ACCESS_BY_STATUS` でサブスクの状態を
  コードの有効・無効に対応付ける。
- **`past_due` は「あえて」有効のまま。** これは Stripe が再請求中の状態で、多くはカードの
  期限切れ。1回の失敗で発注業務を止める方が店にとって痛手。**ここを `false` にしないこと。**
  Stripe が諦めて `unpaid` / `canceled` に移った時点で失効させる。
- 未知の状態は安全側に倒して無効化し、`console.warn` を出す。
- `invoice.payment_failed` を追加。**アクセスは止めず**メールで通知するだけ。
  カードを直せば次の状態変化でそのまま使い続けられる。
- **再送・順序逆転への対策:** `event.created` を `record.statusEventAt` と比べ、
  すでに適用した分より古いイベントは捨てる。同じイベントが再送されても書き込む内容は変わらない。
- **解約ハンドラの `JSON.parse` 堅牢化:** `readCodeRecord()` に切り出し、壊れたレコードでも
  例外で落ちないようにした。従来は webhook が失敗し、Stripe が延々とリトライしていた。
- `invoice.subscription` は API バージョンで形が変わるため
  `invoice.parent?.subscription_details?.subscription` にフォールバックする。

**適用後に確認すること:**
- Stripe ダッシュボードの webhook エンドポイントで、
  **`customer.subscription.updated` と `invoice.payment_failed` の送信が有効になっているか。**
  有効にしないとコードを入れても何も起きない。
- `RESEND_API_KEY` / `MAIL_FROM` が Vercel の環境変数に入っているか（支払い失敗メールで使う）。

## 5. `v5.html` のゲート画面に導線を追加

**問題:** コードを持たない人がゲート画面で行き止まりになっていた。

**修正:** 入力欄の下に区切り線と「アクセスコードをお持ちでない方へ」を置き、
`demo.html`（体験版）と Stripe 購入ページ（`https://buy.stripe.com/9B6cN45Q7aGg51B1ZecAo00`）
への2本のリンクを追加。**購入 URL が今も正しいか確認すること。**

---

# 移植後の動作確認

本番稼働中のサービスなので、デプロイ後に最低限これだけは見ること。

1. **`v5.html`**: 有効なコードで入れる／機内モードにしても7日以内なら開く／
   `yakitori_access_verified_at` を8日前に書き換えるとゲートに戻る。
2. **`demo.html`**: デモで店舗名や残数をいじった後、`v5.html` の本番データが**無傷**なこと。
   DevTools の Application → Local Storage で `demo_` 付きのキーだけが増えているか。
3. **OCR**: 記録用紙を1品目わざと塗りつぶして撮影し、**その品目だけが空欄**で
   他がズレていないこと。「◯品目中◯品目を読み取りました」の表示が出ること。
4. **`print.html`**: デモから開くと `?demo=1` が付き、「← デモに戻る」になること。
5. **Stripe**: テストモードでサブスクを `past_due` にして**アクセスが残る**こと、
   `canceled` にして**失効する**こと。

# 関連する既知の問題（今回の5件には含まれない）

`CLAUDE.md` と `PROJECT_HISTORY.md` に詳細がある。本番側でも残っている見込みのもの:

- `manual.html` の「アプリを開く」が `document.referrer` 依存で、referrer が空だと
  デモ利用者が `v5.html` に飛ばされる（`print.html` と同じ `?demo=1` 方式で直せる）。
- 旧版ファイル（`yakitori_order.html`, `v2〜v4.html`）が本番にも残っているなら、
  **認証ゲートが無いので直打ちで有料版相当が使える。** 要確認・要削除。
- `verify-code` にレート制限が無く、1コードで台数無制限。
- Redis のレコードに TTL が無く、解約済みのメールアドレスが永久に残る。
