# ADR-ROOM-005 — One avatar presence adapter

## Decision

`TutorPresenceAdapter` emits exactly one of `idle`, `listening`, `thinking`, `speaking`. Avatar renderers consume this projection only.
