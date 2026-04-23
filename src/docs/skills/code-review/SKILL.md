---
name: code-review
description: "Adversarial code review in three stages: spec compliance, quality, red-team. Use after an implementation phase to catch missed requirements, quality issues, and failure modes before shipping. Findings carry accept/reject/defer verdicts."
---

# Code review

Playbook for reviewing code produced by the IMPLEMENTATION phase (or a PR). Persona rules live in `docs/agents/code-reviewer.md`.

## Inputs

- The diff to review — prefer a command-line source (`git diff`, `git show <sha>`, `gh pr diff <n>`) over pasted snippets.
- The plan or spec the code claims to implement (`planning.md` if available).

## Three stages

Run sequentially. Stage N only starts if Stage N-1 passes.

### Stage 1 — Spec compliance

Question: does the code do what was asked?
- Every item in `planning.md` accounted for (done or deliberately deferred)
- No unjustified extras — added scope is a failure mode, not a bonus
- Public API matches the plan

If Stage 1 fails, stop. Return the missing/extra items.

### Stage 2 — Quality

- Boundary validation at system edges
- No silent `catch`, no `any` without justification
- Error paths actually reachable and tested
- Function / file size reasonable; duplication flagged
- Reused existing utilities where available (see `scout`)

### Stage 3 — Adversarial (red-team)

Actively try to break the code. For each change, ask:
- What input crashes this?
- What concurrent call corrupts state?
- What happens on partial failure (disk full, network half-open, process killed)?
- Is there an auth/authz boundary being crossed?
- Does this introduce an N+1, unbounded loop, or memory leak?
- Supply chain: any new dependency worth vetting?

Skip Stage 3 only for trivial changes (≤2 files, ≤30 lines, no security-adjacent code).

## Finding format

Every finding carries a verdict. No "consider…" suggestions.

```
[CRITICAL] src/auth.ts:88 — token compare uses `==`, enables timing attack.
Verdict: ACCEPT. Fix before merge.
Suggested change: use `crypto.timingSafeEqual`.
```

Verdicts:
- **ACCEPT** — real issue, must fix before merge
- **REJECT** — false positive, explain why
- **DEFER** — real but out of scope; open a follow-up

Severity: CRITICAL (blocks), IMPORTANT (fix before ship), MINOR (nice-to-have).

## <HARD-GATE>

Do NOT approve without reading the actual diff. No "looks good based on the description".
Do NOT edit the code under review. Review produces findings; fixes happen in a separate phase.

## Output

A markdown report with:
- `## Spec Compliance` — pass/fail + missing items
- `## Quality` — findings
- `## Adversarial` — findings (or "skipped, below scope threshold")
- `## Verdict` — APPROVE / BLOCK + one-line reason

End with `[STATUS:COMPLETED]` (review done) regardless of whether it approves or blocks the code — a BLOCK verdict is still a completed review.
