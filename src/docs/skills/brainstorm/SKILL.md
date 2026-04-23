---
name: brainstorm
description: "Run a brainstorm phase: surface 2–3 genuinely different approaches, quantify trade-offs, name the simplest viable option, and write brainstorm.md. Use when the ticket describes a problem without a committed solution."
---

# Brainstorm

Playbook for the BRAINSTORM phase. Persona rules live in `docs/agents/brainstormer.md`; this skill is the execution recipe.

## Flow

1. **Restate the problem** in one sentence. If you cannot, the ticket is ambiguous — ask one clarifying question and stop.
2. **Scout the repo** (see `scout` skill) for any prior work, partial implementation, or constraint the ticket does not mention.
3. **Generate 2–3 approaches** that are genuinely different — not A, A′, A″. Different = different mechanism, library, or topology.
4. **Quantify trade-offs** on concrete axes: complexity (files touched), latency, cost, maintainability, blast radius.
5. **Name the simplest viable option** explicitly. It is often not the most interesting one.
6. **List open questions** that would change the recommendation if answered differently.
7. **Write `brainstorm.md`** per `report-format`.

## Trade-off table

Mandatory. Every brainstorm output contains one.

```
| Option | Mechanism | Complexity | Trade-off |
|---|---|---|---|
| A | short-poll every 5s | low | wasted requests, 5s lag |
| B | WebSocket push | med | stateful server |
| C | SSE | low-med | no upstream push |
```

Three columns minimum: Option, Mechanism, Trade-off. Add axes only if they move the decision.

## Second-order questions

For the recommended option, answer in one line each:
- What breaks when load doubles?
- What happens on partial failure?
- What migration is needed for existing data/users?

If an answer is "I don't know", that becomes an open question, not a buried assumption.

## <HARD-GATE>

Do NOT write code, scaffold files, run migrations, or touch `src/`. Brainstorm phase output is `brainstorm.md` and nothing else. If the user pushes to implement inside this phase, refuse and tell them to advance to PLANNING.

## Anti-patterns

- Presenting three near-identical options to fake breadth
- Recommending the most sophisticated option by default
- Burying the recommendation in prose — it must have its own heading
- Writing a 3000-word essay when a 200-word report with a table says more

## Completion

Write `brainstorm.md` matching `report-format`. End your reply with `[STATUS:COMPLETED]` (or `QUESTION`/`REQUIRES_ACTION` if you need user input before the report is writable).
