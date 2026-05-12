const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readTool(fileName) {
  return readFileSync(path.join(__dirname, fileName), "utf8");
}

test("MCP project tools expose create/update parity", () => {
  const source = readTool("projectTools.ts");
  const commandSource = readFileSync(path.join(__dirname, "../../tools/commands.ts"), "utf8");

  assert.match(source, /"create_project"/);
  assert.match(source, /"update_project"/);
  assert.match(source, /registerSharedMcpTools/);
  assert.match(commandSource, /name: "create_project"/);
  assert.match(commandSource, /name: "update_project"/);
  assert.match(commandSource, /operation: "create_project"/);
  assert.match(commandSource, /operation: "update_project"/);
  assert.doesNotMatch(source, /ProjectRepository/);
});

test("MCP slot tools expose create/update parity", () => {
  const source = readTool("slotTools.ts");
  const commandSource = readFileSync(path.join(__dirname, "../../tools/commands.ts"), "utf8");

  assert.match(source, /"create_slot"/);
  assert.match(source, /"update_slot"/);
  assert.match(source, /registerSharedMcpTools/);
  assert.match(commandSource, /Absolute workspace root path/);
  assert.match(commandSource, /operation: "create_slot"/);
  assert.match(commandSource, /operation: "update_slot"/);
  assert.match(commandSource, /disabled: bool/);
  assert.match(commandSource, /status: slot\.disabled \? "disabled"/);
});

test("REST and client slot update support projectId and disabled PATCH", () => {
  const routeSource = readFileSync(path.join(__dirname, "../../routes/slots.ts"), "utf8");
  const clientSource = readFileSync(path.join(__dirname, "../../../client/src/api/slots.ts"), "utf8");

  assert.match(routeSource, /PATCH \/api\/slots\/:id/);
  assert.match(routeSource, /runRestTool\("update_slot"/);
  assert.match(routeSource, /slotId: id/);
  assert.match(clientSource, /projectId\?: number \| null/);
  assert.match(clientSource, /disabled\?: boolean/);
});

test("slot assignment excludes disabled slots", () => {
  const repositorySource = readFileSync(path.join(__dirname, "../../repository/SlotRepository.ts"), "utf8");
  const serviceSource = readFileSync(path.join(__dirname, "../../service/SlotService.ts"), "utf8");

  assert.match(repositorySource, /disabled: false/);
  assert.match(serviceSource, /Slot \$\{slot\.id\} disabled .*skipping promotion/);
});
