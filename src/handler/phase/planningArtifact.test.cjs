require("ts-node/register");

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { PhaseStatus } = require("../../enum/PhaseStatus");
const { reviewPlanningArtifact } = require("./planningArtifact");

test("reviewPlanningArtifact allows a finalized plan without open questions", () => {
  const result = reviewPlanningArtifact([
    "## Goal",
    "Move questions to planning.",
    "## Decisions Resolved",
    "- Guard blocks unresolved planning output.",
  ].join("\n"));

  assert.equal(result.ok, true);
  assert.equal(result.status, undefined);
  assert.equal(result.message, undefined);
});

test("reviewPlanningArtifact blocks non-empty Open Questions sections", () => {
  const result = reviewPlanningArtifact([
    "## Goal",
    "Move questions to planning.",
    "## Open Questions",
    "- Which pause status should we use?",
    "## Verification",
    "- build",
  ].join("\n"));

  assert.equal(result.ok, false);
  assert.equal(result.status, PhaseStatus.QUESTION);
  assert.match(result.message, /PLANNING must resolve open questions/);
  assert.match(result.message, /Which pause status should we use/);
  assert.doesNotMatch(result.message, /## Verification/);
});

test("reviewPlanningArtifact blocks empty Open Questions headings", () => {
  const result = reviewPlanningArtifact([
    "## Goal",
    "Move questions to planning.",
    "## Open Questions",
    "[STATUS:COMPLETED]",
  ].join("\n"));

  assert.equal(result.ok, false);
  assert.equal(result.status, PhaseStatus.QUESTION);
  assert.match(result.message, /must not include an `## Open Questions` section/);
});

test("reviewPlanningArtifact ignores lower-level references", () => {
  const result = reviewPlanningArtifact([
    "## Goal",
    "Document legacy plans.",
    "### Open Questions",
    "This is a subsection reference, not the final gate.",
  ].join("\n"));

  assert.equal(result.ok, true);
});
