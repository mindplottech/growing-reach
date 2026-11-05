# あーちゃんが やる！ — Growing Reach

0歳9か月〜5歳の子の体（身長・立って届く高さ・登れる高さ・肘の高さ）を台帳の値から計算し、家の中で「自分でできる／この助けがあればできる（踏み台○cm・段を下げる・縁に寄せる）／まだ」を出す。3D の家であーちゃん（台帳の中央値の子）が助けを使うところを見せる。9か月〜1歳4か月はつかまり立ちのころ（はいはい・登らない）。
GitHub Pages（main ブランチのルート）で動く静的サイト。対象はPCブラウザ（最小幅1280px）。

## 設計方針

- 体の値はすべて `data/values_ledger.json` から読む。コードに数値を直接書かない。
- 月齢ごとの値は、JSONの点の間を直線補間する。
- 「できるか（登れる・届く・降りられる）」は体の値と物の高さ・位置から計算する。「やるか（どこへ行くか、どれだけいるか）」だけがランダム。
- 乱数はシードを指定でき、同じシードなら同じ結果になる。
- 作品の中でAI・APIは使わない。安全の助言や説明文を生成しない。
- `data/values_ledger.json` は外部から持ち込んだデータ。出典は JSON の中にある。
- `data/room_layout.json` は設計者が置いた配置で、根拠となる実測はない（仮値）。高さは台帳を指す。
- 台帳にない値はすべて `sim/params.js` に置き、仮値の区分と決め方を付ける。`params.js` は台帳を読む入口で、体の値は書かない。

## 実装上の決まり

- 計算部分は依存なし。表示だけ Three.js を使う（CDN から ES Modules で読み込む）。ビルドしない。
- アイコンは Lucide の SVG を assets/icons/ にコピーして使う（実行時に CDN を使わない）。ライセンスは同じフォルダの LICENSE。
- メイン画面には根拠・仮値の表示を出さない。根拠はヘッダーの「根拠を見る」で台帳をそのまま表示する。
- 計算は `sim/`（DOM も Three.js も使わず、ブラウザと Node の両方で動く）、表示は `render/` に置く。
- 台帳は引数で渡す（読み込むのは画面側の `render/main.js` だけ）。
- 台帳の式は文字列のまま読み取る。想定の形でなければ黙って続けず例外にする。
- 値の区分は台帳の `category` に従い、より確かな区分に格上げしない。

## コミットの手順

- コミットの前に毎回 `npm test` を実行し、すべて通ったときだけコミットする。失敗したら止めて見せる。
- コミットのたびに `git push` する。
- ファイルのパスは相対パス（`./data/...`）で書く。GitHub Pages では `/growing-reach/` の下に置かれるため。

## 決まりを守る仕組み（Claude Code）

- `.claude/settings.json` の hooks：`git commit` の前に `npm test` と台帳の検証を走らせ、通らなければコミットを止める。台帳か sim/・render/ を書き換えた直後にも台帳を検証する。
- `scripts/check-ledger.mjs`（`npm run check:ledger`）：4区分・出典の登録・格上げなし・式の係数をコードに書いていないか。
- `scripts/render-check.sh`：3D を実際に描いて .cache/shots/ に画像を保存する。見た目を変えたら画像を開いて確かめる。
- skills（`.claude/skills/`）：ledger-update（台帳に値を足す）、render-check（3D を描いて確かめる）、dev-log-entry（dev-log に1節書く）。

## コマンド

- テスト: `npm test`
- ローカル表示: `npm start`（`fetch` を使うので `file://` では動かない）
- 台帳の検証: `npm run check:ledger`
- 3D を描いて確かめる: `bash scripts/render-check.sh`
