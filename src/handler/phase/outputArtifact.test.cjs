require("ts-node/register");

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  selectPhaseOutputResult,
  snapshotOutputArtifact,
} = require("./outputArtifact");
const { PhaseStatus } = require("../../enum/PhaseStatus");

function rawResult(output) {
  return {
    output,
    status: PhaseStatus.COMPLETED,
    message: null,
    sessionUuid: "session-1",
  };
}

function withTempDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "tribe-output-artifact-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("selectPhaseOutputResult prefers a newly created artifact file", () => {
  withTempDir((dir) => {
    const artifactPath = path.join(dir, "planning.md");
    const snapshot = snapshotOutputArtifact(artifactPath);
    writeFileSync(artifactPath, "full plan from file");

    const selected = selectPhaseOutputResult(rawResult("stdout summary"), artifactPath, snapshot);

    assert.equal(selected.source, "file");
    assert.equal(selected.result.output, "full plan from file");
  });
});

test("selectPhaseOutputResult prefers a modified artifact file", () => {
  withTempDir((dir) => {
    const artifactPath = path.join(dir, "planning.md");
    writeFileSync(artifactPath, "old plan");
    const snapshot = snapshotOutputArtifact(artifactPath);
    writeFileSync(artifactPath, "new full plan");

    const selected = selectPhaseOutputResult(rawResult("stdout summary"), artifactPath, snapshot);

    assert.equal(selected.source, "file");
    assert.equal(selected.result.output, "new full plan");
  });
});

test("selectPhaseOutputResult falls back to stdout when artifact is unchanged", () => {
  withTempDir((dir) => {
    const artifactPath = path.join(dir, "planning.md");
    writeFileSync(artifactPath, "existing plan");
    const snapshot = snapshotOutputArtifact(artifactPath);

    const selected = selectPhaseOutputResult(rawResult("stdout full plan"), artifactPath, snapshot);

    assert.equal(selected.source, "stdout");
    assert.equal(selected.result.output, "stdout full plan");
  });
});
