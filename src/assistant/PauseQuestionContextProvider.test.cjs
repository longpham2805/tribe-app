require("ts-node/register");

const assert = require("assert");
const { mkdirSync, rmSync, writeFileSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");
const { PauseQuestionContextProvider } = require("./PauseQuestionContextProvider");

const basePhase = {
  id: 1,
  ticketId: 113,
  phaseName: "IMPLEMENTATION",
  status: "QUESTION",
};

async function context(phase, ticket = null) {
  const provider = new PauseQuestionContextProvider({ findById: async () => ticket });
  return provider.getContext(113, { ...basePhase, ...phase });
}

(async () => {
  {
    const result = await context({
      lastMessage: "Should REQUIRES_ACTION always require explicit approval?\nOptions: yes, no\nDefault: yes",
    });
    assert.equal(result.exactQuestions.length, 1);
    assert.equal(result.exactQuestions[0].text, "Should REQUIRES_ACTION always require explicit approval?");
    assert.deepEqual(result.exactQuestions[0].options, ["yes", "no"]);
    assert.equal(result.exactQuestions[0].defaultOption, "yes");
    assert.equal(result.exactQuestions[0].requiresExplicitApproval, true);
  }

  {
    const result = await context({
      lastMessage: "Proceed with monitor-created assistant message? Options: yes/no Default: yes",
    });
    assert.equal(result.exactQuestions.length, 1);
    assert.equal(result.exactQuestions[0].text, "Proceed with monitor-created assistant message?");
    assert.deepEqual(result.exactQuestions[0].options, ["yes", "no"]);
    assert.equal(result.exactQuestions[0].defaultOption, "yes");
  }

  {
    const result = await context({
      lastMessage: [
        "1. Which log hint should be shown?",
        "- UI live feed",
        "- API route",
        "Default: API route",
        "2. Can I delete the stale fixture?",
        "Options: yes, no",
        "Default: no",
      ].join("\n"),
    });
    assert.equal(result.exactQuestions.length, 2);
    assert.equal(result.exactQuestions[0].requiresExplicitApproval, false);
    assert.equal(result.exactQuestions[1].requiresExplicitApproval, true);
  }

  {
    const result = await context({
      lastMessage: "Which model should relay pauses?\nA) Existing assistant\nB) New service\nRecommended: Existing assistant",
    });
    assert.deepEqual(result.exactQuestions[0].options, ["Existing assistant", "New service"]);
    assert.equal(result.exactQuestions[0].defaultOption, "Existing assistant");
  }

  {
    const result = await context({ lastMessage: "Paused near token=super-secret-value while asking what next?" });
    assert.equal(result.exactQuestions[0].text.includes("super-secret-value"), false);
    assert.equal(result.exactQuestions[0].text.includes("token=[REDACTED]"), true);
  }

  {
    const result = await context({ lastMessage: "Paused after validation failed without a question marker." });
    assert.equal(result.exactQuestions.length, 0);
    assert.ok(result.fallbackContext.includes("Exact question text unavailable"));
    assert.ok(result.inspectHint.includes("/api/tickets/113/files/_logs/IMPLEMENTATION"));
  }

  {
    const uid = `pause-context-test-${Date.now()}`;
    const dir = join(homedir(), ".tribe", uid);
    mkdirSync(join(dir, "logs"), { recursive: true });
    writeFileSync(join(dir, "implementation.md"), "## Work\nCan I use the existing monitor contract?\nOptions: yes, no\nDefault: yes\n[STATUS:QUESTION]\n");
    try {
      const result = await context({ lastMessage: null }, { uid });
      assert.equal(result.exactQuestions.length, 1);
      assert.equal(result.exactQuestions[0].source, "artifact");
      assert.equal(result.exactQuestions[0].text, "Can I use the existing monitor contract?");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log("PauseQuestionContextProvider fixtures passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
