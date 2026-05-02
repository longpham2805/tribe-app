const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readSource(fileName) {
  return readFileSync(path.join(__dirname, fileName), "utf8");
}

test("assistant exposes project and slot write tools with approval wording", () => {
  const source = readSource("AssistantAgentService.ts");

  for (const toolName of ["create_project", "update_project", "create_slot", "update_slot"]) {
    assert.match(source, new RegExp(`name: "${toolName}"`));
  }

  assert.match(source, /explain(?:ing)? the intended write/i);
  assert.match(source, /Risky updates to running projects are proposed for explicit approval/i);
  assert.match(source, /Occupied slot routing updates require explicit approval/i);
});

test("assistant approval executor only accepts project slot OTHER payloads", () => {
  const source = readSource("AssistantAgentService.ts");

  assert.match(source, /payload\.kind !== "project_slot_write"/);
  assert.match(source, /action\.type === "OTHER" && this\.isProjectSlotActionPayload\(payload\)/);
  assert.match(source, /this\.projectSlotWriteService\.execute\(payload\.intent\)/);
});

test("project slot policy gates occupied slots and running project risky fields", () => {
  const source = readSource("AssistantPolicyService.ts");

  assert.match(source, /slot\.currentTicketId != null && riskyFields\.length > 0/);
  assert.match(source, /project\.hasRunningTickets && riskyFields\.length > 0/);
  assert.match(source, /mondayBoardIds/);
  assert.match(source, /rules/);
  assert.match(source, /techStack/);
  assert.match(source, /fastTrack/);
});

test("write service validates absolute root paths and active project defaults", () => {
  const source = readSource("AssistantProjectSlotWriteService.ts");

  assert.match(source, /isAbsolute\(rootPath\)/);
  assert.match(source, /rootPath must be an absolute path/);
  assert.match(source, /input\.projectId === undefined \? defaultProjectId/);
  assert.match(source, /Project conflicts with existing project/);
});
