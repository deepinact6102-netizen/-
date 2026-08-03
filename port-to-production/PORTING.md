# 本番（mycomise/mycomise-1p の main）への移植手順

2026-08-01〜08-03 にこのリポジトリ（`deepinact6102-netizen/-`）で作った修正5件を、
本番リポジトリ `mycomise/mycomise-1p` の `main` へ移すための一式。

**移植作業そのものは完了・検証済み。** 残っているのは push だけ。

## 状況

本番リポジトリは**公開**なので、このセッションからも `git clone` で**読める**。
そのため差分確認・パッチ適用・検証はすべて実機の本番コードに対して実施済み。
しかし **push は 403 で拒否される**（このセッションの認証情報は `deepinact6102-netizen/-`
にしか効かない）。`add_repo` も次を返す:

```
cross-tier adds are not supported in v1: requested "mycomise/mycomise-1p"
but session already has repos from owner(s) [deepinact6102-netizen]
```

**push するには `mycomise/mycomise-1p` を最初のソースにした新しいセッションが必要。**

## 適用方法（新しいセッションでの手順）

```bash
git clone https://github.com/deepinact6102-netizen/-.git /tmp/src
cd /tmp/src && git checkout claude/port-5-fixes-to-main-w2unym

cd <mycomise-1p のルート>   # main、cd5540e の状態
git am /tmp/src/port-to-production/0001-port-five-fixes-to-production.patch
git push origin main
```

**これだけ。** 手で当て直す必要はない。

## 検証済みの事実（2026-08-03、実機の本番コードに対して確認）

本番 `main` の HEAD は `cd5540e`（Vercel の最終デプロイと一致）。

**本番の該当ファイルは、こちらの修正前の状態と1バイトも違わなかった。**

| 本番のファイル | `-` の修正前（`a93e646`）との比較 |
|---|---|
| `v5.html` | **完全一致** |
| `demo.html` | **完全一致** |
| `print.html` | **完全一致** |
| `manual.html` | **完全一致** |
| `api/verify-code.js` | `mycomise-api/api/verify-code.js` と**完全一致** |
| `api/stripe‐webhook.js` | `mycomise-api/api/stripe-webhook.js` と**完全一致** |
| `lib/redis.js` | `mycomise-api/lib/redis.js` と**完全一致** |
| `index.html` | **相違**（本番はLP。こちらはリダイレクト。→ 触らない） |
| `package.json` | `mycomise-api/package.json` と**完全一致** |

つまり「本番の方が新しいかもしれない」という懸念は**空振り**だった。07-29 の最終デプロイ
`cd5540e` は `index.html`（LP）だけの更新で、アプリ本体は 07-21 のまま止まっていた。
**衝突なく移植できる。**

検証内容:
- 本番の pristine clone に `git am` → 成功。
- 適用後の `v5.html` / `demo.html` / `print.html` / stripe webhook が、こちらの修正済み
  ファイルと**バイト単位で一致**することを確認。
- `index.html` が**変更されていない**ことを確認（`git diff cd5540e HEAD -- index.html` が空）。
- 変更ファイルは4本のみ。本番にしか無いファイル（`exterior.jpg`, `mycomiselogo.jpg`,
  `image.png`, `yakitori.jpg`, `privacy.html` 等）は**一切削除・変更していない**。
- Node で構文確認: stripe webhook（ESM）および3ファイルのインライン `<script>` 全4ブロック、
  いずれも構文エラーなし。

---

# ⚠️ 移植とは別に見つかった問題（要判断）

## 本番の `api/stripe‐webhook.js` のファイル名にUnicodeハイフンが入っている

ファイル名の「‐」が **ASCIIのハイフン（`-` / U+002D）ではなく U+2010 HYPHEN**（バイト列 `e2 80 90`）。

```
api/stripe‐webhook.js   ← U+2010。見た目はほぼ同じだが別の文字
api/verify-code.js      ← こちらは正常なASCII
```

Vercel はファイルパスをそのままルートにするため、この関数のエンドポイントは
`/api/stripe‐webhook`（U+2010）になる。**Stripe 側の webhook URL が
`https://mycomise.com/api/stripe-webhook`（ASCII）で登録されていれば、404 になり
webhook は一度も発火していないことになる。**

その場合の影響:
- 購入しても**アクセスコードが自動発行・自動送信されない**
- 解約してもコードが**失効しない**
- 今回の修正4（サブスク状態の追随）を入れても、**そもそも呼ばれないので何も起きない**

