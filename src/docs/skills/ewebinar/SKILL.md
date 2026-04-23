---
name: ewebinar
description: Drive an ewebinar Monday ticket from first selection to PR-ready state in a single linear flow. Use when you want the agent to take a ticket from Monday, create local ticket artifacts, check out branches, guide implementation, create commits and PRs, and move the Monday status.
---

# ewebinar

Simplified end-to-end workflow for working on an ewebinar Monday.com ticket.

This skill is one linear flow. Start at the top and follow steps in order.

## State and files

The workflow uses:

- Global config file: `~/.dev/ewebinar.md`
  - `personId`, `personName`
  - `boardId`
- Ticket directory: `~/.dev/$TICKET_DATE/$SLUG/`
  - `ticket.md`: metadata, progress, PR table, summary, specification
  - `plan.md`: implementation plan with tasks (created in Step 4)
  - `implementation.md`: implementation details and testing checklist (created in Step 8)

Use these variables:

- `PERSON = { id: personId, name: personName }`
- `BOARD_ID = boardId`
- `SLUG`, `BRANCH_NAME`
- `TICKET_DATE`
- `TICKET_DIR = ~/.dev/$TICKET_DATE/$SLUG`
- `TICKET_FILE_PATH = $TICKET_DIR/ticket.md`
- `PLAN_FILE_PATH = $TICKET_DIR/plan.md`
- `IMPL_FILE_PATH = $TICKET_DIR/implementation.md`
- `CHECKED_OUT_REPOS` (subset of `frontend`, `backend`, `cdn`)
- `COMMITTED_REPOS` (subset of `CHECKED_OUT_REPOS`)

## Progress tracking

`ticket.md` is the source of truth for progress.

- Every time you complete a step, update `## Progress` -> `### Steps`.
- Every time you start or finish a task, update `## Progress` -> `### Tasks`.
- Valid statuses: `pending`, `active`, `done`, `blocked`, `skipped`.

Template:

```markdown
## Progress

### Steps
| # | Step | Status |
|---|------|--------|
| 1 | Ensure config | done |
| 2 | Pick ticket | done |
| 3 | Fetch details and create files | done |
| 4 | Write plan | pending |
| 5 | Identify repos and checkout branches | pending |
| 6 | Implementation | pending |
| 7 | Create commits | pending |
| 8 | Fill implementation details and testing checklist | pending |
| 9 | Create PRs | pending |
| 10 | Move Monday ticket to PR Review | pending |
| 11 | Handle PR feedback | pending |

### Tasks
| # | Task | Status | Repo |
|---|------|--------|------|
| — | To be populated after Step 4 plan approval. | pending | — |
```

## Step 0 -- Resume detection

Before starting a new ticket, check for in-progress work.

1. Scan `~/.dev/` for dated subfolders (`YYYY-MM-DD`) and `ticket.md` files under slug folders:
   - Pattern: `~/.dev/<date>/<slug>/ticket.md`.
2. Identify resume candidates:
   - The file has a `## Progress` section with a `### Steps` table, and
   - At least one step status is not `done` and not `skipped`.
3. If candidates exist, present a numbered list (do not use `AskQuestion` for this). Use exactly this shape:

   ```text
   Please choose an option:

   1. <short title> (#<Monday ID>)
   2. …
   K. Start a new ticket

   Reply with a number (1–K).
   ```

   - Number at most **19** resume candidates (`1` … `min(19, count)`); each line is a short title plus Monday ID (or a short link).
   - Next line is **`Start a new ticket`** (e.g. 3 candidates → options `1–3`, then `4. Start a new ticket`; `K` is that last number).
   - Cap **`K` at 20** (so never more than 19 resumes before `Start a new ticket`). If there are more than 19 candidates, list the first 19 only, then `20. Start a new ticket`, and add: `Additional in-progress tickets exist under ~/.dev/ — say which date/slug or start new.`
