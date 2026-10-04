import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  detectSecret,
  parseFact,
  parseGitLog,
  serializeFact,
  splitDoc,
  walkHistory,
  type Introduced,
} from "../../templates/cams/core.ts";

test("fact files round-trip through serialize/parse", () => {
  const meta = {
    id: "47fac3404ff6d45f",
    kind: "decision",
    author: "@claude-abhishek",
    created: "2026-10-04T08:20:00.000Z",
    sourceRef: "src/middleware.ts",
    lines: "10-30",
  };
  const body = 'Rate limiting lives in the edge middleware.\n\nNot in "API handlers": see #12.';
  const text = serializeFact(meta, body);
  const parsed = parseFact(text)!;
  assert.deepEqual(parsed.meta, meta);
  assert.equal(parsed.body, body);
  assert.equal(text.split("\n")[parsed.bodyLine - 1], "Rate limiting lives in the edge middleware.");
});

test("parseFact accepts hand-written bare values with trailing comments", () => {
  const parsed = parseFact("---\nkind: decision          # manual | decision | task\nauthor: '@priya'\n---\nUse Neon branches per preview.\n")!;
  assert.equal(parsed.meta.kind, "decision");
  assert.equal(parsed.meta.author, "@priya");
  assert.equal(parsed.body, "Use Neon branches per preview.");
  assert.equal(parseFact("no frontmatter here"), null);
});

test("detectSecret flags keys and credentials but not ordinary prose", () => {
  assert.equal(detectSecret("key is sk-proj-abcdefghijklmnopqrstuvwxyz123"), "OpenAI-style API key");
  assert.equal(detectSecret("-----BEGIN RSA PRIVATE KEY-----"), "private key");
  assert.equal(detectSecret("AKIAABCDEFGHIJKLMNOP"), "AWS access key");
  assert.equal(detectSecret("password=hunter2hunter2"), "credential assignment");
  assert.equal(detectSecret("The API key is stored in Doppler under STRIPE_KEY."), null);
  assert.equal(detectSecret("We rotate the password every 90 days."), null);
});

test("parseGitLog reads name-status records", () => {
  const out = "\x1eaaa111\x1faaa\x1f2026-10-01T10:00:00+00:00\n\nA\tdecision.md\nM\ttasks.md\n\x1ebbb222\x1fbbb\x1f2026-10-02T10:00:00+00:00\n\nD\tlog.md\n";
  const commits = parseGitLog(out);
  assert.equal(commits.length, 2);
  assert.deepEqual(commits[0].changes, [
    { status: "A", path: "decision.md" },
    { status: "M", path: "tasks.md" },
  ]);
  assert.equal(commits[1].short, "bbb");
  assert.deepEqual(commits[1].changes, [{ status: "D", path: "log.md" }]);
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" },
  }).toString();
}

function rebuild(repo: string) {
  const log = git(repo, "log", "--first-parent", "--no-renames", "--name-status", "--relative", "--format=%x1e%H%x1f%h%x1f%cI", "--", "decision.md");
  const commits = parseGitLog(log).reverse();
  const introduced: Introduced = {};
  const removed: Array<{ text: string; introducedBy: string; removedBy: string }> = [];
  walkHistory({
    commits,
    introduced,
    owned: (p) => p === "decision.md",
    piecesAt: (rev, p) => {
      let content = "";
      try {
        content = execFileSync("git", ["show", `${rev}:./${p}`], { cwd: repo, stdio: ["ignore", "pipe", "ignore"] }).toString();
      } catch {
        return [];
      }
      return splitDoc(content, 1800).map((s) => ({ text: s.text, hash: createHash("sha256").update(s.text).digest("hex") }));
    },
    fallbackIntro: (_p, c) => [c.short, c.date],
    onRemoved: (piece, _p, introducedBy, commit) => removed.push({ text: piece.text, introducedBy: introducedBy[0], removedBy: commit.short }),
  });
  return { commits, introduced, removed };
}

test("walkHistory derives superseded versions from real git commits, deterministically", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "cams-history-"));
  try {
    git(repo, "init", "-q");
    const write = (body: string, msg: string) => {
      writeFileSync(path.join(repo, "decision.md"), body);
      git(repo, "add", "decision.md");
      git(repo, "commit", "-qm", msg);
      return git(repo, "rev-parse", "--short", "HEAD").trim();
    };
    const clerk = "## Auth provider\n\nWe chose Clerk for authentication in the web app.";
    const auth0 = "## Auth provider\n\nWe switched to Auth0 for authentication in the web app.";
    const db = "## Database\n\nPostgres on Neon with a branch per preview deployment.";
    const c1 = write(`# Decisions\n\n${clerk}\n`, "clerk");
    const c2 = write(`# Decisions\n\n${clerk}\n\n${db}\n`, "add db");
    const c3 = write(`# Decisions\n\n${auth0}\n\n${db}\n`, "switch to auth0");

    const first = rebuild(repo);
    assert.equal(first.commits.length, 3);
    assert.deepEqual(first.removed, [{ text: clerk, introducedBy: c1, removedBy: c3 }]);
    const intro = first.introduced["decision.md"];
    const byText = (t: string) => intro[createHash("sha256").update(t).digest("hex")]?.[0];
    assert.equal(byText(db), c2);
    assert.equal(byText(auth0), c3);

    assert.deepEqual(rebuild(repo), first, "a second independent rebuild gives identical history");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
