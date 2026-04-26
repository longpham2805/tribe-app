const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readProjectRepositorySource() {
  return readFileSync(path.join(__dirname, "ProjectRepository.ts"), "utf8");
}

test("project activity query counts unfinished tickets for runningTicketCount", () => {
  const source = readProjectRepositorySource();

  assert.match(source, /select\("COUNT\(ticket\.id\)"\)/);
  assert.match(source, /andWhere\("ticket\.isDone = false"\)/);
});

test("project activity query does not depend on phase running status", () => {
  const source = readProjectRepositorySource();

  assert.doesNotMatch(source, /phase\.status/);
  assert.doesNotMatch(source, /innerJoin\(Phase/);
});
