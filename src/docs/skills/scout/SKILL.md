---
name: scout
description: "Efficiently explore an unfamiliar codebase. Use before brainstorming, planning, implementing, or reviewing to locate entry points, trace data flow, and find existing utilities to reuse. Progression: Glob → Grep → Read."
---

# Scout

A codebase search playbook. The aim is to answer a specific question with the fewest reads, not to build a complete mental model.

## Before searching

State the question in one sentence. Examples:
- "Where does the phase state machine transition from BRAINSTORM to PLANNING?"
- "Is there already a utility that parses the ticket frontmatter?"
- "Which file owns the WebSocket broadcast logic?"

If you cannot state it, you are not ready to search. Ask the user or re-read the prompt.

## Search progression

1. **Glob first** — cheapest. Find candidate files by name pattern. Examples: `src/**/*Handler.ts`, `**/*Agent*.ts`, `docs/**/*.md`.
2. **Grep second** — find the symbol, string, or regex in content. Prefer `output_mode: "files_with_matches"` to locate files, then `output_mode: "content"` with `-n` and `-C` to view hits in context.
3. **Read last** — only open a file once Glob+Grep point to it. Read the minimum range: if the file is large, use `offset` + `limit`. Do not read a 2000-line file to answer a 20-line question.

## When to delegate

Use the Task tool with `subagent_type: Explore` when:
- The scope is uncertain and you would otherwise open 5+ files speculatively
- The answer lives across three or more unrelated directories
- You need a summary, not raw hits

One Explore call with a precise prompt beats eight Grep calls.

## Patterns to map

When tracing a feature, map these four in order:
1. **Entry point** — route, handler, CLI command, or event listener that first receives input
2. **Dispatch** — where the entry hands off to domain logic
3. **Data transforms** — where the payload is parsed, validated, persisted
4. **Exit** — response writer, file write, broadcast, or side effect

Write these four locations (path:line) before proposing changes. A plan built without them is guessing.

## Reuse before inventing

Before proposing a new utility, helper, or abstraction, Grep for:
- The function you would name (e.g. `parseTicket`, `formatDate`)
- A close synonym (e.g. `extractFrontmatter`, `parseYaml`)
- The string literal you would produce (e.g. a header or magic value)

If any of these exists, the plan must either reuse it or state why it cannot.

## Stop conditions

Stop searching when any of these is true:
- The question is answered with one concrete path:line
- Three parallel searches returned nothing; the thing likely does not exist — say so and move on
- You have opened five files without finding the answer; step back and reformulate the question

## Do not

- Do not `cat` / `head` / `tail` via Bash — use Read
- Do not `grep` / `rg` via Bash — use Grep
- Do not list every match; cite the 1–3 that matter
- Do not build a "codebase tour" when the task asks one question
