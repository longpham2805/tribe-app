const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readHandlerSource() {
  return readFileSync(path.join(__dirname, "PhaseHandler.ts"), "utf8");
}

function readRepositorySource() {
  return readFileSync(path.join(__dirname, "../repository/PhaseRepository.ts"), "utf8");
}

test("trigger returns current phase without dispatch when active phase is already running", () => {
  const source = readHandlerSource();
  const runningNoopIndex = source.indexOf("activePhase.status === PhaseStatus.RUNNING");
  const dispatchIndex = source.indexOf("this.dispatch(phaseName, updatedTicket)");

  assert.notEqual(runningNoopIndex, -1);
  assert.notEqual(dispatchIndex, -1);
  assert.ok(runningNoopIndex < dispatchIndex);
  assert.match(source, /return \{ ticket: updatedTicket, phase: activePhase \};/);
});

test("trigger claims a non-running phase before dispatching", () => {
  const source = readHandlerSource();
  const claimIndex = source.indexOf("markRunningIfNotRunning(activePhase.id)");
  const dispatchIndex = source.indexOf("this.dispatch(phaseName, updatedTicket)");

  assert.notEqual(claimIndex, -1);
  assert.notEqual(dispatchIndex, -1);
  assert.ok(claimIndex < dispatchIndex);
  assert.match(source, /return \{ ticket: updatedTicket, phase: runningPhase \};/);
});

test("phase repository running claim is a conditional update", () => {
  const source = readRepositorySource();

  assert.match(source, /markRunningIfNotRunning\(id: number\)/);
  assert.match(source, /status: Not\(PhaseStatus\.RUNNING\)/);
  assert.match(source, /completedAt: IsNull\(\)/);
  assert.match(source, /status: PhaseStatus\.RUNNING/);
  assert.match(source, /result\.affected/);
});
