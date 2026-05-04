# Operations Guide

This guide is the local runbook for getting Tribe from a fresh checkout to a working developer instance. It covers startup, migrations, verification commands, optional integrations, generated files, and the common failures that usually block local work.

## Local Startup

### Prerequisites

- Node.js LTS and npm
- MySQL running locally or reachable over the network
- External coding CLIs configured outside this repo if you plan to run agent phases

### Fresh Checkout Flow

Run all commands from the repo root, `tribe/`.

```bash
npm install
npm run client:install
cp .env.example .env
npm run migration:run
npm run dev
```

Open the frontend at `http://localhost:8200`. The backend listens on `http://localhost:8100` by default and exposes REST under `/api`, MCP under `/mcp`, and WebSocket updates under `/ws`.

### Backend Only

```bash
npm run mcp:dev
```

Use this when debugging REST, MCP, WebSocket, migrations, integrations, or server logs without running Vite.

### Frontend Only

```bash
npm run client:dev
```

Use this when the backend is already running on `8100`. Vite proxies `/api`, `/mcp`, and `/ws` to `http://localhost:8100`.

## Migrations

Tribe uses TypeORM migrations against MySQL. Apply migrations before starting the app after a fresh checkout or after pulling schema changes.

```bash
npm run migration:run
```

The migration command reads the same root `.env` database settings as the backend. If it fails, verify that MySQL is reachable, the database exists, and the configured user can create and alter tables.

For a local default database:

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS tribe;"
```

## Build, Test, Check

These commands are defined in `package.json` and are the verification contract for local development.

| Command | Scope | When to use |
|---|---|---|
| `npm run build` | backend TypeScript | Backend type/build validation |
| `npm run client:build` | frontend TypeScript + Vite | Frontend type/build validation |
| `npm run build:all` | backend + frontend | Production build confidence |
| `npm run check:build` | backend + frontend | Alias for build verification |
| `npm run test` | backend Node test files | Backend unit/regression tests |
| `npm run check` | build + tests | Full local health check |

Production startup uses built output:

```bash
npm run build:all
npm run start
```

## Ports

| Service | Default | Configured by | Notes |
|---|---:|---|---|
| Backend REST/MCP/WebSocket | `8100` | `MCP_PORT` | Frontend dev proxy expects `8100` |
| Frontend Vite dev server | `8200` | `client/package.json` | Open `http://localhost:8200` |
| Frontend Vite preview | `8201` | `client/package.json` | Used only for previewing built client assets |
| MySQL | `3306` | `DB_PORT` or `DATABASE_PORT` | Required for backend and migrations |

If you change `MCP_PORT`, also update the frontend proxy target in `client/vite.config.ts` or run the frontend against the default backend port.

## Environment Variables

Create `.env` in the `tribe/` root. Do not commit real tokens or local database passwords.

### Required for Local App Use

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DB_HOST` | Yes | `localhost` | MySQL host |
| `DB_PORT` | Yes | `3306` | MySQL port |
| `DB_USERNAME` | Yes | `root` | MySQL user |
| `DB_PASSWORD` | Yes | empty | MySQL password |
| `DB_DATABASE` | Yes | `tribe` | MySQL database name |
| `MCP_PORT` | Yes | `8100` | Backend REST/MCP/WebSocket port |

`DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, and `DATABASE_NAME` are optional legacy aliases used only when the matching `DB_*` variable is unset.

### Optional Integrations

| Variable | Required | Disabled when | Purpose |
|---|---|---|---|
| `MONDAY_ACCESS_TOKEN` | No | blank or missing | Enables Monday-backed import and eWebinar flows |
| `MONDAY_API_URL` | No | unset uses default | Monday GraphQL endpoint; defaults to `https://api.monday.com/v2` |
| `MONDAY_DEFAULT_BOARD_IDS` | No | blank or missing | Default comma-separated board IDs for eWebinar flows |
| `EWEBINAR_DEV_PEOPLE` | No | blank or missing | Monday people filter for eWebinar reporting/import flows |
| `EWEBINAR_DEFAULT_PERSON_ID` | No | blank or missing | Default Monday assignee for eWebinar project seeding |
| `DISCORD_BOT_TOKEN` | No | blank or missing | Fallback Discord bot token when app settings are blank |
| `DISCORD_ASSISTANT_THREAD_ID` | No | blank or missing | Fallback Discord thread/channel ID when app settings are blank |
| `DISCORD_COMMAND_PREFIX` | No | unset uses `!tribe` | Prefix for Discord commands |
| `DISCORD_ENABLE_MESSAGE_CONTENT_INTENT` | No | unset or `false` | Enables free-text Discord prompts only after portal intent is enabled |
| `ANTHROPIC_API_KEY` | No | blank or missing | Enables assistant-backed operations that call Anthropic |

