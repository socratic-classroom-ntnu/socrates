# ADR-ROOM-002 — Add a composition view

## Decision

Add `GET /api/sessions/{id}/room` as a composition endpoint. Existing `SessionDetail` remains available and is embedded in `ConversationRoomView`.

## Consequence

The room can receive avatar, presence and capability metadata while existing clients retain their current contract.
