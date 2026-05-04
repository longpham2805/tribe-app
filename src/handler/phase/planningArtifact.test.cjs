require("ts-node/register");

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { PhaseStatus } = require("../../enum/PhaseStatus");
const { reviewPlanningArtifact } = require("./planningArtifact");

function validActionablePlan(extraLines = []) {
  return [
    "## Goal",
    "Make planning artifacts actionable before implementation starts.",
    "## Decisions / Assumptions",
    "- Use a lightweight string scanner.",
    "## Discovery",
    "- Entry: src/handler/PhaseHandler.ts:803",
    "- Guard: src/handler/phase/planningArtifact.ts:11",
    "## Phases",
    "| # | Phase | Files owned | Blocked by | Risk | Verification |",
    "|---|---|---|---|---|---|",
    "| 1 | Add planning guard | src/handler/phase/planningArtifact.ts | none | low | `npm test -- src/handler/phase/planningArtifact.test.cjs` |",
    "## Implementation Tasks",
    "### Task 1: Add planning artifact guard",
    "- [ ] Update `src/handler/phase/planningArtifact.ts` to reject non-actionable plans.",
    "  Command/check: `npm test -- src/handler/phase/planningArtifact.test.cjs`",
    "  Expected: guard tests pass.",
    ...extraLines,
    "## Risks / Rollback",
    "- Risk: false positive guard pause. Rollback by reverting the guard change.",
    "## Verification",
    "- `npm test -- src/handler/phase/planningArtifact.test.cjs`",
    "  Expected: all planning guard tests pass.",
  ].join("\n");
}

test("reviewPlanningArtifact allows a valid Superpowers-style actionable plan", () => {
  const result = reviewPlanningArtifact(validActionablePlan());

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
    validActionablePlan(),
    "### Open Questions",
    "This is a subsection reference, not the final gate.",
  ].join("\n"));

  assert.equal(result.ok, true);
});

test("reviewPlanningArtifact blocks placeholder text", () => {
  const result = reviewPlanningArtifact(validActionablePlan([
    "- [ ] Replace TBD with the real command before completion.",
  ]));

  assert.equal(result.ok, false);
  assert.equal(result.status, PhaseStatus.QUESTION);
  assert.match(result.message, /non-actionable artifact/);
  assert.match(result.message, /TBD/);
});

test("reviewPlanningArtifact blocks missing Implementation Tasks section", () => {
  const result = reviewPlanningArtifact([
    "## Goal",
    "Make planning artifacts actionable.",
    "## Decisions / Assumptions",
    "- Use a string scanner.",
    "## Discovery",
    "- Guard: src/handler/phase/planningArtifact.ts:11",
    "## Phases",
    "| # | Phase | Files owned | Blocked by | Risk | Verification |",
    "|---|---|---|---|---|---|",
    "| 1 | Add guard | src/handler/phase/planningArtifact.ts | none | low | unit test |",
    "## Risks / Rollback",
    "- Rollback by reverting the guard change.",
    "## Verification",
    "- `npm test -- src/handler/phase/planningArtifact.test.cjs`",
  ].join("\n"));

  assert.equal(result.ok, false);
  assert.equal(result.status, PhaseStatus.QUESTION);
  assert.match(result.message, /Implementation Tasks/);
});

test("reviewPlanningArtifact blocks Implementation Tasks without checkbox steps", () => {
  const result = reviewPlanningArtifact([
    "## Goal",
    "Make planning artifacts actionable.",
    "## Decisions / Assumptions",
    "- Use a string scanner.",
    "## Discovery",
    "- Guard: src/handler/phase/planningArtifact.ts:11",
    "## Phases",
    "| # | Phase | Files owned | Blocked by | Risk | Verification |",
    "|---|---|---|---|---|---|",
    "| 1 | Add guard | src/handler/phase/planningArtifact.ts | none | low | unit test |",
    "## Implementation Tasks",
    "### Task 1: Add guard",
    "Update the guard and tests.",
    "## Risks / Rollback",
    "- Rollback by reverting the guard change.",
    "## Verification",
    "- `npm test -- src/handler/phase/planningArtifact.test.cjs`",
  ].join("\n"));

  assert.equal(result.ok, false);
  assert.equal(result.status, PhaseStatus.QUESTION);
  assert.match(result.message, /checkbox step/);
});

test("reviewPlanningArtifact blocks missing Verification section", () => {
  const result = reviewPlanningArtifact([
    "## Goal",
    "Make planning artifacts actionable.",
    "## Decisions / Assumptions",
    "- Use a string scanner.",
    "## Discovery",
    "- Guard: src/handler/phase/planningArtifact.ts:11",
    "## Phases",
    "| # | Phase | Files owned | Blocked by | Risk | Verification |",
    "|---|---|---|---|---|---|",
    "| 1 | Add guard | src/handler/phase/planningArtifact.ts | none | low | unit test |",
    "## Implementation Tasks",
    "### Task 1: Add guard",
    "- [ ] Update `src/handler/phase/planningArtifact.ts`.",
    "## Risks / Rollback",
    "- Rollback by reverting the guard change.",
  ].join("\n"));

  assert.equal(result.ok, false);
  assert.equal(result.status, PhaseStatus.QUESTION);
  assert.match(result.message, /Verification/);
});
