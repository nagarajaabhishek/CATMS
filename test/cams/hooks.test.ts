import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const { installHooks } = createRequire(import.meta.url)("../../lib/cams-setup.js");

test("installHooks never writes through a symlinked hook", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cams-hooks-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  mkdirSync(path.join(dir, "tools", "cams", "hooks"), { recursive: true });
  const tracked = path.join(dir, "tools", "cams", "hooks", "post-merge");
  writeFileSync(tracked, "#!/bin/bash\n# CATMS post-merge git hook\necho old\n");
  symlinkSync(tracked, path.join(dir, ".git", "hooks", "post-merge"));

  const result = installHooks(dir);

  assert.ok(result.skipped.includes("post-merge"));
  assert.ok(lstatSync(path.join(dir, ".git", "hooks", "post-merge")).isSymbolicLink());
  assert.match(readFileSync(tracked, "utf8"), /echo old/); // tracked file untouched
  assert.ok(existsSync(path.join(dir, ".git", "hooks", "post-checkout"))); // the others are still installed
});
