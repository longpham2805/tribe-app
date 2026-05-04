const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readHandlerSource() {
  return readFileSync(path.join(__dirname, "PhaseHandler.ts"), "utf8");
}

test("planning completion is reviewed before phase persistence and auto-advance", () => {
  const source = readHandlerSource();
  const reviewIndex = source.indexOf("this.reviewPhaseResult(activePhase, normalizedResult, ticket)");
  const applyIndex = source.indexOf("await this.applyResultToPhase(activePhase, result)", reviewIndex);
  const autoAdvanceIndex = source.indexOf("maybeAutoTriggerNext(ticket, phaseName", applyIndex);

  assert.notEqual(reviewIndex, -1);
  assert.notEqual(applyIndex, -1);
  assert.notEqual(autoAdvanceIndex, -1);
  assert.ok(reviewIndex < applyIndex);
  assert.ok(applyIndex < autoAdvanceIndex);
});

test("planning follow-up completion replaces artifact instead of appending stale questions", () => {
  const source = readHandlerSource();

  assert.match(source, /shouldReplaceArtifact = activePhase\.phaseName === TicketPhase\.PLANNING && result\.status === PhaseStatus\.COMPLETED/);
  assert.match(source, /if \(shouldReplaceArtifact \|\| !existsSync\(mdPath\)\) \{\s*writeFileSync\(mdPath, result\.output\);/s);
});

test("planning guard records pause event and returns QUESTION", () => {
  const source = readHandlerSource();

  assert.match(source, /reviewPlanningArtifact\(result\.output\)/);
  assert.match(source, /planning_guard_blocked/);
  assert.match(source, /status: review\.status \?\? PhaseStatus\.QUESTION/);
});
