---
name: plan
description: "Run a planning phase: produce an implementer-ready planning.md with exact tasks, file ownership, risks, rollback, and verification. Use before any code is written."
---

# Plan

Playbook for the PLANNING phase. Persona rules live in `docs/agents/planner.md`; this skill is the execution recipe.

## Inputs

- `ticket.md` — the original request

## Flow

1. **Read the ticket input in full.** If a required product/technical answer blocks safe implementation, ask it with `[STATUS:QUESTION]` before writing the final plan. If multiple viable approaches remain but one is safely reversible, pick the simplest path and state the assumption.
2. **Scout** (see `scout` skill) for the entry point, dispatch, transforms, and exit touched by this change. Record `path:line` for each.
3. **Define decisions and assumptions.** Record product choices, technical defaults, and anything you inferred. Do not leave unresolved questions in a completed plan.
4. **Decompose into phases.** Each phase = a coherent, independently shippable slice. Three phases is common; more than six is usually a sign the ticket needs splitting.
5. **Assign file ownership per phase.** No two parallel phases may edit the same file. If they must, merge them or serialize them.
6. **Build the dependency graph.** Which phases block which. Phases with no blocker can run in parallel.
7. **Write implementation tasks.** Convert the plan into ordered checkbox steps. Each step names exact paths, concrete commands, and expected outcomes.
8. **Rate risks and rollback** per phase: likelihood x impact, with mitigation for High items and one-sentence rollback for schema/config/shared behavior.
9. **Define verification.** Name the command or manual check that proves each important behavior. Tests are required where appropriate, but do not require red-green/TDD workflow.
10. **Self-review before completion.** Check spec coverage, placeholder scan (`TBD`, `TODO`, `<...>`, `???`), path/type consistency, test/check coverage, no unresolved questions.
11. **Write `planning.md`** per `report-format` only after required questions are answered and self-review passes.

## Required planning.md sections

Completed `planning.md` must contain these level-2 sections:

- `## Goal` - 1-3 sentences for the outcome and success criteria.
- `## Decisions / Assumptions` - resolved choices only; no open questions.
- `## Discovery` - entry point, dispatch, transforms, and exits with `path:line`.
- `## Phases` - coordination table for file ownership, blockers, risk, and verification.
- `## Implementation Tasks` - ordered checkbox steps the implementer can execute without interpretation.
- `## Risks / Rollback` - concrete failure modes, mitigations, and rollback notes.
- `## Verification` - exact commands/checks and expected results.

Simple tickets may have one phase and one task, but still need paths, commands/checks, and expected outcomes.

## Phases table

```
| # | Phase | Files owned | Blocked by | Risk | Verification |
|---|---|---|---|---|---|
| 1 | Add ws channel | src/ws/*.ts | none | med: auth gap | `curl` handshake |
| 2 | Broadcast on state change | src/handler/*.ts | 1 | low | unit test |
| 3 | Client listener | client/src/ws.ts | none | low | manual UI |
```

The phase table is a coordination summary, not the whole plan. Every row must be complete. A blank cell means the plan is not ready.

## Implementation task format

Use task headings and checkbox steps:

```markdown
### Task 1: Add planning artifact guard

- [ ] Update `src/handler/phase/planningArtifact.ts` to reject placeholder text.
  Command/check: `npm test -- src/handler/phase/planningArtifact.test.cjs`
  Expected: guard tests pass.
- [ ] Update `src/handler/phase/planningArtifact.test.cjs` with placeholder and missing-section cases.
  Command/check: `npm test -- src/handler/phase/planningArtifact.test.cjs`
  Expected: new tests cover each guard branch.
```

Each checkbox must be concrete enough that IMPLEMENTATION can execute it directly. Do not use placeholders, "etc.", or vague verbs like "handle edge cases" without naming the exact edge cases.

## Risk rules

- Any phase touching auth, billing, or data migration is automatically at least medium risk; state the mitigation.
- Any phase that edits shared config or schema needs an explicit rollback step.
- If you cannot write a rollback in one sentence, the phase is too big.

## <HARD-GATE>

Do NOT implement. Do NOT edit files under `src/`, `client/`, or anywhere the phases will touch. Planning phase output is `planning.md` and nothing else.

## Question gate

Do not finalize a plan with unresolved questions. If an answer is required for a safe implementation contract, stop with `[STATUS:QUESTION]`, ask the smallest set of questions needed, then incorporate the answers into the final `planning.md`. Completed plans must not contain an `## Open Questions` section; use `## Decisions / Assumptions` only for resolved context.

## Completion

Write `planning.md` matching `report-format`. End with `[STATUS:COMPLETED]` only after required questions are resolved, the phase table is complete, implementation checkbox tasks are actionable, and verification is explicit.
