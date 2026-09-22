# Backend branch topology

```text
develop
└── backend/integration
    └── backend/arthur
```

- `backend/integration` is the backend team's integration branch.
- `backend/arthur` is Arthur's bounded backend and CE-room work branch.
- Changes flow `backend/arthur → backend/integration → develop → main`.
- The repository remains one monorepo: frontend code lives in `frontend/`; backend code lives in `backend/`.
