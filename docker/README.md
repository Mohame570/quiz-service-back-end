# Docker notes

## Services

| Service | Host port | Purpose |
|---|---|---|
| `postgres` | `5433` (default) | PostgreSQL 16 |
| `mailhog` | `1025` (SMTP), `8025` (UI) | Dev email capture |
| `api` | `3002` (default) | NestJS API (migrations on start) |

## API container startup

`docker/entrypoint.sh`:

1. `npx prisma migrate deploy`
2. `node dist/main.js`

The Dockerfile runs this via `/bin/sh docker/entrypoint.sh` (not PowerShell).

## Windows contributors

You **do not** execute `entrypoint.sh` on Windows directly. Docker Desktop runs it inside the Linux `api` container.

If you see `no such file or directory` or `^M` errors when building:

1. Ensure Git checked out LF endings: `git add --renormalize docker/entrypoint.sh`
2. Rebuild: `docker compose build --no-cache api`
3. Use Docker Desktop with **WSL2** backend (recommended)

PowerShell alternative for live smoke tests:

```powershell
.\scripts\run-live-tests.ps1
```

## Common commands

```bash
docker compose up -d --build          # start all services
docker compose logs -f api            # follow API logs
docker compose down                   # stop services
docker compose down -v                # stop + delete DB volume
```
