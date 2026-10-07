import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { applyCuratedBoost, parseSourceConfig } from "../../templates/cams/core.ts";

const root = path.join(path.sep, "proj");

test("parseSourceConfig resolves project-relative paths", () => {
  const out = parseSourceConfig(
    [
      { kind: "dir", path: "projects/x/sessions", source: "session-log", splitter: "bullet" },
      { kind: "file", path: "decision.md", source: "decision-md", splitter: "heading" },
    ],
    root,
  );
  assert.equal(out[0].path, path.join(root, "projects", "x", "sessions"));
  assert.equal(out[1].kind, "file");
});

test("parseSourceConfig rejects bad entries with a message naming the entry", () => {
  const bad = (e: unknown, re: RegExp) => assert.throws(() => parseSourceConfig([e], root), re);
  bad({ kind: "dir", path: "../outside", source: "x", splitter: "bullet" }, /sources\[0\]\.path/);
  bad({ kind: "dir", path: "/abs", source: "x", splitter: "bullet" }, /sources\[0\]\.path/);
  bad({ kind: "dir", path: "a", source: "Fact", splitter: "bullet" }, /sources\[0\]\.source/);
  bad({ kind: "dir", path: "a", source: "manual", splitter: "bullet" }, /sources\[0\]\.source/);
  bad({ kind: "dir", path: "a", source: "x", splitter: "fact" }, /sources\[0\]\.splitter/);
  bad({ kind: "tree", path: "a", source: "x", splitter: "bullet" }, /sources\[0\]\.kind/);
  assert.throws(() => parseSourceConfig("nope", root), /must be an array/);
  assert.throws(
    () => parseSourceConfig([{ kind: "dir", path: "a", source: "x", splitter: "bullet" }, { kind: "dir", path: "a", source: "y", splitter: "bullet" }], root),
    /duplicates/,
  );
});

test("applyCuratedBoost honours a project-specific curated set", () => {
  const sources = ["session-log", "skill"];
  const fused = [{ item: 0, score: 0.0328 }, { item: 1, score: 0.031 }];
  assert.deepEqual(applyCuratedBoost(fused, (i) => sources[i], 0.1).map((f) => f.item), [0, 1]); // default set: skill not curated
  assert.deepEqual(applyCuratedBoost(fused, (i) => sources[i], 0.1, new Set(["skill"])).map((f) => f.item), [1, 0]);
});

import { MIN_CHUNK_CHARS, splitDoc } from "../../templates/cams/core.ts";

const para = (n: number) => ("lorem ipsum dolor sit amet ".repeat(40) + n).trim();

test("continuation chunks of a long heading section repeat the heading, with accurate line ranges", () => {
  const doc = `### D-20260101-big-decision\n${[1, 2, 3, 4].map(para).join("\n\n")}\n\n### D-20260101-other\nshort entry body long enough to be kept as its own chunk`;
  const spans = splitDoc(doc, 1800);
  const big = spans.filter((s) => s.text.includes("lorem"));
  assert.ok(big.length >= 3);
  for (const s of big) {
    assert.ok(s.text.startsWith("### D-20260101-big-decision"));
    assert.ok(s.text.length <= 1800, String(s.text.length));
  }
  assert.equal(big[0].lineStart, 1); // the heading line itself
  for (const s of big.slice(1)) assert.ok(s.lineStart > 1, "continuations point past the heading line");
  for (let i = 1; i < big.length; i++) assert.ok(big[i].lineStart >= big[i - 1].lineStart, "ranges stay in order");
  assert.ok(spans.some((s) => s.text.startsWith("### D-20260101-other")));
  assert.ok(MIN_CHUNK_CHARS > 0);
});

test("a pathologically long heading line terminates and is not repeated", () => {
  const doc = `# ${"x".repeat(2500)}\n${[1, 2, 3].map(para).join("\n\n")}`;
  const spans = splitDoc(doc, 1800);
  assert.ok(spans.length >= 2);
  for (const s of spans) assert.ok(s.text.length <= 1800);
});
