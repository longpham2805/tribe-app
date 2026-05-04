---
name: plan
description: "Run a planning phase: decompose the ticket into ordered phases with file ownership, risks, and verification checks. Writes planning.md. Use before any code is written."
---

# Plan

Playbook for the PLANNING phase. Persona rules live in `docs/agents/planner.md`; this skill is the execution recipe.

## Inputs

- `ticket.md` — the original request

## Flow

1. **Read the ticket input in full.** If a required product/technical answer is missing, ask it with `[STATUS:QUESTION]` before writing the final plan. If multiple viable approaches remain but one is safely reversible, pick the simplest path and state the assumption.
2. **Scout** (see `scout` skill) for the entry point, dispatch, transforms, and exit touched by this change. Record `path:line` for each.
3. **Decompose into phases.** Each phase = a coherent, independently shippable slice. Three phases is common; more than six is usually a sign the ticket needs splitting.
4. **Assign file ownership per phase.** No two phases may edit the same file. If they must, merge them or serialize them.
5. **Build the dependency graph.** Which phases block which. Phases with no blocker can run in parallel.
6. **Rate risks** per phase: likelihood × impact. For anything High, write a mitigation in the same row.
7. **Define verification** for each phase: the command or check that proves it works. If you cannot name one, the phase is under-specified.
8. **Write `planning.md`** per `report-format` only after required questions are answered.

## Phase table (mandatory)

```
| # | Phase | Files owned | Blocked by | Risk | Verification |
|---|---|---|---|---|---|
| 1 | Add ws channel | src/ws/*.ts | — | med: auth gap | `curl` handshake |
| 2 | Broadcast on state change | src/handler/*.ts | 1 | low | unit test |
| 3 | Client listener | client/src/ws.ts | — | low | manual UI |
```

Every row must be complete. A blank cell means the plan is not ready.

## Risk rules

- Any phase touching auth, billing, or data migration is automatically at least medium risk; state the mitigation.
- Any phase that edits shared config or schema needs an explicit rollback step.
- If you cannot write a rollback in one sentence, the phase is too big.

## <HARD-GATE>

Do NOT implement. Do NOT edit files under `src/`, `client/`, or anywhere the phases will touch. Planning phase output is `planning.md` and nothing else.

## Question gate

Do not finalize a plan with unresolved questions. If an answer is required for a safe implementation contract, stop with `[STATUS:QUESTION]`, ask the smallest set of questions needed, then incorporate the answers into the final `planning.md`. Completed plans must not contain an `## Open Questions` section; use `## Decisions Resolved` or `## Assumptions` only for resolved context.

## Completion

Write `planning.md` matching `report-format`. End with `[STATUS:COMPLETED]` only after required questions are resolved, the phase table is complete, and each row has a verification cell.