4. Parse the reply: a number in `1..K` selects that row; a Monday ID or URL (when not ambiguous) selects that item to resume; invalid input → ask again briefly.
5. If user chooses a candidate:
   - Read selected `ticket.md` and recover `SLUG`, `BRANCH_NAME`, `MONDAY_ITEM_ID`, `MONDAY_BOARD_ID`, `TICKET_DATE`.
   - Reconstruct paths: `TICKET_DIR`, `TICKET_FILE_PATH`, `PLAN_FILE_PATH`, `IMPL_FILE_PATH`.
   - If `ticket.md` contains `- **Mode**: DIY` and Step 6 is `active`, skip normal resume-point selection and jump to `Step 6-7 -- DIY handoff`.
   - Determine resume point:
     - Resume from first step with status `active`; if none, from first step with status `pending` after last `done` step.
6. If there are no candidates, or user chooses `Start a new ticket`, continue at Step 1.

## Step 1 -- Ensure config

1. Read `~/.dev/ewebinar.md`.
2. If it exists and includes `personId`, `personName`, `boardId`, use it.
   Ignore extra legacy fields (for example `afterPrStatus`, `notStartedGroups`).
3. If missing/incomplete:
   - Call `getMondayBoardSettings` MCP tool (no `boardIds` unless requested).
   - Pick `boardId` and collect `people`.
   - Ask for default person via `AskQuestion`.
   - Write:

     ```markdown
     ---
     personId: "<monday_person_id>"
     personName: "<monday_person_name>"
     boardId: <numeric_board_id>
     ---
     ```
4. Resolve `BASE` (monorepo root that contains `backend`, `frontend`, and/or `cdn`) in this exact order:
   - **Current working directory first (Claude Code default):**
     - If any of `cwd/backend`, `cwd/frontend`, or `cwd/cdn` exist as directories, set `BASE = cwd` with reason `cwd matched`.
   - **Cursor workspace roots:**
     - Read all absolute workspace roots (single-root or multi-root).
     - If any workspace root `W` directly contains `W/backend`, `W/frontend`, or `W/cdn`, set `BASE = W` with reason `workspace root matched`.
     - Else gather workspace roots whose basename is `backend`, `frontend`, or `cdn`.
     - If that set is non-empty, compute their parent directories:
       - If all parents are the same directory `P`, set `BASE = P` with reason `workspace repo roots share one parent`.
       - Otherwise set `BASE = parent(first matching workspace root)` with reason `workspace repo root parent fallback`.
   - **Fallback upward walk from `cwd`:**
     - Walk parent-by-parent from `cwd`; the first ancestor `A` where any of `A/backend`, `A/frontend`, or `A/cdn` exist is `BASE` with reason `ancestor walk matched`.
   - If still unset, stop and ask the user for the monorepo root.
5. After resolving `BASE`, send a detailed confirmation:
   - Include:
     - resolved `BASE`
     - detected repo directories under `BASE` (subset of `backend`, `frontend`, `cdn`)
     - why this `BASE` was selected (the detection reason above)
   - Use this shape:

     ```text
     Working base path: <BASE>
     Detected repos under base: <comma-separated repos, e.g. backend, frontend>
     Why this base was selected: <reason>
     ```
6. Mark Step 1 as `done` in `ticket.md` when running on a resumed ticket.

## Step 2 -- Pick a ticket

1. If user supplied `itemIdOrLink`, use it.
2. Otherwise call `getNotStartedItems` with:

   ```json
   {
     "boardIds": [BOARD_ID]
   }
   ```

3. Present candidates as a numbered list (do not use `AskQuestion` for ticket picking). Use exactly this shape:

   ```text
   Please choose an option:

   1. <short title> (#<Monday ID>)
   2. …
   N. Other — I'll type the ID or URL

   Reply with a number (1–N).
   ```

   - **At most 20 choices total.** Prefer **19** ticket lines numbered `1` … `min(19, items.length)` plus **`20. Other — I'll type the ID or URL`**. If there are **20 or more** items, show **20** ticket lines only (numbers `1–20`), omit the `Other` line, and add below the footer: `To pick a ticket not listed, reply with its Monday item ID or paste the item URL.`
   - Each ticket line must use this exact format: `[GROUP] - MON-[ID] - [NAME]`.

