require("ts-node/register");

const assert = require("assert");
const { mkdirSync, rmSync, writeFileSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");
const { TicketPhase } = require("../enum/TicketPhase");
const { PhaseCompletionSummaryReader } = require("./PhaseCompletionSummary");

const reader = new PhaseCompletionSummaryReader();

function withTicketDir(uid, files, fn) {
  const dir = join(homedir(), ".tribe", uid);
  mkdirSync(dir, { recursive: true });
  for (const [fileName, content] of Object.entries(files)) {
    writeFileSync(join(dir, fileName), content);
  }
  try {
    fn();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}


{
  const uid = `phase-summary-planning-${Date.now()}`;
  withTicketDir(uid, {
    "planning.md": [
      "## Goal",
      "Completion notifications should explain what changed without extra clicks.",
      "## Recommended Approach",
      "- Reuse existing assistant monitor contract",
      "- Avoid database migrations",
      "[STATUS:COMPLETED]",
    ].join("\n"),
  }, () => {
    const summary = reader.read(uid, TicketPhase.PLANNING);
    assert.ok(summary);
    const prompt = reader.formatForPrompt(summary);
    assert.ok(prompt.includes("Completion artifact summary from planning.md"));
    assert.ok(prompt.includes("Completion notifications should explain what changed"));
    assert.ok(prompt.includes("Reuse existing assistant monitor contract"));
    assert.ok(!prompt.includes("[STATUS:COMPLETED]"));
  });
}

{
  const uid = `phase-summary-implementation-${Date.now()}`;
  withTicketDir(uid, {
    "implementation.md": [
      "## Changes",
      "- `src/assistant/PhaseCompletionSummary.ts` — add deterministic summaries",
      "- token=super-secret-value is redacted",
      "## Verification",
      "- `npm run build` → exit 0",
    ].join("\n"),
  }, () => {
    const summary = reader.read(uid, TicketPhase.IMPLEMENTATION);
    assert.ok(summary);
    const prompt = reader.formatForPrompt(summary);
    assert.ok(prompt.includes("deterministic summaries"));
    assert.ok(prompt.includes("token=[REDACTED]"));
    assert.ok(!prompt.includes("super-secret-value"));
    assert.ok(prompt.length <= 900);
  });
}

{
  const uid = `phase-summary-ship-${Date.now()}`;
  withTicketDir(uid, {
    "ship.md": [
      "## Branch",
      "`feature/ticket-115-summary`",
      "## Pull Requests",
      "| Repo | PR | Commit |",
      "| --- | --- | --- |",
      "| org/app | https://github.com/org/app/pull/115 | `abc123def` |",
      "## Summary",
      "- Shipped concise phase completion summaries",
    ].join("\n"),
  }, () => {
    const summary = reader.read(uid, TicketPhase.SHIP);
    assert.ok(summary);
    const prompt = reader.formatForPrompt(summary);
    assert.ok(prompt.includes("Branch: feature/ticket-115-summary"));
    assert.ok(prompt.includes("PR: org/app https://github.com/org/app/pull/115 @ abc123def"));
    assert.ok(prompt.includes("Shipped concise phase completion summaries"));
  });
}

{
  const uid = `phase-summary-missing-${Date.now()}`;
  withTicketDir(uid, {}, () => {
    assert.equal(reader.read(uid, TicketPhase.PLANNING), null);
  });
}

console.log("PhaseCompletionSummary fixtures passed");
