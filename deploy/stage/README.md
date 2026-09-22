# Socrates stage deployment — two application containers

Deployment source: `stage`.

## Runtime topology

- `frontend`: Nginx + React build; host binding `127.0.0.1:8080`
- `backend`: FastAPI + Alembic; Docker-internal port `8000`
- PostgreSQL: external through `DATABASE_URL`
- cloudflared: host service mapping `socratic.arthur0824hao.com` to `http://127.0.0.1:8080`

`docker compose config --services` returns exactly:

```text
backend
frontend
```

## First deployment from source

```bash
git clone https://github.com/socratic-classroom-ntnu/socrates.git
cd socrates
git switch stage
cp deploy/stage/.env.example deploy/stage/.env
# Edit deploy/stage/.env and set DATABASE_URL.
docker compose --env-file deploy/stage/.env -f deploy/stage/compose.yml up -d --build
curl -fsS http://127.0.0.1:8080/api/health
```

## Update

```bash
./deploy/stage/update.sh
```

## Tunnel route

```yaml
- hostname: socratic.arthur0824hao.com
  service: http://127.0.0.1:8080
```

## CD

- `Stage Release` builds and publishes immutable backend/frontend images after `CI` succeeds on `stage`.
- `Stage Deploy` uses a self-hosted runner labelled `self-hosted`, `linux`, `socrates-stage`.
- Repository secret `SOCRATES_DATABASE_URL` supplies the external PostgreSQL URL.
- The manual pull-and-compose path remains fully supported.
