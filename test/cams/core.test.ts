import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Bm25Index,
  buildAliasGroups,
  diffChunks,
  enforceChunkSizeCap,
  expandTokens,
  reciprocalRankFusion,
  splitDoc,
  splitSessionLog,
  tokenize,
} from "../../templates/cams/core.ts";

test("tokenize keeps identifiers whole and also splits them", () => {
  const tokens = tokenize("Branch feat/proj-42-auth is In Progress");
  assert.ok(tokens.includes("feat/proj-42-auth"));
  for (const part of ["feat", "proj", "42", "auth", "branch", "progress"]) assert.ok(tokens.includes(part), part);
  assert.ok(!tokens.includes("is"), "stopwords are dropped");
});

test("splitDoc returns 1-based line ranges per heading section", () => {
  const doc = [
    "# Title",
    "",
    "## First section",
    "Some body text that is long enough to be kept as a chunk.",
    "",
    "## Second section",
    "",
    "Another body that is also long enough to count as a chunk here.",
    "",
  ].join("\n");
  const spans = splitDoc(doc, 1800);
  assert.deepEqual(
    spans.map((s) => [s.lineStart, s.lineEnd]),
    [
      [3, 4],
      [6, 8],
    ],
  );
  assert.ok(spans[1].text.startsWith("## Second section"));
});

test("splitSessionLog chunks per bullet, including indented ones", () => {
  const log = [
    "# 2026-10-01",
    "- First bullet with enough words to pass the minimum length check.",
    "  - Nested bullet with enough words to pass the minimum length check.",
  ].join("\n");
  const spans = splitSessionLog(log, 1800);
  assert.deepEqual(
    spans.map((s) => [s.lineStart, s.lineEnd]),
    [
      [2, 2],
      [3, 3],
    ],
  );
  assert.ok(spans[1].text.startsWith("- Nested"), "leading indent trimmed like before");
});

test("size cap splits on paragraph breaks and keeps line ranges accurate", () => {
  const para = (n: number) => Array.from({ length: 5 }, (_, i) => `para ${n} line ${i} ${"x".repeat(30)}`).join("\n");
  const text = [para(1), "", para(2), "", para(3)].join("\n");
  const spans = enforceChunkSizeCap([{ text, lineStart: 10, lineEnd: 26 }], 450);
  assert.ok(spans.length >= 2);
  for (const s of spans) assert.ok(s.text.length <= 450);
  assert.equal(spans[0].lineStart, 10);
  assert.equal(spans.at(-1)!.lineEnd, 26);
  const allLines = text.split("\n");
  for (const s of spans) {
    assert.equal(s.text.split("\n")[0], allLines[s.lineStart - 10].trim());
  }
});

test("size cap hard-splits a single oversized line", () => {
  const spans = enforceChunkSizeCap([{ text: "y".repeat(250), lineStart: 7, lineEnd: 7 }], 100);
  assert.equal(spans.length, 3);
  assert.ok(spans.every((s) => s.lineStart === 7 && s.lineEnd === 7));
});

test("BM25 ranks the document with the rarer matching term first", () => {
  const idx = new Bm25Index([
    "postgres database on neon",
    "auth provider is clerk",
    "the database migration for auth",
  ]);
  const hits = idx.search(tokenize("clerk auth"));
  assert.equal(hits[0].doc, 1);
  assert.equal(hits.length, 2);
  assert.deepEqual(
    idx.search(tokenize("clerk auth"), (d) => d !== 1).map((h) => h.doc),
    [2],
  );
});

test("alias expansion works in both directions and for multi-word terms", () => {
  const groups = buildAliasGroups({ kubernetes: ["k8s"], "pull request": ["pr"] });
  assert.ok(expandTokens(tokenize("k8s deploy"), groups).includes("kubernetes"));
  assert.ok(expandTokens(tokenize("kubernetes deploy"), groups).includes("k8s"));
  assert.ok(expandTokens(tokenize("open a pull request"), groups).includes("pr"));
  assert.deepEqual(expandTokens(tokenize("unrelated"), groups), ["unrelated"]);
});

test("reciprocal rank fusion rewards items present in both rankings", () => {
  const fused = reciprocalRankFusion([
    ["a", "b", "c"],
    ["c", "a"],
  ]);
  assert.equal(fused[0].item, "a");
  assert.deepEqual(fused[0].ranks, [1, 2]);
  assert.deepEqual(fused.find((f) => f.item === "b")!.ranks, [2, null]);
});

test("diffChunks keeps unchanged, adds new, removes missing (as a multiset)", () => {
  const active = [{ contentHash: "h1" }, { contentHash: "h2" }, { contentHash: "h2" }];
  const { kept, added, removed } = diffChunks(active, ["h2", "h3", "h1"]);
  assert.deepEqual(
    kept.map((k) => [k.chunk.contentHash, k.index]),
    [
      ["h2", 0],
      ["h1", 2],
    ],
  );
  assert.deepEqual(added, [1]);
  assert.deepEqual(
    removed.map((r) => r.contentHash),
    ["h2"],
  );
});
