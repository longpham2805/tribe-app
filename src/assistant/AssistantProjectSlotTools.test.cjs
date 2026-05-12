const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readSource(fileName) {
  return readFileSync(path.join(__dirname, fileName), "utf8");
}

function readShared(fileName) {
  return readFileSync(path.join(__dirname, "../tools", fileName), "utf8");
}

test("assistant exposes project and slot write tools from the shared registry", () => {
  const agentSource = readSource("AssistantAgentService.ts");
  const commandSource = readShared("commands.ts");

  for (const toolName of ["create_project", "update_project", "create_slot", "update_slot"]) {
    assert.match(commandSource, new RegExp(`name: "${toolName}"`));
  }

  assert.match(agentSource, /getAssistantToolDefinitions/);
  assert.match(agentSource, /executeToolCommand/);
  assert.match(commandSource, /confirmationRequired: true/);
  assert.match(commandSource, /pendingConfirmationToText/);
  assert.match(commandSource, /disabled.*blocks new ticket assignment/i);
  assert.match(commandSource, /status: slot\.disabled \? "disabled"/);
});

test("assistant chat confirmations do not create approval actions for tool writes", () => {
  const source = readSource("AssistantAgentService.ts");

  assert.match(source, /pendingToolConfirmation/);
  assert.match(source, /handlePendingConfirmationReply/);
  assert.match(source, /confirmed: true/);
  assert.doesNotMatch(source, /actionRepo\.create/);
  assert.doesNotMatch(source, /approvalRequired/);
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
  const source = readShared("ProjectSlotWriteService.ts");

  assert.match(source, /isAbsolute\(rootPath\)/);
  assert.match(source, /rootPath must be an absolute path/);
  assert.match(source, /input\.projectId === undefined \? defaultProjectId/);
  assert.match(source, /normalizeBoolean\(input\.disabled, "disabled"\)/);
  assert.match(source, /Project conflicts with existing project/);
});