4. Parse the reply: a number in `1..N` selects that row; if the user picked `Other`, ask once for a numeric ID or Monday URL; a bare ID/URL in the first reply is also fine when it clearly identifies an item.
5. Final selected/provided ID becomes `itemIdOrLink`.
6. Mark Step 2 as `done` in `ticket.md` when applicable.

## Step 3 -- Fetch details, assign on Monday, create ticket folder and ticket.md

1. Call `getMondayItemDetails` with `itemIdOrLink`. On failure, stop.
2. Build initial `Ticket Summary` and `Specification` from item column values and updates/replies.
3. Assign item to configured person with `updateMondayItemPeople` using `personIds: [PERSON.id]`.
4. Update Monday status to `Coding` with `updateMondayItemStatus`; if label is missing, warn and continue.
5. Derive `SLUG` and `BRANCH_NAME` using the existing safe branch algorithm:
   - `ITEM_ID_SEGMENT` from digits in `item.id`
   - prefix `fix/` / `chore/` / `feature/`
   - normalized `short-name`
   - length and git safety checks
6. Set `TICKET_DATE` to `YYYY-MM-DD`.
7. Ensure folder exists: `mkdir -p ~/.dev/$TICKET_DATE/$SLUG`.
8. Write `ticket.md` to `~/.dev/$TICKET_DATE/$SLUG/ticket.md` using this canonical template:

   ```markdown
   # <Ticket title>

   - **Monday ID**: <id>
   - **Link**: <monday_url>
   - **Date**: <YYYY-MM-DD>
   - **Branch**: `<branch_name>`
   - **Status**: Coding

   ## Progress

   ### Steps
   | # | Step | Status |
   |---|------|--------|
   | 1 | Ensure config | done |
   | 2 | Pick ticket | done |
   | 3 | Fetch details and create files | done |
   | 4 | Write plan | pending |
   | 5 | Identify repos and checkout branches | pending |
   | 6 | Implementation | pending |
   | 7 | Create commits | pending |
   | 8 | Fill implementation details and testing checklist | pending |
   | 9 | Create PRs | pending |
   | 10 | Move Monday ticket to PR Review | pending |
   | 11 | Handle PR feedback | pending |

   ### Tasks
   | # | Task | Status | Repo |
   |---|------|--------|------|
   | — | To be populated after Step 4 plan approval. | pending | — |

   ## Pull requests

   | Repo | PR |
   |---|---|
   | frontend | — |
   | backend | — |
   | cdn | — |

   ## Ticket Summary
   <summary text>

   ## Specification
   <spec text>
   ```

9. Expose `SLUG`, `BRANCH_NAME`, `TICKET_DATE`, `TICKET_DIR`, `TICKET_FILE_PATH`, `PLAN_FILE_PATH`, `IMPL_FILE_PATH`, `MONDAY_ITEM_ID`, `MONDAY_BOARD_ID`.

## Step 4 -- Write the implementation plan

1. Read `ticket.md` summary and specification.
2. Ask optional context question via `AskQuestion`:
   - `No, proceed with the spec only`
   - `Yes, I'll add details`
   - `DIY -- I'll implement myself`
3. If user chooses `DIY -- I'll implement myself`:
   - Ask which repos user will implement in via `AskQuestion` (multi-select):
     - `frontend`
     - `backend`
     - `cdn`
   - Set `SELECTED_REPOS` from this answer.
   - Write a minimal placeholder plan to `plan.md` (`PLAN_FILE_PATH`):

     ```markdown
     ## Plan
     DIY implementation -- plan will be filled retroactively from changes.
     ```

   - Add `- **Mode**: DIY` to `ticket.md` metadata (after `Status`).
   - Mark Step 4 as `done`; mark Step 5 as `active`.
   - Skip the remaining Step 4 planning items and continue at Step 5.
