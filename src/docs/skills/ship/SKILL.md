---
name: ship
description: "Create branch, commit, push, and PR for dirty repos and produce ship.md artifact."
---

# Ship

Execute shipping in a deterministic, resumable order.

## 1) Scan repositories

Iterate immediate child directories of the current working directory that contain a `.git` folder.

For each repo, classify as dirty if any of these commands returns non-empty output:

- `git status --porcelain`
- `git diff --stat`
- `git diff --staged --stat`
- `git log origin/dev..HEAD --oneline`

Skip clean repos and note skips in `ship.md`.

## 2) Stage specific paths only

Follow git skill constraints. Stage explicit files only. Never use `git add -A`, `git add .`, or `git add -u`.

## 3) Derive commit type from staged changes

Decide the conventional commit type (`fix`, `feat`, `chore`, etc.) from the **actual staged diff**, not from the ticket title.

Use this type for both:

- Commit message prefix
- Branch prefix mapping:
  - `fix` -> `fix/`
  - `chore` -> `chore/`
  - `feat` (or any non-fix/non-chore type) -> `feature/`

## 4) Derive branch name (just before commit)

Use the injected `## Ticket` block for slug/suffix:

- Slug: lowercase, strip punctuation, convert spaces to `-`, max 40 chars.
- Suffix: `-<last6(mondayItemId)>` only if the ticket has a Monday item ID; omit the suffix entirely when no Monday ID is present.
- Prefix: must come from Step 3 commit type mapping so branch and commit stay consistent.

## 5) Resolve branch collisions

- Run `git fetch origin`.
- Inspect `git branch -a`.
- If branch already exists locally or remotely, append `-MMDD`.
- Record the final branch.

## 6) Create branch while preserving staged work

If needed, preserve staged intent:

- `git stash push --keep-index -u`
- `git checkout -b <branch> origin/dev`
- restore stashed changes

## 7) Commit

Create one focused commit per repo for v1, using git skill commit conventions.

## 8) Push

Push with upstream:

- `git push -u origin <branch>`

## 9) Create PR

Create PR against `dev`:

- `gh pr create --base dev --head <branch> --title "<ticket title>" --body "<body>"`

PR body must include:

- `Monday: <url>` — only if the ticket contains a Monday item URL; omit this line entirely when the project has no Monday integration.
- `## Implementation Details` excerpt from `implementation.md`

## 10) Capture outputs

Capture, per shipped repo:

- `repo`
- `branch`
- `commitSha`
- `prUrl`

## 11) Write ship.md

Write to the injected `shipOutputPath` with this schema:

```markdown
## Branch

`<branch-name>`

## Pull Requests

| Repo | PR | Commit |
|---|---|---|
| backend | https://github.com/ewebinar/backend/pull/123 | abcd1234 |
| frontend | https://github.com/ewebinar/frontend/pull/124 | 56ef5678 |

## Notes

- skipped: cdn (no changes)
```

## 12) Completion marker

End with `[STATUS:COMPLETED]`.

If any failure occurs after step 1, include the precise error and end with `[STATUS:REQUIRES_ACTION]`.
