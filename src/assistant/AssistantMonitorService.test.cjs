require("ts-node/register");

const assert = require("assert");
const { AssistantMonitorService } = require("./AssistantMonitorService");
const { PhaseStatus } = require("../enum/PhaseStatus");
const { TicketPhase } = require("../enum/TicketPhase");

const fakeAgent = { handleSystemEvent: async () => undefined };
const fakePauseProvider = { getContext: async () => null };
const fakeSummaryReader = {
  read: () => null,
  formatForPrompt: () => [
    "Completion artifact summary from implementation.md:",
    "- Added deterministic summaries",
    "- Verified with npm run build",
  ].join("\n"),
};
const fakeTicketRepo = { findById: async () => ({ uid: "ticket-115" }) };

const monitor = new AssistantMonitorService(fakeAgent, fakePauseProvider, fakeSummaryReader, fakeTicketRepo);

{
  const description = monitor.buildEventDescription(
    115,
    { id: 7, phaseName: TicketPhase.IMPLEMENTATION, status: PhaseStatus.COMPLETED },
    "completed",
    null,
    { phaseName: TicketPhase.IMPLEMENTATION, summaryLines: ["Added deterministic summaries"], sourcePath: "implementation.md", truncated: false },
  );

  assert.ok(description.includes("Ticket #115 phase IMPLEMENTATION completed successfully."));
  assert.ok(description.includes("Completion artifact summary from implementation.md"));
  assert.ok(description.includes("<=5 bullets"));
}

{
  const description = monitor.buildEventDescription(
    115,
    { id: 8, phaseName: TicketPhase.PLANNING, status: PhaseStatus.ERROR, lastMessage: "boom" },
    "error",
    null,
    null,
  );

  assert.ok(description.includes("has entered ERROR state"));
  assert.ok(!description.includes("Completion artifact summary"));
}

{
  const description = monitor.buildEventDescription(
    115,
    { id: 9, phaseName: TicketPhase.PLANNING, status: PhaseStatus.QUESTION, lastMessage: null },
    "question",
    {
      exactQuestions: [{
        text: "Deploy now?",
        options: ["yes", "no"],
        defaultOption: "no",
        requiresExplicitApproval: true,
        source: "lastMessage",
      }],
      fallbackContext: null,
      inspectHint: "inspect",
    },
    null,
  );

  assert.ok(description.includes("Deploy now?"));
  assert.ok(!description.includes("Completion artifact summary"));
}

console.log("AssistantMonitorService fixtures passed");
