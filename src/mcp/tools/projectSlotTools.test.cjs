const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readTool(fileName) {
  return readFileSync(path.join(__dirname, fileName), "utf8");
}

test("MCP project tools expose create/update parity", () => {
  const source = readTool("projectTools.ts");

  assert.match(source, /"create_project"/);
  assert.match(source, /"update_project"/);
  assert.match(source, /AssistantProjectSlotWriteService/);
  assert.match(source, /operation: "create_project"/);
  assert.match(source, /operation: "update_project"/);
});

test("MCP slot tools expose create/update parity", () => {
  const source = readTool("slotTools.ts");

  assert.match(source, /"create_slot"/);
  assert.match(source, /"update_slot"/);
  assert.match(source, /absolute rootPath/);
  assert.match(source, /operation: "create_slot"/);
  assert.match(source, /operation: "update_slot"/);
});

test("REST and client slot update support projectId PATCH", () => {
  const routeSource = readFileSync(path.join(__dirname, "../../routes/slots.ts"), "utf8");
  const clientSource = readFileSync(path.join(__dirname, "../../../client/src/api/slots.ts"), "utf8");

  assert.match(routeSource, /PATCH \/api\/slots\/:id  \{ name\?, rootPath\?, projectId\? \}/);
  assert.match(routeSource, /projectId: typeof projectId === "number" \|\| projectId === null \? projectId : undefined/);
  assert.match(clientSource, /projectId\?: number \| null/);
});