## Optional Integrations

### Monday

Monday is disabled when `MONDAY_ACCESS_TOKEN` is blank or missing. In that state, local ticket/project workflows still run, but Monday import/reporting flows have no token to call Monday's GraphQL API and will fail or return no Monday-backed data when invoked.

Signals that Monday is disabled:

- `.env` has no `MONDAY_ACCESS_TOKEN` value.
- Monday-specific import/report actions cannot fetch board data.
- eWebinar helper flows have no default board/person context unless the `MONDAY_*` and `EWEBINAR_*` variables are set.

### Discord

Discord assistant sync is disabled unless both a bot token and a thread/channel ID are configured. Saved app settings take precedence over env fallback values; restart the backend after changing Discord settings because the bridge reads configuration during startup.

Signals that Discord is disabled:

- No `DISCORD_BOT_TOKEN` or saved bot token.
- No `DISCORD_ASSISTANT_THREAD_ID` or saved thread/channel ID.
- The backend runs without connecting the Discord bridge.

Security note: this personal-dev deployment stores the Discord token in MySQL as plaintext when saved through app settings. Treat the local DB as sensitive and revoke the bot token in the Discord Developer Portal if exposed.

### Assistant

Assistant API calls are disabled when `ANTHROPIC_API_KEY` is blank or missing. Non-assistant CRUD, ticket, phase, REST, MCP, and WebSocket functionality can still run locally, but assistant actions that require a model provider cannot complete.

Signals that assistant provider access is disabled:

- `.env` has no `ANTHROPIC_API_KEY` value.
- Assistant-backed routes or tools report missing API key errors when invoked.
- Phase logs show assistant startup or execution failures tied to provider credentials.

## Generated Files and Logs

Tribe stores generated local artifacts under your home directory, not inside the repo.

| Path | Contents |
|---|---|
| `~/.tribe/<ticket-uid>/` | Per-ticket workspace artifacts |
| `~/.tribe/<ticket-uid>/logs/` | Phase execution logs |
| `~/.tribe/<ticket-uid>/logs/<phase>.jsonl` | Structured phase log events |
| `~/.tribe/<ticket-uid>/logs/<phase>.stderr.log` | Phase stderr output |
| `~/.tribe/<ticket-uid>/images/` | Images attached to a ticket |
| `~/.tribe/images/` | Global uploaded images |
| `~/.tribe/assistant-images/` | Assistant message image embeds |

The UI and API can tail phase logs through `/api/tickets/:ticketId/files/_logs/:phaseName`. For direct debugging, inspect the matching files under `~/.tribe/<ticket-uid>/logs/`.

## Common Failure Modes

| Symptom | Likely cause | Short fix |
|---|---|---|
| `npm run migration:run` cannot connect | MySQL stopped or wrong DB env | Start MySQL; verify `DB_HOST`, `DB_PORT`, user, and password |
| `Unknown database 'tribe'` | Local DB not created | Run `mysql -u root -e "CREATE DATABASE IF NOT EXISTS tribe;"` |
| Backend starts but UI has no data | Backend not on `8100` or proxy mismatch | Start `npm run mcp:dev`; keep `MCP_PORT=8100` for Vite dev |
| `EADDRINUSE` on `8100` or `8200` | Port already occupied | Stop the other process or change the backend/frontend port consistently |
| Monday import fails | Missing or invalid `MONDAY_ACCESS_TOKEN` | Leave disabled for local-only work or set a valid token and board IDs |
| Discord startup reports disallowed intents | Message Content Intent not enabled in Discord | Keep `DISCORD_ENABLE_MESSAGE_CONTENT_INTENT=false` or enable the portal intent |
| Discord changes in UI do not reconnect | Backend bridge reads settings at startup | Restart the backend process |
| Assistant actions fail with missing key | `ANTHROPIC_API_KEY` not set | Add the key for assistant work or avoid assistant-backed flows |
| Phase failed but UI summary is insufficient | Need raw phase logs | Inspect `~/.tribe/<ticket-uid>/logs/*.jsonl` and `*.stderr.log` |

## Rollback and Cleanup

Docs changes have no runtime rollback. To clean local generated artifacts for one ticket, delete that ticket UID directory under `~/.tribe/`. To fully reset local generated files, remove only the specific `~/.tribe` paths you understand; they may contain ticket text, logs, and images from active work.
