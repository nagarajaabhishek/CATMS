import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyCuratedBoost, CURATED_SOURCES } from "../../templates/cams/core.ts";

const dir = mkdtempSync(path.join(tmpdir(), "cams-log-"));
process.env.CAMS_LOG_DIR = dir;
// Dynamic imports inside tests: this repo is CommonJS (no top-level await), and LOG_DIR is read at import time.
const logMod = () => import("../../templates/cams/querylog.ts");
const reportMod = () => import("../../templates/cams/report.ts");

test("applyCuratedBoost lets a curated hit overtake a slightly higher uncurated one", () => {
  const sources = ["session-log", "decision-md"];
  const fused = [{ item: 0, score: 0.0328 }, { item: 1, score: 0.0310 }];
  assert.deepEqual(applyCuratedBoost(fused, (i) => sources[i], 0).map((f) => f.item), [0, 1]);
  assert.deepEqual(applyCuratedBoost(fused, (i) => sources[i], 0.1).map((f) => f.item), [1, 0]);
  assert.ok(CURATED_SOURCES.has("decision-md") && !CURATED_SOURCES.has("session-log"));
});

test("query + feedback round-trip through the log, scrubbed, torn lines skipped", async () => {
  const { logQuery, logFeedback, readLog, QUERY_LOG, newQueryId } = await logMod();
  const id = newQueryId();
  assert.match(id, /^q-[0-9a-f]{6}$/);
  await logQuery({ id, ts: new Date().toISOString(), question: "why? password: hunter2hunter2", k: 5, mode: "hybrid", client: "t/1", session: "s1", top: [{ id: "abc", source: "decision-md", sim: 0.4 }] });
  await logFeedback({ ts: new Date().toISOString(), queryId: id, outcome: "missed", missing: "token=abcd1234efgh5678", client: "t/1", session: "s1" });
  appendFileSync(QUERY_LOG, '{"type":"query","id":"torn'); // crash mid-write
  const entries = await readLog();
  assert.equal(entries.length, 2);
  assert.ok(!JSON.stringify(entries).includes("hunter2"));
  assert.ok(!JSON.stringify(entries).includes("abcd1234efgh5678"));
});

test("report counts feedback, flags weak and keyword-only queries correctly", async () => {
  const { buildReport } = await reportMod();
  const now = new Date();
  const q = (id: string, question: string, sim: number | null) => ({ type: "query" as const, id, ts: now.toISOString(), question, k: 5, mode: "hybrid", client: "t/1", session: "s", top: [{ id: "x", source: "decision-md", sim }] });
  const fb = (queryId: string, outcome: "useful" | "missed", missing?: string) => ({ type: "feedback" as const, ts: now.toISOString(), queryId, outcome, missing, client: "t/1", session: "s" });
  const report = buildReport(
    [q("q-000001", "how do we deploy the billing service", 0.4), q("q-000002", "how do we deploy billing service", 0.41), q("q-000003", "unrelated keyword only", null), q("q-000004", "good one", 0.8), fb("q-000004", "useful"), fb("q-000001", "missed", "deploy runbook")],
    { days: 7, low: 0.62, now },
  );
  assert.match(report, /Queries: \*\*4\*\*/);
  assert.match(report, /Queries with top-1 < 0\.62: 2 /); // keyword-only (null) is not counted weak
  assert.match(report, /Hit rate .*\*\*50%\*\*/);
  assert.match(report, /missing: deploy runbook/);
  assert.match(report, /×2 — .*deploy/); // the two near-duplicate weak questions cluster
});
