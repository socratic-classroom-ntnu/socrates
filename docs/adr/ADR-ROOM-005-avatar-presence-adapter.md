# ADR-ROOM-005 — One avatar presence adapter

> 狀態（2026-10-03）：前端 projectPresence 支援 speaking，但 backend room_view 目前只供應 idle／thinking，runtime 不會進入 speaking。現行呈現架構見 [CE Portrait React](../architecture/ce-portrait-react.md)。

## Decision

`TutorPresenceAdapter` emits exactly one of `idle`, `listening`, `thinking`, `speaking`. Avatar renderers consume this projection only.
