# Media（前端）

## Purpose

Avatar、STT、TTS、viseme、音訊時間點與媒體授權 metadata。

## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：前端；default owner：前端開發團隊；視覺：視覺設計團隊
- 可依賴的模組：platform
- Figma：Figma:Project/Socratic.Socratic · Frontend.07 Media Adapters.模組卡

檔案範圍：
- `frontend/src/features/avatar/`
- `frontend/src/features/conversation-room/avatar/`
- `frontend/src/features/conversation-room/voice/`
- `frontend/src/shared/input/`
- `frontend/src/types/speech-recognition.d.ts`
- `frontend/src/types/talkinghead.d.ts`

契約：
- TTS（文字→音訊＋字時間點）（等後端契約）
- 人像模型清單（/avatar-packs/catalog.json）（✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- TTS／STT 後端契約（後端開發團隊）：TTS 回音訊＋字的時間點，人像改用音訊時間軸。
- TalkingHead 已不再使用：移除 types/talkinghead.d.ts、@met4citizen/talkinghead 依賴、public/avatars/ce-brunette 與 build 時下載（deploy/stage 由 Platform owner 審）。
- 學生端每個輸入框都要有按住說話。
- 人像授權小字與狀態膠囊重疊；手機 debug 選單蓋到標題。
<!-- module-map:end -->

## Public contract

- Avatar pack catalog（`/avatar-packs/catalog.json`；每個 pack 可帶 `camera_preset: {zoom, lift, framing}` 微調上半身取景：zoom 是推近倍數（取景上緣固定、從下方裁，頭頂不出框），範圍 0.5–3；lift 是鏡頭與注視點一起上移、單位為通用取景可見高度、範圍 ±0.5；超出範圍時 pack 載入失敗，改顯示文字 fallback）
- speech transcript draft
- TTS audio/word timing
- viseme timeline and license metadata

## Toy page

本模組使用既有`frontend/src/features/dev-console/`註冊fixture與操作面板。Toy page與production frontend共用generated client、ViewModel與reason codes。

## Acceptance package

- API contract與generated types同步。
- Toy page完成happy path、typed error、permission、retry／idempotency與boundary fixtures。
- Backend module tests與Frontend adapter tests各自通過。
- Default owner review receipt成立。
- Compatibility ledger同步更新。
- Source、caller、generated artifacts與handoff文件形成同一successor。

## First metabolism

1. 把目前文字估算嘴型替換為可選 audio/word-timing adapter。
2. toy page 可載入 catalog、切模型、播放 speech fixture、顯示 viseme timeline。
3. Socratic 與 CE 共享 contract，各自保留產品授權與 presentation。

## Scope rules

- Current custody內的變更由default owner review。
- 跨模組修改依每個module path分開review。
- Composition files只放注入與接線。
- Shared contract改動同步重產Frontend types。
- 交接使用[HANDOFF-TEMPLATE.md](../HANDOFF-TEMPLATE.md)。

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

- 端：前端；default owner：前端開發團隊；視覺：視覺設計團隊
- 可依賴的模組：platform
- Figma：Figma:Project/Socratic.Socratic · Frontend.07 Media Adapters.模組卡

檔案範圍：
- `frontend/src/features/avatar/`
- `frontend/src/features/conversation-room/avatar/`
- `frontend/src/features/conversation-room/voice/`
- `frontend/src/shared/input/`
- `frontend/src/types/speech-recognition.d.ts`
- `frontend/src/types/talkinghead.d.ts`

契約：
- TTS（文字→音訊＋字時間點）（等契約）
- 人像模型清單（/avatar-packs/catalog.json）（✅）

## 待清違規（scripts/check_modules.py 讀出；修好後從 violations.json 刪掉那一行）

- 無

## 待清項（源頭修正，做完從這裡刪掉）

- TTS／STT 後端契約（後端開發團隊）：TTS 回音訊＋字的時間點，人像改用音訊時間軸。
- TalkingHead 已不再使用：移除 types/talkinghead.d.ts、@met4citizen/talkinghead 依賴、public/avatars/ce-brunette 與 build 時下載（deploy/stage 由 Platform owner 審）。
- 學生端每個輸入框都要有按住說話。
- 人像授權小字與狀態膠囊重疊；手機 debug 選單蓋到標題。
<!-- module-map:end -->
