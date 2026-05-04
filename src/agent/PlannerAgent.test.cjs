require("ts-node/register");

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { PlannerAgent } = require("./PlannerAgent");

test("planner prompt writes durable output to ticket planning.md", () => {
  const planningOutputPath = "/Users/mac/.tribe/ticket-uid/planning.md";
  const prompt = new PlannerAgent().buildPrompt({
    ticketContent: "# Ticket #1\n\nPlan this.",
    planningOutputPath,
  });

  assert.match(prompt, /Write your complete `planning\.md` artifact directly to this absolute path/);
  assert.match(prompt, new RegExp(planningOutputPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompt, /Do not create `plans\/` folders/);
  assert.doesNotMatch(prompt, /Plan Folder Naming/);
  assert.doesNotMatch(prompt, /set-active-plan/);
  assert.doesNotMatch(prompt, /Every `plan\.md` file MUST/);
});

test("planner follow-up prompt repeats planning.md output path", () => {
  const outputArtifactPath = "/Users/mac/.tribe/ticket-uid/planning.md";
  const prompt = new PlannerAgent().buildFollowupPrompt("Resolved answer.", {
    outputArtifactPath,
  });

  assert.match(prompt, /Write your complete `planning\.md` artifact directly to this absolute path/);
  assert.match(prompt, new RegExp(outputArtifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompt, /\[STATUS:COMPLETED\]/);
});
