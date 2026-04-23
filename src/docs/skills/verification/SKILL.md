---
name: verification
description: "Produce evidence before claiming done. Use at the end of every implementation, test, review, or git operation. Blocks 'should work', 'probably passes', 'seems fine'. Requires a command, its output, and a verdict."
---

# Verification

Evidence-before-claim. No status of `COMPLETED` is valid without a run you can cite.

## Iron law

Every completion claim carries: the command you ran, the exit/line of output that proves success, and the verdict.

Wrong:
> Typecheck should pass.

Right:
> `npm run build` — exit 0. `Successfully compiled 47 files.` → COMPLETED.

## Gate

Before writing `[STATUS:COMPLETED]`:

1. **Identify** the minimal check that proves the change works — typecheck, unit test, integration test, manual HTTP call, or a file-read diff.
2. **Run** it. Real invocation, not a dry run. Fresh — not a stale result from earlier.
3. **Read** the output. If you did not read it, you do not know the result.
4. **Decide**:
   - All checks green → COMPLETED, with evidence quoted inline.
   - Any check red → fix, then re-run. Never claim green by ignoring a red.
   - Check infeasible in this environment (e.g. UI, no dev server wired) → state that explicitly and use `[STATUS:REQUIRES_ACTION]`.

## Forbidden phrasing

Flag and rewrite any of these before submitting:
- "should pass / should work / should be fine"
- "probably / likely / seems to / looks like"
- "I believe X is correct"
- "this is ready for review" without a run log

Replace each with a concrete run + result, or admit the gap.

## Check selection

| Change | Minimum check |
|---|---|
| TypeScript edit | `npm run build` (or `tsc --noEmit`) |
| Logic change with tests | relevant `npm test -- <pattern>` |
| New route/handler | `curl` or equivalent round-trip against a local server |
| Prompt / markdown change | Read the file back; confirm frontmatter parses |
| Git operation | `git status` + `git log -1 --stat` after |

Pick the narrowest check that exercises the change. A full test suite on a one-line doc edit is noise.

## Red-team self-check

Before claiming green, ask once:
- What input did I not try that could break this?
- What assumption about the environment am I making?
- If this were a PR review, which line would a reviewer question?

If the answer names a real risk, test it before claiming. If it does not, proceed.

## Output

Every `[STATUS:COMPLETED]` message must include, above the trailer, a short block:

```
Verified:
- <command> → <result>
- <command> → <result>
```

If you cannot produce that block, you are not done.
