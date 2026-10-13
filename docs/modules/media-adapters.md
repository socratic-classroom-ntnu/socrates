# Media Adapters

## Purpose

Avatar、STT、TTS、viseme、音訊時間點與媒體授權 metadata。

## Ownership

| Role | Seat |
|---|---|
| Backend default owner | `Portal-Goose` |
| Frontend default implementation owner | `Portal-Heron` |
| Visual owner | `Design-Goose` |
| Partitioning／acceptance PO | `PO-Goose` |

<!-- module-map:begin -->
## Scope（由 docs/modules/modules.json 產生；邊界 ✅）

後端（default owner：Portal-Goose）：
- —

前端（default owner：Portal-Heron；視覺 Design-Goose）：
- `frontend/src/features/avatar/`
- `frontend/src/features/conversation-room/avatar/`
- `frontend/src/features/conversation-room/voice/`
- `frontend/src/shared/input/`
- `frontend/src/types/speech-recognition.d.ts`
- `frontend/src/types/talkinghead.d.ts`

## 待清項（源頭修正，做完從這裡刪掉）

- TTS／STT 後端契約（Portal-Goose）：TTS 回音訊＋字的時間點，人像改用音訊時間軸。
- TalkingHead 已不再使用：移除 types/talkinghead.d.ts、@met4citizen/talkinghead 依賴、public/avatars/ce-brunette 與 build 時下載（deploy/stage 由 Platform owner 審）。
- 學生端每個輸入框都要有按住說話（PO-Heron c30r2-G6）。
<!-- module-map:end -->

## Public contract

- Avatar pack catalog
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
- 交接使用[HANDOFF-TEMPLATE.md](./HANDOFF-TEMPLATE.md)。
