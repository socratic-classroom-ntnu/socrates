---
description: 前端共用元件（frontend/src/ui）的使用規範：按鈕、連結按鈕、圖示按鈕、表單欄位、錯誤訊息、狀態標籤、篩選 chip、複製鈕、QR
globs: frontend/src/**/*.tsx
keywords: [Button, ButtonLink, IconButton, Field, FormError, StatusPill, Chip, ChipGroup, CopyButton, QrCode, className, CSS Modules]
---

# 前端共用元件（`frontend/src/ui`）

課程頁共用的控制項都在 `frontend/src/ui/`，樣式是各元件自己的 CSS Modules。**一律從 `frontend/src/ui` 的 index import**，不要直接 import 元件檔。

## 有哪些元件

| 元件 | 用途 | props 重點 |
|---|---|---|
| `Button` | 動作按鈕 | `variant`：`primary`、`outline`、`quiet`、`dark`、`danger`；`type` 預設 `button`，送出表單要寫 `type="submit"` |
| `ButtonLink` | 長得像按鈕的導頁連結 | `variant` 同 `Button`；其餘是 react-router 的 `Link` props |
| `IconButton` | 只有圖示的按鈕 | `label` 會變成 `aria-label`（必填）；`tone`：`default`、`quiet`；圖示本身加 `aria-hidden` |
| `Field` | 欄位外框與標題 | `id` 要等於控制項的 `id`；`required` 顯示星號，`requiredText` 給螢幕報讀念「必填」；`invalid` 讓框線變紅 |
| `FieldHint` | 欄位下方的說明 | 一般的 `<p>` props；要被 `aria-describedby` 指到就給 `id` |
| `FieldError` | 欄位下方的錯誤 | 同 `FieldHint` |
| `RequiredMark` | 單獨的必填星號 | 放在 `Field` 以外的標題，例如 `<legend>` |
| `FormError` | 整張表單或整頁的錯誤 | 一般的 `<p>` props，通常加 `role="alert"` |
| `StatusPill` | 狀態標籤 | `tone`：`open`、`scheduled`、`draft`、`ended`、`quiet` |
| `Chip` | 可切換的篩選 chip | `pressed`（會變成 `aria-pressed`） |
| `ChipGroup` | 一排 chip | `label` 是這組的名稱（`role="group"`） |
| `CopyButton` | 複製文字並顯示結果 | `text`、`label`；`iconOnly` 時用 `tone`，有文字時用 `variant`；`unstyled` 只套頁面的 `className` |
| `QrCode` | 網址的 QR 圖 | `value`、`alt`、`size` |

## 什麼情境用哪個

- 導頁用 `ButtonLink`，不要寫 `<Button onClick={() => navigate(…)}>`。
- 欄位一律包 `Field`。說明和錯誤用 `FieldHint`、`FieldError` 放進 children，先後照該頁的設計，各給一個 id；控制項寫 `aria-describedby={describedBy(error && '<id>-error', '<id>-hint')}`，只接畫面上有出現的，順序跟畫面一樣。例：`frontend/src/features/course/teach/editor/QuestionForm.tsx` 的情境敘述。
- 狀態轉換按鈕（開始、結束、刪除…）仍然只依後端的 `available_actions` 顯示，見 `frontend/src/features/solo-activity/SoloDialoguePage.tsx`；這些元件只管外觀。
- 只收 class 字串的舊元件（例如 `Menu` 的 `triggerClassName`）用 `iconButtonClass()`，不要寫死 class 名稱。

## 頁面要改外觀

- 傳頁面自己的 `className`，在頁面的樣式表寫規則。顏色用 `--ui-color-*` token，不寫色碼；尺寸、間距在還沒有尺寸 token 之前可以直接寫數值。
- 元件的 class 名稱是雜湊過的，頁面樣式表**不能**用 `.button`、`.form-field` 這類名稱選元件。要選元件裡的元素，就給元件一個頁面 class，例如 `.join-sheet .join-field input`。
- 元件樣式現在還沒進 `@layer`：頁面規則蓋得過元件，靠的是元件樣式先載入（`frontend/src/app/routes.tsx` 在所有課程頁之前 `import '../ui'`）。**不要移動那一行**，`frontend/src/app/styleOrder.test.ts` 會擋。

## 不要做的事

- 在 TSX 寫 `button button--primary`、`form-field`、`status-pill` 這類全域 class。`styleOrder.test.ts` 的 `no global ui.css classes in TSX` 會擋。
- 新增全域樣式表或全域選擇器。新樣式優先寫成 `*.module.css`；真的要全域，`styleOrder.test.ts` 會紅，照失敗訊息登記，review 時會被看到。
