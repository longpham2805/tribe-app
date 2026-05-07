require("ts-node/register");

const assert = require("assert");
const {
  dedupePullRequestArtifacts,
  getPullRequestArtifactKey,
  parseShipArtifacts,
} = require("./artifacts");

{
  const pullRequests = dedupePullRequestArtifacts([
    { repo: "org/app", prUrl: "https://github.com/org/app/pull/112", commitSha: "abc1234" },
    { repo: "org/app", prUrl: "https://github.com/org/app/pull/112", commitSha: "def5678" },
  ]);

  assert.equal(pullRequests.length, 1);
  assert.equal(pullRequests[0].commitSha, "abc1234");
}

{
  const key = getPullRequestArtifactKey({
    repo: "org/app",
    prUrl: "https://github.com/org/app/pull/112/?foo=bar#notes.",
  });

  assert.equal(key, "github:org/app#112");
}

{
  const pullRequests = dedupePullRequestArtifacts([
    { repo: "org/app", prUrl: "https://github.com/org/app/pull/112", commitSha: "abc1234" },
    { repo: "org/api", prUrl: "https://github.com/org/api/pull/112", commitSha: "def5678" },
    { repo: "org/app", prUrl: "https://github.com/org/app/pull/113", commitSha: "fed9876" },
  ]);

  assert.equal(pullRequests.length, 3);
}

{
  const pullRequests = dedupePullRequestArtifacts([
    { repo: "reviews", prUrl: "https://review.example.com/changes/112?view=full#discussion", commitSha: "abc1234" },
    { repo: "reviews", prUrl: "https://review.example.com/changes/112/", commitSha: "def5678" },
  ]);

  assert.equal(pullRequests.length, 1);
  assert.equal(pullRequests[0].prUrl, "https://review.example.com/changes/112");
}

{
  const artifacts = parseShipArtifacts([
    "## Branch",
    "`feature/ticket-112`",
    "## Pull Requests",
    "| Repo | PR | Commit |",
    "| --- | --- | --- |",
    "| org/app | https://github.com/org/app/pull/112?utm=feed | `abc1234` |",
    "## Notes",
    "Shipped at https://github.com/org/app/pull/112.",
  ].join("\n"));

  assert.equal(artifacts.branchName, "feature/ticket-112");
  assert.deepEqual(artifacts.pullRequests, [
    { repo: "org/app", prUrl: "https://github.com/org/app/pull/112", commitSha: "abc1234" },
  ]);
}

{
  const artifacts = parseShipArtifacts([
    "Merged commit `abcdef1` on branch feature/no-table.",
    "PR: https://github.com/org/app/pull/115#discussion",
    "PR mirror: https://github.com/org/app/pull/115/.",
  ].join("\n"));

  assert.equal(artifacts.branchName, "feature/no-table");
  assert.deepEqual(artifacts.pullRequests, [
    { repo: "org/app", prUrl: "https://github.com/org/app/pull/115", commitSha: "abcdef1" },
  ]);
}

{
  const artifacts = parseShipArtifacts([
    "## Branch",
    "",
    "`feature/restore-ship-artifacts`",
    "",
    "## Pull Requests",
    "",
    "| Repo | PR URL | Commit SHA |",
    "|------|--------|------------|",
    "| org/tribe | https://github.com/org/tribe/pull/170?utm=agent#files | `deadbee` |",
  ].join("\n"));

  assert.equal(artifacts.branchName, "feature/restore-ship-artifacts");
  assert.deepEqual(artifacts.pullRequests, [
    { repo: "org/tribe", prUrl: "https://github.com/org/tribe/pull/170", commitSha: "deadbee" },
  ]);
}

console.log("phase artifact fixtures passed");
