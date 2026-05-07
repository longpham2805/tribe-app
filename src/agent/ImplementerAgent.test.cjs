require("ts-node/register");

const test = require("node:test");
const assert = require("node:assert/strict");
const { ImplementerAgent } = require("./ImplementerAgent");

const checklistOutputPath = "/tmp/ticket/implementation-testing-checklist.md";
const shipOutputPath = "/tmp/ticket/ship.md";

test("implementer prompt includes implementation checklist and ship artifact paths", () => {
  const prompt = new ImplementerAgent().buildPrompt({
    ticketContent: "# Ticket #170",
    checklistOutputPath,
    shipOutputPath,
  });

  assert.match(prompt, /# Ticket #170/);
  assert.match(prompt, new RegExp(checklistOutputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompt, new RegExp(shipOutputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompt, /implementation-testing-checklist\.md/);
  assert.match(prompt, /ship\.md/);
  assert.match(prompt, /\[STATUS:COMPLETED\]/);
});
