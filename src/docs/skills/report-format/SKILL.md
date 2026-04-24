---
name: report-format
description: "Structure phase output markdown (planning.md, implementation.md). Use whenever a phase writes its final artifact. Defines frontmatter, section order, concision rules, and the status trailer contract."
---

# Report format

Every phase ends by writing a single markdown file to the ticket workspace. That file is read by the next phase, so shape matters.

## File naming

- PLANNING phase writes `planning.md`
- IMPLEMENTATION phase writes `implementation.md`

Write to the workspace root. Do not create subfolders. Do not rename.

## Frontmatter

Every report starts with YAML frontmatter:

```yaml
---
phase: {planning | implementation}
ticket: {ticket id or short slug}
status: {completed | blocked}
created: {YYYY-MM-DD}
---
```

Keep it to these four keys. Do not invent extra keys unless the downstream phase needs them.

## Body sections

Use level-2 headings. Include only the sections that carry signal for the next phase. Empty sections are noise.

| Phase | Required sections |
|---|---|
| planning | `## Goal`, `## Phases` (table), `## Risks`, `## Verification` |
| implementation | `## Changes` (files + lines), `## Verification` (commands + results), `## Follow-ups` |

Under each heading, use short prose or a table. No walls of text.

## Concision rules

- Sacrifice grammar for brevity in lists. `"Add ws broadcast on phase change — ~20 LOC"` beats a sentence.
- Cut filler: "In order to", "it is important to note that", "I have completed the following".
- One line per file when listing changes. Path + one-phrase verb.
- No apology prose, no recap of the ticket, no meta-commentary on the process.

## Tables over bullets

When comparing options, risks, or phases, use a table:

```
| Option | Complexity | Trade-off |
|---|---|---|
| A | low | fewer features |
| B | med | adds a dep |
```

Tables force apples-to-apples. Bullets allow hand-waving.

## Link to files, not explanations

When you reference code, link the path:line directly — `src/handler/PhaseHandler.ts:142`. The reader can open it; you do not need to paraphrase.

## Status trailer

The report body does not contain the `[STATUS:...]` tag. The trailer is appended by the phase runner on your final reply, not written into the markdown file.

## Minimal template

```markdown
---
phase: brainstorm
ticket: add-realtime-notifications
status: completed
created: 2026-04-23
---

## Goal
<1–3 sentences>

## Phases
| # | Phase | Files owned | Blocked by | Risk | Verification |
|---|---|---|---|---|---|
| 1 | ... | ... | ... | ... | ... |
```

If the template feels too short for your ticket, the ticket is probably bigger than one phase — surface that before inflating the report.
