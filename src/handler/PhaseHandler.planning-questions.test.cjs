const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readHandlerSource() {
  return readFileSync(path.join(__dirname, "PhaseHandler.ts"), "utf8");
}

test("planning completion is reviewed before phase persistence and auto-advance", () => {
  const source = readHandlerSource();
  const selectionIndex = source.indexOf("selectPhaseOutputResult(normalizedResult, outputPath, outputSnapshot)");
  const reviewIndex = source.indexOf("this.reviewPhaseResult(activePhase, selectedResult, ticket)");
  const applyIndex = source.indexOf("await this.applyResultToPhase(activePhase, result)", reviewIndex);
  const autoAdvanceIndex = source.indexOf("maybeAutoTriggerNext(ticket, phaseName", applyIndex);

  assert.notEqual(selectionIndex, -1);
  assert.notEqual(reviewIndex, -1);
  assert.notEqual(applyIndex, -1);
  assert.notEqual(autoAdvanceIndex, -1);
  assert.ok(selectionIndex < reviewIndex);
  assert.ok(reviewIndex < applyIndex);
  assert.ok(applyIndex < autoAdvanceIndex);
});

test("planning follow-up review uses selected artifact output before persistence", () => {
  const source = readHandlerSource();
  const selectionIndex = source.indexOf("selectPhaseOutputResult(rawResult, mdPath, outputSnapshot)");
  const reviewIndex = source.indexOf("this.reviewPhaseResult(activePhase, result, ticket)", selectionIndex);
  const writeIndex = source.indexOf("writeFileSync(mdPath, reviewedResult.output)", selectionIndex);

  assert.notEqual(selectionIndex, -1);
  assert.notEqual(reviewIndex, -1);
  assert.notEqual(writeIndex, -1);
  assert.ok(selectionIndex < reviewIndex);
  assert.ok(reviewIndex < writeIndex);
});

test("planning follow-up completion replaces artifact instead of appending stale questions", () => {
  const source = readHandlerSource();

  assert.match(source, /shouldReplaceArtifact = activePhase\.phaseName === TicketPhase\.PLANNING && reviewedResult\.status === PhaseStatus\.COMPLETED/);
  assert.match(source, /if \(source === "file"\) \{\s*log\(`\$\{activePhase\.phaseName\.toLowerCase\(\)\} follow-up output kept from \$\{mdPath\}`\);\s*\} else if \(shouldReplaceArtifact \|\| !existsSync\(mdPath\)\) \{\s*writeFileSync\(mdPath, reviewedResult\.output\);/s);
});

test("planning guard records pause event and returns QUESTION", () => {
  const source = readHandlerSource();

  assert.match(source, /reviewPlanningArtifact\(result\.output\)/);
  assert.match(source, /planning_guard_blocked/);
  assert.match(source, /status: review\.status \?\? PhaseStatus\.QUESTION/);
});