4. Classify complexity:
   - `simple`: one repo, obvious fix, up to 3 files, low risk
   - `complex`: multi-repo, schema/API changes, stateful/UI flows, or 2+ non-trivial tasks
5. Write plan to `plan.md` (`PLAN_FILE_PATH`):
   - For `simple`: concise numbered plan with explicit file paths and concrete tests/commands.
   - For `complex`: use `### Task N: ...` and checkbox steps. Include exact paths, concrete commands, expected outputs, and code blocks where needed.
6. Self-review:
   - Spec coverage
   - Placeholder scan (`TBD`, `TODO`, etc.)
   - Type/identifier consistency
   - Test coverage: each important behavior in spec has at least one test step
7. User review loop with `AskQuestion`:
   - `Approved, proceed`
   - `Needs changes`
   Keep revising `plan.md` until approved.
8. After approval:
   - Populate `ticket.md` Tasks table from plan tasks (`pending` statuses).
   - Mark Step 4 as `done`; mark Step 5 as `active`.

## Step 5 -- Identify repos and checkout branches

1. Infer `SELECTED_REPOS` from `plan.md` scope.
   - If in DIY mode, use the repo selection captured in Step 4.
2. Reuse `BASE` resolved in Step 1.
   - Do not re-discover or override it in Step 5.
