---
name: test
description: "Author tests with a failure-first mindset: reproduce the bug, then fix; cover happy/edge/error paths; test behavior not implementation. Use when adding tests to a feature, a bug fix, or a regression."
---

# Test

Playbook for the tester agent or any phase adding tests. Persona rules live in `docs/agents/tester.md`.

## Principle

A test is useful if it fails when the behavior is wrong and passes when it is right. Tests that always pass, or that test mocks instead of behavior, are noise.

## Flow

1. **Reproduce first.** For a bug: write a test that fails with the current code. Do not fix first and hope the test catches it.
2. **Test the behavior, not the implementation.** Test what a caller observes — inputs, outputs, side effects — not private method calls.
3. **Cover three paths** minimum per unit:
   - Happy path — the expected input
   - Edge — empty, boundary, max size, unicode, concurrent
   - Error — invalid input, downstream failure, timeout
4. **Run and read the output.** A green bar on a misconfigured runner is worse than a red bar.
5. **Cite the run** in the report (`verification` skill).

## Test matrix

For any unit of meaningful complexity, build a small matrix before writing the first test:

```
| Case | Input | Expected |
|---|---|---|
| empty ticket | "" | ValidationError |
| well-formed | full frontmatter | parsed object |
| missing field | no `phase:` | ValidationError with field name |
| unicode id | "tícket-ø" | parsed object |
```

The matrix is the test plan. Write each row as a test.

## Mocking discipline

- Mock at system boundaries only (HTTP, filesystem for tests that shouldn't hit disk, clocks).
- Do not mock the class under test. If you need to, it is too big — split it.
- Integration tests that hit a real database beat unit tests that mock the database, for anything persistence-related.

## Anti-patterns

- Tests with no assertions (they pass forever)
- Asserting `toHaveBeenCalled` instead of the resulting state
- Sleeping to "wait for async" — use the framework's waiter
- Commenting out flaky tests — fix them or delete them with justification
- One giant test covering five behaviors — split it

## <HARD-GATE>

Do NOT report a task as done while any test in the changed area is red, skipped, or commented out. Treat a skipped test as an unresolved TODO.

Do NOT weaken an assertion to make a test pass. If the test is wrong, fix the test with a clear reason. If the code is wrong, fix the code.

## Output

- `## Matrix` — the cases covered
- `## Run` — command and result (copy-paste, not paraphrase)
- `## Gaps` — what is not covered and why (deferred / infeasible)

End with `[STATUS:COMPLETED]` only after a clean run whose output proves the new tests exist and pass.
