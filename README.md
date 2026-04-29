# Tribe

Tribe is a developer workflow management tool for running tickets through a structured lifecycle, with built-in support for AI-driven execution and Monday.com synchronization.

It provides:
- A centralized ticket board with phases, statuses, and project grouping
- Automated phase handling for ticket progression
- MCP tools for agent/CLI automation
- REST APIs for web clients and integrations
- WebSocket events for real-time UI updates

## Core Capabilities

- **Ticket lifecycle management**
  - Create, update, move, and track tickets across workflow phases
  - Enforce ticket readiness rules (`DRAFT`, `READY`, etc.)
- **Phase orchestration**
  - Trigger phase transitions and execute phase-specific handlers
  - Maintain complete phase history per ticket
- **Project and slot management**
  - Group tickets by project
  - Assign or inspect workspace slots for parallel execution
- **Monday.com integration**
  - Import Monday items into local tickets
  - Fetch not-started items and map them into structured markdown
- **Agent-friendly automation**
  - MCP server exposes tools for tickets, phases, slots, projects, and Monday flows
- **Realtime updates**
  - WebSocket broadcast channel for event-driven UI refresh

## Architecture (High Level)

Tribe runs as a TypeScript Node.js application that hosts both API layers and serves the frontend build.

- **Backend services**
  - Express app with:
    - `/api/*` REST endpoints for app operations
    - `/mcp` endpoints for Model Context Protocol tools
  - WebSocket endpoint at `/ws` for push events
- **Data layer**
  - TypeORM repositories/entities
  - MySQL database with migrations
- **Frontend**
  - React + Vite single-page app (served as static files in production)
- **Integrations**
  - Monday.com API helper + mapping utilities
  - CLI/agent adapters for orchestration flows

Typical runtime flow:
1. A ticket is created/imported and stored in MySQL.
2. Phase logic updates state and triggers handlers.
3. State changes emit events to WebSocket clients.
4. MCP tools and REST endpoints expose control surfaces for automation and UI.

## Tech Stack

### Backend
- Node.js
- TypeScript
- Express
- `@modelcontextprotocol/sdk`
- WebSocket (`ws`)
- Multer (uploads)

### Database
- MySQL
- TypeORM

### Frontend
- React 19
- TypeScript
- Vite
- `react-markdown` + `remark-gfm`

### Tooling
- `ts-node`
- `tsconfig-paths`
- `concurrently`
- `dotenv`

## Project Structure

```text
src/
  agent/           # agent orchestration classes
  cli/             # CLI adapter layer
  entity/          # TypeORM entities
  handler/         # phase handlers and workflow logic
  mcp/             # MCP server bootstrap and tools
  monday/          # Monday.com integration helpers
  migration/       # DB migrations
  repository/      # data access repositories
  routes/          # REST route handlers
  ws/              # WebSocket server
client/
  src/             # React app
```

## Quick Start

### 1) Prerequisites

- Node.js (LTS recommended)
- npm
- MySQL server

### 2) Install dependencies

```bash
npm install
npm run client:install
```

### 3) Configure environment

Create a `.env` file in the project root (example values):

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=
DB_DATABASE=tribe

# API, MCP, and frontend integration
MCP_PORT=8100

# Optional Monday integration. Leave token blank to disable Monday-backed flows.
MONDAY_ACCESS_TOKEN=
MONDAY_API_URL=https://api.monday.com/v2
MONDAY_DEFAULT_BOARD_IDS=
EWEBINAR_DEV_PEOPLE=
EWEBINAR_DEFAULT_PERSON_ID=
```

Environment contract:

| Variable | Required | Purpose |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | Yes | MySQL connection used by TypeORM |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME` | No | Legacy aliases recognized by TypeORM config when DB vars are unset |
| `MCP_PORT` | Yes | Backend REST/MCP/WebSocket port; defaults to `8100` when unset |
| `MONDAY_ACCESS_TOKEN` | No | Enables Monday import and eWebinar hooks when present |
| `MONDAY_API_URL` | No | Monday GraphQL endpoint; defaults to `https://api.monday.com/v2` |
| `MONDAY_DEFAULT_BOARD_IDS` | No | Comma-separated Monday board IDs for default eWebinar setup |
| `EWEBINAR_DEV_PEOPLE` | No | Comma-separated Monday people IDs/names used by eWebinar flows |
| `EWEBINAR_DEFAULT_PERSON_ID` | No | Default Monday person ID assigned during eWebinar project seeding |

CLI expectations:

- Tribe orchestrates external coding CLIs through adapters in `src/cli`; configure those CLIs outside this repo.
- `ClaudeAdapter` is a supported CLI integration name, not a dependency on any external documentation kit.
- MCP clients should connect to `http://localhost:${MCP_PORT}/mcp`; web clients receive realtime updates on `/ws`.

### 4) Run migrations

```bash
npm run migration:run
```

### 5) Start in development

```bash
npm run dev
```

This starts:
- Backend MCP/API server on `http://localhost:8100`
- Frontend Vite dev server on `http://localhost:8200`

### 6) Build for production

```bash
npm run build:all
```

### 7) Start production server

```bash
npm run start
```

## Useful Scripts

- `npm run dev` - Run backend + frontend concurrently
- `npm run mcp:dev` - Run backend MCP/API server in TypeScript mode
- `npm run client:dev` - Run frontend dev server only
- `npm run build` - Build backend
- `npm run client:build` - Build frontend
- `npm run build:all` - Build backend and frontend
- `npm run migration:run` - Apply TypeORM migrations

## API Surfaces

- **REST API base:** `/api`
  - Tickets: `/api/tickets`
  - Phases: `/api/phases`
  - Projects: `/api/projects`
  - Slots: `/api/slots`
  - Uploads/Files: `/api/uploads`, `/api/tickets/:ticketId/files`
- **MCP endpoint:** `/mcp`
- **WebSocket endpoint:** `/ws`

## Notes

- Database synchronization is disabled (`synchronize: false`), so migrations should be used for schema changes.
- Monday.com features require valid Monday credentials in environment variables.
- Third-party or vendor reference packs are intentionally not part of the Tribe source contract; keep them outside the runtime tree with an owner and retrieval path.
