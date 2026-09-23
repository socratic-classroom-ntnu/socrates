# CE portrait conversation room

React + TypeScript own the presentation layer. Rsbuild owns development and production bundling. Jest + SWC preserve the test suite independently of the previous toolchain. FastAPI, OpenAPI and PostgreSQL retain the existing product contract.

The center is an upper-body 3D portrait. The active tutor reply is a floating bubble; the full transcript is in the right collapsible drawer. The left collapsible drawer is session history. The top-right hamburger opens navigation. Both desktop drawers have independent state; narrow viewports present one drawer at a time. Escape returns focus to the menu entry.

Speech input remains a browser capability. Text submission and state transitions remain owned by the backend. Audio / viseme synchronization is a later Portal-Goose presentation adapter: utterance identity, audio clock and optional cue track. This version displays visual presence and idle portrait motion.

Existing two-container stage deployment remains frontend Nginx + backend FastAPI, with external PostgreSQL and host cloudflared. Local presentation uses the built frontend with the existing API backend; it preserves database and session custody.
