# ADR-ROOM-003 — Voice and text converge at messages

## Decision

Voice recognition produces an editable transcript draft. Confirmed text is submitted through the existing message endpoint.

## Consequence

Orchestration, persistence and retry semantics remain identical for text and voice input.
