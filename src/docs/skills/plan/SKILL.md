---
name: plan
description: "Run a planning phase: decompose a chosen approach into ordered phases with file ownership, risks, and verification checks. Writes planning.md. Use after brainstorm is approved and before any code is written."
---

# Plan

Playbook for the PLANNING phase. Persona rules live in `docs/agents/planner.md`; this skill is the execution recipe.

## Inputs

- `ticket.md` — the original request
- `brainstorm.md` — the approved approach and open questions

If `brainstorm.md` names multiple viable options without a recommendation, stop and ask which one to plan for. Do not plan all three.

## Flow

1. **Read both inputs in full.** Planning without the brainstorm recommendation is guessing.
2. **Scout** (see `scout` skill) for the entry point, dispatch, transforms, and exit touched by this change. Record `path:line` for each.
3. **Decompose into phases.** Each phase = a coherent, independently shippable slice. Three phases is common; more than six is usually a sign the ticket needs splitting.
4. **Assign file ownership per phase.** No two phases may edit the same file. If they must, merge them or serialize them.
5. **Build the dependency graph.** Which phases block which. Phases with no blocker can run in parallel.
6. **Rate risks** per phase: likelihood × impact. For anything High, write a mitigation in the same row.
7. **Define verification** for each phase: the command or check that proves it works. If you cannot name one, the phase is under-specified.
8. **Write `planning.md`** per `report-format`.

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

## Open questions

End with an `## Open Questions` section if any remain. The IMPLEMENTATION phase reads this and will block on unanswered items — be honest.

## Completion

Write `planning.md` matching `report-format`. End with `[STATUS:COMPLETED]` once the phase table is complete and each row has a verification cell.
