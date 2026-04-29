---
name: research
description: "Gather external information with source discipline: prefer primary sources, triangulate facts, cite everything. Use when a phase needs library docs, protocol specs, industry patterns, or recent changes the codebase cannot answer."
---

# Research

Playbook for the researcher agent or any phase that needs external facts. Persona rules live in `docs/agents/researcher.md`.

## When to research

Only when the answer is not in the codebase. Research is expensive; scouting is cheap. In order:
1. Can `scout` / `Grep` in this repo answer it? → stop, do not research.
2. Is it in project docs? → read those.
3. Is the answer framework/library/standard? → research.

## Source hierarchy

Prefer higher tiers. Cite the tier you used.

1. **Primary** — official docs, RFCs, source code of the library, vendor API reference.
2. **Secondary** — maintainer blogs, conference talks, project-issue discussions.
3. **Tertiary** — third-party tutorials, Stack Overflow, AI-generated summaries.

If a fact comes only from tier 3, mark it unconfirmed and note what a tier-1 source would say.

## Triangulation

Any load-bearing fact needs two independent sources. Examples of "load-bearing":
- API rate limits, quotas, pricing
- Deprecation dates and version support windows
- Security-relevant behavior (auth flows, token scopes)
- Performance claims

A single blog post is not evidence. Two blog posts quoting each other is one source.

## Tools

- `WebFetch` — pull a specific URL. Use when you already have the canonical doc URL.
- `WebSearch` — find candidate sources. Follow up with `WebFetch` on the best hits.
- `Read` — local project docs and explicit ticket-provided reference files.

## Citation format

Every non-trivial claim carries a citation inline:

```
The token expiry is 1 hour ([spec §4.2](https://example.com/spec#4-2)).
```

No citation = no claim. "It is well known that…" is not a citation.

## <HARD-GATE>

Do NOT implement based on research output. Research writes a report; implementation is a separate phase.
Do NOT paraphrase without citing. If a source is behind a login and you cannot verify, say so and mark the fact provisional.

## Output

A report with sections:
- `## Question` — the specific question(s) asked
- `## Findings` — the answers, each with citations
- `## Uncertainty` — what could not be confirmed and why
- `## Sources` — the final list, with the tier for each

Sacrifice grammar for brevity in the findings list; citations must stay intact.

End with `[STATUS:COMPLETED]` if the question is answered, or `[STATUS:QUESTION]` if the question itself needs refinement.
