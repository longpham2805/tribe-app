const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

function readMigration(fileName) {
  return readFileSync(path.join(__dirname, fileName), "utf8");
}

test("project logo path repair migration handles canonical and legacy columns", () => {
  const source = readMigration("1777700000000-FixProjectLogoPathColumn.ts");

  assert.match(source, /hasTable\("project"\)/);
  assert.match(source, /hasColumn\("project", "logoPath"\)/);
  assert.match(source, /hasColumn\("project", "logo_path"\)/);
  assert.match(source, /CHANGE `logo_path` `logoPath`/);
  assert.match(source, /ADD COLUMN `logoPath` varchar\(500\) NULL/);
  assert.match(source, /COALESCE\(`logoPath`, `logo_path`\)/);
  assert.match(source, /DROP COLUMN `logo_path`/);
});

test("project logo path repair migration preserves data on rollback", () => {
  const source = readMigration("1777700000000-FixProjectLogoPathColumn.ts");

  assert.match(source, /CHANGE `logoPath` `logo_path`/);
  assert.match(source, /COALESCE\(`logo_path`, `logoPath`\)/);
  assert.match(source, /DROP COLUMN `logoPath`/);
});
