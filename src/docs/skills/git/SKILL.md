---
name: git
description: "Stage, commit, and push changes safely. Use when a phase produces code ready to land. Enforces conventional commits, specific-file staging, no force-push to main, no destructive commands without explicit authorization."
---

# Git

Playbook for the git-manager agent or any phase that commits code. Persona rules live in `docs/agents/git-manager.md`.

## Pre-flight

1. `git status` — understand current tree.
2. `git diff` (unstaged) and `git diff --staged` — confirm what will and will not be committed.
3. `git log -5 --oneline` — learn the repo's commit-message style.
4. Confirm the current branch. Never commit directly on `main` or `master` without an explicit user instruction.

## Staging

- Stage specific files by path. `git add src/foo.ts src/bar.ts`.
- Do **not** use `git add -A`, `git add .`, or `git add -u`. They pick up secrets, build artifacts, and unrelated edits.
- Before staging, scan the file list for secrets: `.env`, `*.pem`, `credentials*`, `*.key`, large binaries. If any appear, stop and ask the user.

## Commit message

Format: `type(scope): subject` in the imperative mood.

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, `ci`.

Examples matching this repo's style (run `git log --oneline` to confirm):
- `feat(realtime): websocket phase streaming`
- `fix(vite): ignore expected websocket proxy disconnect errors`
- `refactor(agent): source phase prompts from docs/agents`

Subject line:
- ≤72 chars, no trailing period
- Present tense, imperative ("add", not "added")
- The *why* — not a mechanical restatement of the diff

If the change is non-trivial, add a body: blank line, then 1–3 short paragraphs explaining the motivation. Wrap at 72 cols.

Pass the message via a heredoc to preserve formatting.

## What to never do without explicit authorization

- `git push --force` / `--force-with-lease`
- `git reset --hard` on work that is not purely local and committed
- `git commit --amend` after pushing
- `git rebase -i` (requires interactive input, unavailable in this shell)
- `git checkout .` / `git restore .` / `git clean -f` (destroys uncommitted work)
- `--no-verify` to skip hooks — if a hook fails, fix the cause

If the user explicitly asks for one of these, proceed — but confirm the target branch first. Never force-push to `main` or `master`.

## Hook failures

If a pre-commit or commit-msg hook fails: the commit did not happen. Fix the underlying issue, stage the fix, and create a **new** commit. Do not `--amend` — there is nothing to amend.

## Pushing

- `git push -u origin <branch>` on first push of a new branch.
- Do not push unless asked. Committing ≠ pushing. The user decides when the work leaves their machine.

## <HARD-GATE>

Never bypass signing, hooks, or branch protections. Never push secrets. Never force-push to `main`/`master`. Never take a destructive action the user did not authorize, even to "unblock" a task.

## Output

Report:
- `## Staged` — the exact file list
- `## Commit` — hash + subject line after commit
- `## Next` — push instruction (if the user asked to push) or "local only"

End with `[STATUS:COMPLETED]` after `git status` shows a clean tree matching the intent.
