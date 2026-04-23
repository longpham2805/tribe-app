# Tribe - Design Document

## Overview

Tribe is a developer workflow management tool that structures work into a clear, phased pipeline. Each ticket progresses through a defined sequence of phases, giving visibility into where work stands and enforcing a disciplined development process.

## Tech Stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **ORM:** TypeORM
- **Database:** MySQL

## Workflow Phases

Every ticket moves through these phases in order:

1. **Created** - Ticket is created with a title and description.
2. **Brainstorm** - Free-form ideation and research. Capture thoughts before committing to a plan.
3. **Planning** - Define scope, break down tasks, estimate effort.
4. **Implementation** - Build the thing.
5. **Ship** - Final review, merge, deploy, close out.

## Database Schema

### `ticket`

The core unit of work.

| Column        | Type         | Description                              |
|---------------|--------------|------------------------------------------|
| id            | int (PK)     | Auto-increment primary key               |
| title         | varchar(255) | Short summary of the work                |
| description   | text         | Detailed description (nullable)          |
| current_phase | enum         | Current workflow phase                   |
| created_at    | datetime     | When the ticket was created              |
| updated_at    | datetime     | Last modification time                   |

### `phase`

Tracks the history of phase transitions for a ticket, so you can see when each phase started/ended and how long it took.

| Column       | Type         | Description                               |
|--------------|--------------|-------------------------------------------|
| id           | int (PK)     | Auto-increment primary key                |
| ticket_id    | int (FK)     | References `ticket.id`                    |
| phase_name   | enum         | Which phase this record represents        |
| started_at   | datetime     | When the ticket entered this phase        |
| completed_at | datetime     | When the ticket left this phase (nullable)|
| created_at   | datetime     | Record creation time                      |
| updated_at   | datetime     | Record update time                        |

### Relationships

- A **ticket** has many **phases** (one-to-many).
- Each **phase** belongs to one **ticket**.

### Enum: `TicketPhase`

```
CREATED
BRAINSTORM
PLANNING
IMPLEMENTATION
SHIP
```

## Design Decisions

- **Phase history table**: Rather than just storing the current phase on the ticket, we also log each phase transition in the `phase` table. This gives us duration tracking per phase and a full audit trail with no extra work.
- **Minimal to start**: No sub-tasks, no comments, no user/team management. We can layer those on later once the core loop is solid.
- **Enum for phases**: Phases are a fixed set defined in code, not a user-configurable table. This keeps the workflow rigid and predictable, which is the point.

## Project Hooks (ewebinar)

Tribe supports lifecycle hooks so project-specific automation can run without hardcoding behavior directly into phase logic.

- Hook entry points:
  - ticket import (`onTicketImported`)
  - phase entered (`onPhaseEntered`)
  - phase completed (`onPhaseCompleted`)
- Current implementation registers one hook: `EwebinarHook`.
- Ewebinar behavior:
  - On Monday import: assign configured person and move item status to `Coding`
  - On `IMPLEMENTATION` completion: read `implementation.md` and upsert checklist back to Monday
  - On `SHIP` completion: move item status to `PR Review`
- Hook failures are logged and swallowed, so phase execution in Tribe still proceeds if Monday is unavailable.

Configuration remains env-driven for now (`MONDAY_ACCESS_TOKEN`, board/person-related envs). Per-project settings are intentionally deferred; the hook interface is designed to let future projects register their own hook implementations without changing the phase engine.