3. For each repo in `SELECTED_REPOS`, execute checkout flow:
   - stash if dirty
   - `git fetch origin dev`
   - if `BRANCH_NAME` exists locally or on remote (check with `git branch -a`):
     - derive `BRANCH_NAME_NEW` = `BRANCH_NAME` + `-MMDD` (today's date)
     - set `BRANCH_NAME = BRANCH_NAME_NEW`
     - update the `- **Branch**:` line in `ticket.md` to the new branch name
   - `git checkout -b <BRANCH_NAME> origin/dev`
   - stash pop if needed
4. Set `CHECKED_OUT_REPOS` to successful repos.
5. Update progress:
   - Step 5 -> `done`
   - Step 6 -> `active`
6. If in DIY mode:
   - Tell user:

     ```text
     Branches checked out. Implement your changes, then come back and say "done" (or "continue").
     I'll pick up from your staged or committed changes.
     ```

   - Stop and wait for user.

## Step 6-7 -- DIY handoff

Use this only when `Mode: DIY`.

When user says they are done implementing:

1. For each repo in `CHECKED_OUT_REPOS`, inspect current state:
   - Run `git status`.
   - Run `git log origin/dev..HEAD --oneline`.
   - Determine whether repo has staged-uncommitted changes, user commits, or both.
2. If staged but uncommitted changes exist:
   - Create commits using `git-commit-format` skill (same standards as Step 7).
3. If user already committed:
   - Keep existing commits; do not rewrite.
4. Build a retroactive plan summary in `plan.md` using `git diff origin/dev...HEAD`:
   - Convert changes into concise task-style entries with file paths and verification notes.
5. Record repos with commits in `COMMITTED_REPOS`.
6. Update progress:
   - Step 6 -> `done`
   - Step 7 -> `done`
   - Step 8 -> `active`
7. Continue at Step 8.

## Step 6 -- Implementation

1. Work through `plan.md` task-by-task, in order. For each task:
   - Set its `ticket.md` task status to `active`.
   - Execute each checkbox step (`- [ ]`) sequentially. Do not skip steps or reorder.
   - For each step:
     - If it changes code: make exactly the change described.
     - If it runs a command: run the exact command and compare output to the
       expected result in the plan. If output does not match, stop and evaluate
       before continuing.
     - Check off the step (`- [x]`) in `plan.md` when done.
   - After all steps in a task pass: mark task `done` in `ticket.md`.
2. If backend schema/API changes affect GraphQL artifacts:
   - Run `npm run codegen` in backend and frontend before frontend work.
3. For complex tickets with 4+ tasks:
   - Commit after each completed task for clean resume points.

### When to stop and ask

STOP executing and ask the user when:

- A step's instruction is unclear or ambiguous.
- A dependency is missing (package, file, service not found).
- Verification output does not match expected after 2 attempts.
- You would need to guess or improvise beyond what the plan specifies.
- A blocker prevents starting the next step.

Mark the task `blocked` in `ticket.md`, share the exact error or confusion,
and wait for guidance. Do not guess.

### When to re-plan

If a discovery during implementation invalidates the current approach:

1. Stop the current task.
2. Update `plan.md` to reflect the new approach.
3. Re-review remaining tasks -- if later tasks depend on the changed task,
   update them too.
4. Tell the user what changed and why before continuing.

### Pre-commit confirmation

When all tasks are complete and tests pass:

1. Stage only intended ticket changes in each repo.
2. Confirm with user via `AskQuestion`:
   - `Yes, proceed`
   - `No, revise`
   - `I restaged, sync plan`
3. After confirmation:
   - Step 6 -> `done`; Step 7 -> `active`

## Step 7 -- Create commits

1. For each repo in `CHECKED_OUT_REPOS` with staged changes:
   - Use `git-commit-format` skill to craft commit messages.
   - Create focused commits that match plan task boundaries unless user requested otherwise.
2. Record repos with new commits as `COMMITTED_REPOS`.
3. Update progress:
   - Step 7 -> `done`
   - Step 8 -> `active`

## Step 8 -- Fill implementation details and testing checklist

1. For each repo in `COMMITTED_REPOS`, gather commit hashes (prefer Step 7 commits).
2. For each hash, inspect diffs (`git show --stat --patch <hash>`), then synthesize:
   - `## Implementation Details` (short behavior-focused bullets)
   - `## Testing Checklist` (checkboxes with concrete user-facing verification)
3. Write combined output to `implementation.md` (`IMPL_FILE_PATH`) in this structure:

   ```markdown
   ## Implementation Details

   - ...

   ## Testing Checklist

   - [ ] ...
   ```

4. Optional helper: you may use `implementation-details-from-commits` skill to generate draft content, then write finalized content to `implementation.md`.
5. Sync implementation/testing to Monday using `upsertMondayImplementationChecklist`:
   - `itemIdOrLink`
   - `person` = configured `personId`
   - `content` = markdown body from `implementation.md` (without title prepended by tool)
6. If upsert fails, report error; local files remain source of truth.
7. Update progress:
   - Step 8 -> `done`
   - Step 9 -> `active`

## Step 9 -- Create PRs

1. For each repo in `COMMITTED_REPOS`:
   - push branch
   - create PR against `dev`
   - capture PR URL
2. Update PR table in `ticket.md`.
3. Update progress:
   - Step 9 -> `done`
   - Step 10 -> `active`

## Step 10 -- Move Monday ticket to PR Review

1. Call `updateMondayItemStatus` with:
   - `itemIdOrLink`
   - `boardId: BOARD_ID`
   - `statusLabel: "PR Review"`
2. If status update fails, report but do not roll back local changes or PRs.
3. Report PR URLs and Monday status result to user.
4. Update progress:
   - Step 10 -> `done`
   - Step 11 -> `active` when post-PR feedback work starts; otherwise `pending`.

## Step 11 -- Handle PR feedback

Use this step when user asks to address review comments or CI breakages.

1. Read `ticket.md`, `plan.md`, and `implementation.md`.
2. Check out `BRANCH_NAME` in relevant repos.
3. Implement requested fixes, run targeted verification, and create follow-up commits (or amend only if user explicitly asks).
4. Push updates to existing PRs.
5. Update `implementation.md` if behavior/testing changed.
6. Update `ticket.md` progress and PR table notes as needed.
7. Mark Step 11 as `done` when review feedback is addressed.
