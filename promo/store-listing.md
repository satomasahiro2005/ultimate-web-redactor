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
Pixelate anything on a page, and put a red box around what matters. Just drag over it.
```

**Description**
```
Screenshots leak more than you think. An email column, an API key, a customer name, an invoice number - all of it sits right there in the frame.

Ultimate Web Redactor covers what should not be seen, and puts a red box around what should. Everything happens locally in your browser. Nothing is uploaded anywhere.

TWO THINGS IT DOES
- Hide: a real block mosaic, with the block size adjustable from 3 to 40 px. Switch it to a blur or a solid fill whenever you prefer.
- Red box: an outline that does not shift the layout, with adjustable width, padding, corner radius and colour.

THREE WAYS TO PICK A REGION
- Drag a box (Ctrl+Shift+E). Drag over anything at all. Boxes sit at fixed window coordinates, so scrolling never moves them, and you can switch between hide and red box from the toolbar without leaving the mode.
- Select text and use the right-click menu, or Ctrl+Shift+Y to hide it and Ctrl+Shift+K to box it in red.
- Pick an element (Ctrl+Shift+L) for images, avatars and table rows that you cannot select as text. Arrow keys walk up and down the tree.

Ctrl+Z takes back the last one. Click anything you applied to remove it. "Undo everything" clears the page in one go. There is a lock switch if you would rather not remove things by accident.

PERMISSIONS
No host permissions. The extension asks for nothing until you invoke it, and then it only touches the tab you are looking at. Your settings are stored locally. There is no analytics, no account, and no network request of any kind.

Open source (MIT): https://github.com/satomasahiro2005/ultimate-web-redactor
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
ページの好きなところをモザイクで隠し、赤枠で目立たせる。ドラッグで囲むだけ。
```

**説明**
```
スクリーンショットには思ったより余計なものが写ります。メールアドレスの列、APIキー、取引先の名前、請求番号。撮ったあとで気づくと撮り直しです。

Ultimate Web Redactor は、見せたくないところを覆い、見せたいところを赤枠で囲むための拡張機能です。処理はすべてブラウザの中で完結し、どこにも送信しません。

やることは2つ
・隠す ― 本物のブロック状のモザイク。ブロックの一辺を 3〜40px で調整できます。ぼかしや黒塗りにも切り替えられます。
・赤枠 ― レイアウトを動かさない枠。太さ・余白・角丸・色を調整できます。

範囲の指定は3通り
・矩形（Ctrl+Shift+E）― ドラッグで囲むだけ。ウィンドウ基準の固定座標なのでスクロールしても動かず、ツールバーから隠すと赤枠を切り替えられます。
・選択範囲 ― テキストを選んで右クリック、または Ctrl+Shift+Y で隠す / Ctrl+Shift+K で赤枠。
・要素ピッカー（Ctrl+Shift+L）― 画像やアバター、表の1行など、テキストとして選べないもの用。↑↓ で親子をたどれます。

Ctrl+Z で直前のひとつを取り消せます。加工した部分はクリックでも消えます。「すべて解除」でページごと元に戻ります。うっかり消したくないときはロックを入れてください。

権限について
ホスト権限はありません。呼び出されるまで何もせず、呼ばれたときに開いているタブだけを触ります。設定はローカル保存で、解析も、アカウントも、通信も一切ありません。

ソースコード（MIT）: https://github.com/satomasahiro2005/ultimate-web-redactor
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
