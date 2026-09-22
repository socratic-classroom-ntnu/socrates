# CE-style Conversation Room

## Goal

將現有 `Conversation` 單欄頁面提升為模組化聊天室，同時保留後端狀態機、`Orchestrator`、`TutorGateway` 與 `SessionView` 的 authoritative boundary。

## Desktop composition

```text
RoomTopBar
├── HistoryRail
└── Workspace
    ├── AvatarStage (`brunette`)
    ├── MessageTimeline
    └── InputComposer
        ├── TextInputAdapter
        └── VoiceInputAdapter
```

## Mobile composition

```text
RoomTopBar → HistoryDrawer → compact AvatarStage → MessageTimeline → sticky InputComposer
```

## State ownership

- Backend owns session state, available actions, message order and stage progression.
- Browser voice capture owns transient listening/transcribing state.
- `TutorPresenceAdapter` combines backend tutor state and browser input state into one avatar projection.
- Text and voice converge on the existing `POST /api/sessions/{id}/messages` path.

## Acceptance markers

```text
.conversation-room
.history-rail
.avatar-stage
[data-avatar-id="brunette"]
[data-avatar-state]
.message-timeline
.input-composer
[data-room-revision="ce-room-v1"]
```