**確認してほしいこと:** Stripe ダッシュボード → Developers → Webhooks でエンドポイントURLを開き、

- **配信履歴があり成功している** → URLは U+2010 版で登録されている。現状のままで動作中。
  ファイル名を直すと**逆に壊れる**ので、直すなら Stripe 側のURLも同時に変更すること。
- **404 が並んでいる / 配信履歴が無い** → webhook は動いていない。
  ファイル名を ASCII の `stripe-webhook.js` に直す必要がある。

**判断がつかなかったので、今回の移植ではファイル名を変えていない。**
中身の修正だけを既存のファイル名に適用してある。リネームは1コマンドの後追い作業:

```bash
git mv "api/stripe‐webhook.js" api/stripe-webhook.js
```

## Stripe のイベント送信設定

修正4はコードを入れるだけでは発火しない。ダッシュボードの webhook エンドポイントで
**`customer.subscription.updated` と `invoice.payment_failed` が送信対象**になっているか
確認すること。あわせて `RESEND_API_KEY` / `MAIL_FROM` が Vercel の環境変数にあるか
（支払い失敗メールで使う）。

---

# 各修正の中身

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

`v5.html` と `demo.html` は本体約2200行が重複しているため、**両方に入れてある**。

## 4. Stripe サブスク対応（`api/stripe‐webhook.js`）

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

`import { getRedis } from '../lib/redis.js'` は、`api/` の1つ上が `lib/` という関係が
両リポジトリで同じなので**書き換え不要**だった。

## 5. `v5.html` のゲート画面に導線を追加

**問題:** コードを持たない人がゲート画面で行き止まりになっていた。

**修正:** 入力欄の下に区切り線と「アクセスコードをお持ちでない方へ」を置き、
`demo.html`（体験版）と Stripe 購入ページ（`https://buy.stripe.com/9B6cN45Q7aGg51B1ZecAo00`）
への2本のリンクを追加。**購入 URL が今も正しいか確認すること。**

---

# 移植しなかったもの

- **`index.html`**。元コミット `c01b6e5` は `index.html` も変えているが、それは `-` 側の
  リダイレクト先修正（`yakitori_order.html` → `demo.html`）。
  **本番の `index.html` はLPで別物なので除外した。**
- **`verify-code.js` の `source: 'repo:-'`**（コミット `4b43605`）。これは「本番がどちらの
  リポジトリで動いているか」を判別するためにこちらに付けた目印で、本番に入れると逆に嘘になる。
- **`api/stripe‐webhook.js` のリネーム**。上記「要判断」の通り、Stripe 側の設定を
  確認しないと直すべきか壊すべきでないかが決まらないため見送った。

# デプロイ後の動作確認

本番稼働中のサービスなので、最低限これだけは見ること。

1. **`v5.html`**: 有効なコードで入れる／機内モードにしても7日以内なら開く／
   `yakitori_access_verified_at` を8日前に書き換えるとゲートに戻る。
2. **`demo.html`**: デモで店舗名や残数をいじった後、`v5.html` の本番データが**無傷**なこと。
   DevTools の Application → Local Storage で `demo_` 付きのキーだけが増えているか。
   **既存のデモ利用者の入力は引き継がれない**（キーが変わるため）。これは意図した動作。
3. **OCR**: 記録用紙を1品目わざと塗りつぶして撮影し、**その品目だけが空欄**で
   他がズレていないこと。「◯品目中◯品目を読み取りました」の表示が出ること。
4. **`print.html`**: デモから開くと `?demo=1` が付き、「← デモに戻る」になること。
5. **Stripe**: テストモードでサブスクを `past_due` にして**アクセスが残る**こと、
   `canceled` にして**失効する**こと。

# 本番側に残っている既知の問題（今回の5件には含まれない）

実機の本番コードを見て確認したもの:

- **`manual.html` の「アプリを開く」が `document.referrer` 依存。** referrer が空だと
  デモ利用者が `v5.html`（ゲート）に飛ばされる。`print.html` と同じ `?demo=1` 方式で直せる。
- **`verify-code` にレート制限が無い。** 1コードで台数無制限。
- **Redis のレコードに TTL が無い。** 解約済みのメールアドレスが永久に残る。
- **`lib/redis.js` にエラーハンドラが無い。**

なお、本番には旧版ファイル（`yakitori_order.html`, `v2〜v4.html`）は**存在しなかった**ので、
`-` 側で問題になっていた「旧版直打ちで認証を素通り」は本番では起きない。
`sw.js` も無いので Service Worker 関連の問題も無い。
