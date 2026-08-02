# Chrome ウェブストア 提出用メモ

アップロードするファイル: `dist/ultimate-web-redactor.zip`
スクリーンショット: `promo/shots/screenshot-1..4.png` (1280x800)
小タイル: `promo/shots/promo-tile-440x280.png` (440x280)

---

## Store listing (English)

**Name**
```
Ultimate Web Redactor
```

**Summary** (132字以内 / 実際 105字)
```
Blur, pixelate or black out anything on a page, and put a red box around what matters. Just drag over it.
```

**Description**
```
Screenshots leak more than you think. An email column, an API key, a customer name, an invoice number — all of it sits right there in the frame.

Ultimate Web Redactor lets you cover any part of a page before you capture it, and draw a red box around the part you actually want people to look at. Everything happens locally in your browser. Nothing is uploaded anywhere.

FOUR WAYS TO TREAT A REGION
• Pixelate — real block mosaic, block size adjustable from 3 to 40 px
• Blur — radius adjustable from 1 to 40 px
• Black out — a solid fill, nothing left to recover
• Red box — an outline that does not shift the layout, with adjustable width, padding, corner radius and colour

THREE WAYS TO PICK WHAT TO COVER
• Drag a box (Alt+Shift+R) — drag over anything at all. Boxes sit at fixed window coordinates, so scrolling never moves them, and you can draw as many as you like in a row.
• Select text and use the right-click menu, or Alt+Shift+M to hide it and Alt+Shift+F to box it in red.
• Pick an element (Alt+Shift+K) — for images, avatars and table rows that you cannot select as text. Arrow keys walk up and down the tree.

Click anything you applied to remove it. "Undo everything" clears the page in one go. If you would rather not remove things by accident, there is a lock switch.

PERMISSIONS
No host permissions. The extension asks for nothing until you invoke it, and then it only touches the tab you are looking at. Your settings are stored locally. There is no analytics, no account, no network request of any kind.

A NOTE ON SAFETY
Pixelation and blur can sometimes be reversed by an attacker who knows what they are doing. When something really must not get out, use black out.

Open source: https://github.com/satomasahiro2005/ultimate-web-redactor
```

**Category**: Privacy & Security
**Language**: English

---

## ストアの掲載情報（日本語）

**名前**
```
Ultimate Web Redactor
```

**概要**
```
ページの好きなところをモザイク・ぼかし・黒塗りで隠し、赤枠で目立たせる。ドラッグで囲むだけ。
```

**説明**
```
スクリーンショットには思ったより余計なものが写ります。メールアドレスの列、APIキー、取引先の名前、請求番号。撮ったあとで気づくと撮り直しです。

Ultimate Web Redactor は、撮る前にページの好きなところを覆い、逆に見せたいところを赤枠で囲むための拡張機能です。処理はすべてブラウザの中で完結し、どこにも送信しません。

4つのモード
・モザイク ― 本物のブロック状。ブロックの一辺を 3〜40px で調整
・ぼかし ― 半径を 1〜40px で調整
・黒塗り ― 塗り潰し。復元の余地なし
・赤枠 ― レイアウトを動かさない枠。太さ・余白・角丸・色を調整

範囲の指定は3通り
・矩形（Alt+Shift+R）― ドラッグで囲むだけ。ウィンドウ基準の固定座標なので、スクロールしても位置が動きません。続けて何個でも引けます。
・選択範囲 ― テキストを選んで右クリック、または Alt+Shift+M で隠す / Alt+Shift+F で赤枠。
・要素ピッカー（Alt+Shift+K）― 画像やアバター、表の1行など、テキストとして選べないもの用。↑↓ で親子をたどれます。

加工した部分はクリックすると消えます。「すべて解除」でページごと元に戻ります。うっかり消したくないときはロックを入れてください。

権限について
ホスト権限はありません。呼び出されるまで何もせず、呼ばれたときに開いているタブだけを触ります。設定はローカル保存で、解析も、アカウントも、通信も一切ありません。

注意
モザイクとぼかしは、条件次第で元の内容を推測されることがあります。絶対に出せないものには黒塗りを使ってください。

ソースコード: https://github.com/satomasahiro2005/ultimate-web-redactor
```

**カテゴリ**: プライバシーとセキュリティ
**言語**: 日本語

---

## プライバシータブの記入内容

**単一用途 (Single purpose)**
```
Visually obscure or highlight parts of the page the user is currently viewing, so that screenshots and screen shares do not reveal sensitive information. All processing is local and visual only.
```

**activeTab の理由**
```
The extension modifies the page the user is currently looking at, and only after the user invokes it from the context menu, a keyboard shortcut, or the toolbar popup. activeTab avoids requesting broad host permissions.
```

**scripting の理由**
```
The content script that draws the mosaic, blur, fill and outline is injected into the active tab on demand at the moment the user invokes the extension. It is not declared as a static content script, so nothing runs on pages the user has not acted on.
```

**contextMenus の理由**
```
Adds right-click entries so the user can hide a text selection or an image, and undo everything on the page.
```

**storage の理由**
```
Stores the user's chosen mode, block size, blur radius, outline width/padding/radius and colour locally so they persist between sessions. No other data is stored.
```

**リモートコード**: 使用しない（すべてパッケージ内のファイル）

**データ利用の申告**: いずれも収集しない。3つのチェックボックスは全部「はい」で通す
- 取り扱いを開示しています
- 承認された用途以外で第三者に販売・譲渡していません
- 承認された用途以外の目的で使用・転送していません

---

## 手順

1. デベロッパー ダッシュボード → 「新しいアイテム」
2. `dist/ultimate-web-redactor.zip` をアップロード
3. 「ストアの掲載情報」に上の名前・概要・説明を貼る
4. スクリーンショットを4枚アップロード（1280x800）、小タイルもアップロード
5. カテゴリ = プライバシーとセキュリティ、言語 = 日本語 + 英語
6. 「プライバシーへの取り組み」に上の理由を貼る
7. 「販売/ 配布」で公開範囲を選ぶ
8. 「審査のために送信」

登録が初めての場合、$5 の登録料の支払いが先に必要です。支払いは代行できないのでご自身でお願いします。
