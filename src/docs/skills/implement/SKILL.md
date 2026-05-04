---
name: implement
description: "Run an implementation phase: execute the approved plan, respecting file ownership, without introducing scope creep. Verifies with typecheck and tests before claiming done. Writes implementation.md."
---

# Implement

Playbook for the IMPLEMENTATION phase. Persona rules live in `docs/agents/fullstack-developer.md`; this skill is the execution recipe.

## Inputs

- `ticket.md` — the original request
- `planning.md` — phases, file ownership, implementation checkbox tasks, verification commands

If `planning.md` has unanswered questions, an `## Open Questions` section, missing `## Implementation Tasks`, missing checkbox steps, or obvious placeholders, stop with `[STATUS:ERROR]` and report a planning contract violation. Do not ask the user again from IMPLEMENTATION; PLANNING must resume, incorporate the answers, and emit a finalized actionable plan.

## Flow

1. **Read `planning.md` in full.** Understand every phase, not just the one you are starting; fail fast if the planning question contract is violated.
2. **Pick the phase to run** (the next one with all blockers complete). If the plan names one, use that.
3. **Confirm file ownership.** List the files the phase owns. You will edit those and only those.
4. **Execute `## Implementation Tasks` in order.** Work through checkbox steps sequentially. Do not skip, reorder, or reinterpret them silently.
5. **Scout** existing utilities before writing new code. Reuse beats invention.
6. **Edit, one file at a time.** Keep each diff small enough to explain in one sentence.
7. **Verify after each meaningful change** — typecheck early, not only at the end.
8. **Run the phase's verification commands** from `planning.md`. Copy their output into the report.
9. **Write `implementation.md`** per `report-format`, including skipped/deferred checkbox items with justification.

## Scope discipline

- If the ticket asks for X, implement X. Not X + cleanup + "while I'm here".
- Three similar lines is better than a premature abstraction.
- Do not add fallbacks, feature flags, or compatibility shims for cases that cannot happen.
- Do not add error handling for scenarios internal code cannot produce.
- No TODOs left blocking correctness. Either finish it or record it as a follow-up.

## Code quality minimums

- No `any` without a one-line justification comment.
- No silent `catch` blocks — at minimum log or rethrow.
- Public types/interfaces match the plan exactly.
- Boundary validation at system edges only; trust internal code.
- Every completed checkbox maps to an actual change or verification step.

## <HARD-GATE>

Do NOT edit files outside the phase's file-ownership list. If the change requires touching an un-owned file, STOP, write `[STATUS:REQUIRES_ACTION]`, and explain. Ownership violations corrupt parallel phases.

Do NOT skip verification. A `[STATUS:COMPLETED]` without a `Verified:` block is rejected by downstream phases.

Do NOT silently skip plan checkboxes. If a checkbox is obsolete, unsafe, or impossible, record it in `implementation.md` under `## Follow-ups` or stop with `[STATUS:REQUIRES_ACTION]` if it blocks correctness.

## Verification (required)

Before claiming done, run at minimum:
- Typecheck / build
- Tests covering the changed code path

See `verification` skill for the evidence format. The `Verified:` block goes into `implementation.md` under `## Verification`.

## Report

`implementation.md` per `report-format`, with sections:
- `## Changes` — one line per modified file (`src/foo.ts — add X broadcast`)
- `## Verification` — commands and their results, copy-pasted
- `## Follow-ups` — anything deliberately deferred, including skipped plan checkboxes, with justification

## Checklist Output (required)

Before writing `[STATUS:COMPLETED]`, write `implementation-testing-checklist.md` to the path specified in `## Output Artifacts` using your file-write tool. Do NOT print it to stdout.

Format (see `docs/samples/implementation-testing-checklist.md`):

```
## Implementation Details

- <concise bullet: what was done> (3–5 bullets)

## Testing Checklist

- [x] <item you actually verified>
- [ ] <item the developer must verify manually>
```

Rules:
- `## Implementation Details` — 3–5 one-sentence bullets describing what changed and why.
- `## Testing Checklist` — one item per user-visible or integration-visible behaviour. Mark `[x]` only for items you ran yourself; use `[ ]` for items requiring manual verification.
- No build output, diffs, or stack traces. Keep it scannable in 30 seconds.

## Completion

`[STATUS:COMPLETED]` only if all three are true: every phase task done, file ownership respected, verification green. Otherwise use `REQUIRES_ACTION` or `ERROR` with specifics.
