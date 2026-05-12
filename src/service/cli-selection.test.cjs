const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readSource(relativePath) {
  return readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("Monday imports resolve Auto against available CLIs before creating tickets", () => {
  const source = readSource("service/MondayImportService.ts");
  const resolveIndex = source.indexOf("const cliType = await this.resolveCliType");
  const createIndex = source.indexOf("await this.ticketRepo.create", resolveIndex);

  assert.notEqual(resolveIndex, -1);
  assert.notEqual(createIndex, -1);
  assert.ok(resolveIndex < createIndex);
  assert.match(source, /pickCliForNewTicket\(this\.ticketRepo, appState\.availableCliTypes\)/);
  assert.match(source.slice(createIndex), /cliType,/);
});

test("phase auto-advance can retarget unstarted tickets when only one CLI is enabled", () => {
  const source = readSource("handler/PhaseHandler.ts");
  const autoAdvanceIndex = source.indexOf("private async maybeAutoTriggerNext");
  const ensureIndex = source.indexOf("await this.ensureCliAvailable(ticket);", autoAdvanceIndex);
  const triggerIndex = source.indexOf("await this.trigger(ticket.id, nextPhase);", ensureIndex);

  assert.notEqual(autoAdvanceIndex, -1);
  assert.notEqual(ensureIndex, -1);
  assert.notEqual(triggerIndex, -1);
  assert.ok(ensureIndex < triggerIndex);
  assert.match(source, /appState\.availableCliTypes\.length === 1 \? appState\.availableCliTypes\[0\] : null/);
  assert.match(source, /this\.ticketRepo\.update\(ticket\.id, \{ cliType: nextCliType \}\)/);
});
