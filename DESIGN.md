# Tribe - Design Document

## Overview

Tribe is a developer workflow management tool that runs tickets through a structured lifecycle with AI-assisted execution, Monday.com synchronization, project grouping, workspace slots, and realtime UI updates.

Primary runtime surfaces:

- React/Vite web UI backed by REST APIs under `/api`
- MCP endpoint at `/mcp` for agent and CLI automation
- WebSocket endpoint at `/ws` for realtime ticket, phase, project, and slot updates
- Assistant flows that can propose or apply project and slot changes through policy gates
- Monday.com import and lifecycle hooks for eWebinar workflows
- Discord assistant bridge for thread-based prompts and action sync when configured

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Web server:** Express
- **Frontend:** React 19 + Vite
- **ORM:** TypeORM
- **Database:** MySQL
- **Automation surfaces:** MCP, CLI adapters, assistant workflows, WebSocket events
- **Integrations:** Monday.com, Discord

## Workflow Phases

Every ticket moves through these phases in order. Source of truth: `src/enum/TicketPhase.ts`.

1. **CREATED** - Ticket exists locally, either created directly or imported from Monday.
2. **PLANNING** - Scope, constraints, file ownership, verification, and rollout path are defined.
3. **IMPLEMENTATION** - Assigned CLI or assistant executes the approved plan and writes implementation artifacts.
4. **SHIP** - Completed work is committed, pushed, linked to pull requests, and synchronized back to external systems.
5. **FEEDBACK** - Review or stakeholder feedback is captured for follow-up work.

### Enum: `TicketPhase`

```ts
CREATED
PLANNING
IMPLEMENTATION
SHIP
FEEDBACK
```

## Database Schema

TypeORM entities are the schema source of truth. Migrations apply changes; `synchronize` is disabled.

### `ticket`

The core unit of work and current workflow state.

| Column | Type | Description |
|---|---|---|
| `id` | int (PK) | Auto-increment primary key |
| `title` | varchar(255) | Short work summary |
| `description` | text, nullable | Full ticket body or imported markdown |
| `mondayItemId` | varchar(50), nullable, unique | Linked Monday item identifier |
| `mondayBoardId` | int, nullable | Source Monday board identifier |
| `currentPhase` | enum `TicketPhase` | Current lifecycle phase |
| `status` | enum `TicketStatus` | Ticket readiness/completion state such as `DRAFT` or `READY` |
| `cliType` | enum `CliType` | CLI adapter used for execution, defaulting to Claude |
| `mondayMarkdown` | mediumtext, nullable | Structured Monday import content |
| `branchName` | varchar(255), nullable | Active or shipped branch name |
| `pullRequests` | json, nullable | PR metadata array: repo, URL, commit SHA |
| `slotId` | int, nullable | Workspace slot assigned to ticket |
| `waitingForSlot` | boolean | Whether ticket is queued until a slot opens |
| `uid` | varchar(36), nullable, unique | Stable workspace UUID assigned during setup |
| `projectId` | int, nullable | Project grouping for tickets and slots |
| `isDone` | boolean | Completion marker used by board/workflow views |
| `createdAt` | datetime | Record creation time |
| `updatedAt` | datetime | Last modification time |

### `phase`

Phase history and execution state for each ticket.

| Column | Type | Description |
|---|---|---|
| `id` | int (PK) | Auto-increment primary key |
| `ticketId` | int (FK) | References `ticket.id` |
| `phaseName` | enum `TicketPhase` | Phase represented by this record |
| `sequence` | int | Ordering for repeated or historical phase records |
| `feedbackComment` | text, nullable | Feedback captured in `FEEDBACK` |
| `branchName` | varchar(255), nullable | Branch associated with this phase |
| `pullRequests` | json, nullable | Phase-level PR metadata array |
| `startedAt` | datetime, nullable | When work on the phase started |
| `completedAt` | datetime, nullable | When work on the phase completed |
| `status` | enum `PhaseStatus` | Execution state such as pending/running/completed |
| `lastMessage` | text, nullable | Latest status or agent message |
| `cliSessionId` | varchar(36), nullable | External CLI session identifier |
| `createdAt` | datetime | Record creation time |
| `updatedAt` | datetime | Last modification time |

### `project`

Project-level grouping and integration configuration.

