# ADR-ROOM-001 — Orchestrator remains authoritative

## Decision

Conversation Room consumes backend projections. It does not duplicate stage progression or `available_actions` logic in React.

## Consequence

Visual redesign, voice capture and avatar rendering remain replaceable without creating a second state machine.
