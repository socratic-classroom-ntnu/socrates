# 單人活動（前端）

學生在課程活動裡逐題跟 AI 導師一對一對話：選立場、對話、確認卡、進度。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：前端；default owner：前端開發團隊；視覺：視覺設計團隊
- 可依賴的模組：platform、contract

檔案範圍：
- `frontend/src/features/solo-activity/`

契約：
- 語音模式（WebSocket /solo/attempts/{id}/voice）（手寫型別（WebSocket 不在 OpenAPI）；取代原本的 TTS 列：Gemini Live 直接出聲、學生開口就停（interrupted），不另做文字→音訊）
- 單人活動（/solo/*）（產生型別 ✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- 無
<!-- module-map:end -->

## 活動結束後（C7）

- 對話頁：活動結束就不顯示輸入框（按鈕本來就只照 `available_actions`，結束後是 `[]`），改在對話下方說明「這個活動已經結束，不能再回答」。開著頁面時，到了 `ends_at` 會重新讀活動與作答；送出被 409 `ACTIVITY_ENDED` 拒絕時也一樣重新讀，不跳錯誤。打到一半的字留在草稿裡。
- 活動頁：已開始的作答在活動結束後，按鈕從「繼續對話」改成「查看紀錄」。
