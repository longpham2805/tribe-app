require("ts-node/register");

const assert = require("assert");
const { AssistantMonitorService } = require("./AssistantMonitorService");
const { PhaseStatus } = require("../enum/PhaseStatus");
const { TicketPhase } = require("../enum/TicketPhase");

const systemEvents = [];
const fakeAgent = { handleSystemEvent: async (event) => systemEvents.push(event) };
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

function createFakeMsgRepo() {
  const messages = [];
  return {
    messages,
    existsBySourceEventKey: async (key) => messages.some((message) => message.sourceEventKey === key),
    create: async (data) => {
      const message = { id: messages.length + 1, ...data };
      messages.push(message);
      return message;
    },
  };
}

const monitor = new AssistantMonitorService(fakeAgent, fakePauseProvider, fakeSummaryReader, fakeTicketRepo, createFakeMsgRepo());

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

(async () => {
  const msgRepo = createFakeMsgRepo();
  const pauseMonitor = new AssistantMonitorService(
    fakeAgent,
    {
      getContext: async () => ({
        exactQuestions: [{
          text: "Can I continue with deterministic assistant messages?",
          options: ["yes", "no"],
          defaultOption: "yes",
          requiresExplicitApproval: false,
          source: "lastMessage",
        }],
        fallbackContext: null,
        inspectHint: "inspect",
      }),
    },
    fakeSummaryReader,
    fakeTicketRepo,
    msgRepo,
  );

  await pauseMonitor.onPhaseUpdated(123, {
    id: 9,
    phaseName: TicketPhase.IMPLEMENTATION,
    status: PhaseStatus.QUESTION,
    lastMessage: "Can I continue with deterministic assistant messages?\nOptions: yes, no\nDefault: yes",
  });

  assert.equal(msgRepo.messages.length, 1);
  assert.equal(msgRepo.messages[0].sourceEventKey, `123:9:${PhaseStatus.QUESTION}:`);
  assert.equal(msgRepo.messages[0].severity, "warn");
  assert.equal(msgRepo.messages[0].ticketId, 123);
  assert.equal(msgRepo.messages[0].phaseId, 9);
  assert.deepEqual(msgRepo.messages[0].embeds, [{
    type: "question",
    text: "Can I continue with deterministic assistant messages?\nOptions: yes, no\nDefault: yes",
    ticketId: 123,
    phaseId: 9,
  }]);
  assert.ok(msgRepo.messages[0].content.includes("> Can I continue with deterministic assistant messages?"));
  assert.ok(msgRepo.messages[0].content.includes("Options: yes | no"));
  assert.ok(msgRepo.messages[0].content.includes("Default/recommended: yes"));

  await pauseMonitor.onPhaseUpdated(123, {
    id: 9,
    phaseName: TicketPhase.IMPLEMENTATION,
    status: PhaseStatus.QUESTION,
    lastMessage: "Can I continue with deterministic assistant messages?\nOptions: yes, no\nDefault: yes",
  });

  assert.equal(msgRepo.messages.length, 1);

  console.log("AssistantMonitorService fixtures passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