| Column | Type | Description |
|---|---|---|
| `id` | int (PK) | Auto-increment primary key |
| `name` | varchar(100), unique | Project display name |
| `slug` | varchar(100), nullable, unique | Stable project key |
| `mondayBoardIds` | json, nullable | Monday boards used for imports and reports |
| `mondayDefaultPersonId` | varchar(50), nullable | Default Monday assignee for project hooks |
| `mondayDevPeople` | json, nullable | Monday people filters for dev flows |
| `primaryColor` | varchar(7), nullable | UI color |
| `actionColor` | varchar(7), nullable | UI action color |
| `introduction` | text, nullable | Project context injected into tickets/agents |
| `rules` | text, nullable | Project-specific execution rules |
| `techStack` | text, nullable | Project technology notes |
| `fastTrack` | boolean | Whether project can use shortened workflow paths |
| `logoPath` | varchar(500), nullable | Uploaded logo path |
| `createdAt` | datetime | Record creation time |
| `updatedAt` | datetime | Last modification time |

### `slot`

Workspace capacity and assignment tracking.

| Column | Type | Description |
|---|---|---|
| `id` | int (PK) | Auto-increment primary key |
| `name` | varchar(100) | Slot display name |
| `rootPath` | varchar(500) | Absolute workspace root containing repos |
| `currentTicketId` | int, nullable | Ticket currently occupying slot |
| `disabled` | boolean | Disabled slots stay visible but receive no new work |
| `projectId` | int, nullable | Project that owns or scopes the slot |
| `createdAt` | datetime | Record creation time |
| `updatedAt` | datetime | Last modification time |

### Relationships

- A **ticket** has many **phases**.
- A **phase** belongs to one **ticket** and is deleted with it.
- A **ticket** may belong to one **project** and one **slot**.
- A **project** has many **tickets** and many **slots**.
- A **slot** may belong to one **project** and may reference its current ticket.

## Runtime Workflow

1. A ticket is created from the UI/API or imported from Monday.
2. Ticket state is persisted in MySQL through TypeORM repositories.
3. Phase handlers update `ticket.currentPhase`, append/update `phase` records, and emit WebSocket events.
4. REST and MCP surfaces expose the same core operations to the web UI, agents, and external CLI clients.
5. Project and slot policies control where work can run; assistant writes that could disrupt occupied resources go through an approval queue.
6. Shipping stores branch/PR metadata and triggers project hooks such as Monday status updates.
7. Feedback is captured in `FEEDBACK` for review loops or follow-up tickets.

## System Surfaces

| Surface | Entry point | Purpose |
|---|---|---|
| Web UI | React app served by Vite/build output | Human ticket board, project setup, slot control, files, settings |
| REST API | `/api/tickets`, `/api/phases`, `/api/projects`, `/api/slots`, `/api/uploads` | Browser and integration operations |
| MCP | `/mcp` | Agent-friendly tools for tickets, phases, slots, projects, and Monday flows |
| Assistant | Assistant project/slot flows | Natural-language control with policy gates for risky mutations |
| CLI adapters | `src/cli` | External coding agent execution by configured CLI type |
| WebSocket | `/ws` | Realtime UI refresh after ticket, phase, project, slot, and file events |
| Monday | Monday API helpers and project hooks | Import work, assign people, update statuses, upsert implementation checklists |
| Discord | Discord assistant bridge | Thread-based assistant prompts, outbound sync, and action buttons when credentials are configured |

## Design Decisions

- **Phase history table:** Tribe stores both `ticket.currentPhase` and historical `phase` rows so board views are fast while phase duration, feedback, branch, PR, and session state stay auditable.
- **Code-owned phase enum:** Workflow phases are fixed in `TicketPhase.ts`, not user-configurable database rows. This keeps handler behavior and docs aligned with one runtime contract.
- **Project and slot separation:** Projects describe business/workflow context; slots describe local execution capacity. Their relationship lets one project own multiple workspaces without coupling ticket metadata to filesystem paths.
- **Policy-gated assistant writes:** Low-risk creates can be applied directly, while risky updates to running projects or occupied slots are proposed for approval before mutation.
- **Integration hooks:** Project-specific automation lives behind lifecycle hooks. Current eWebinar hooks synchronize Monday assignment, implementation checklist, and ship status without blocking core phase progression when Monday is unavailable.

## Operational Notes

- Run migrations for schema changes; do not rely on TypeORM synchronization.
- Monday features require configured Monday credentials and board/person settings.
- Discord assistant sync requires Discord credentials plus required gateway intents and channel permissions.
- Saved Discord settings override environment fallback values. Tokens are stored in MySQL as plaintext for this personal-dev deployment and should be revoked in Discord if exposed.
- WebSocket events are the primary UI freshness mechanism; stale board state should be debugged from mutation path to event broadcast to client subscription.
