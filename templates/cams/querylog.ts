/**
 * Append-only query + feedback log (gitignored: tools/cams/logs/). Contains
 * scrubbed questions and result ids/similarities only — never chunk text.
 * Logging must never break a query, so every write swallows its own errors.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrub } from "./scrub.js";

export const LOG_DIR = process.env.CAMS_LOG_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "logs");
export const QUERY_LOG = path.join(LOG_DIR, "query-log.ndjson");

export type QueryEntry = {
  type: "query";
  id: string;
  ts: string;
  question: string;
  k: number;
  filter?: string[];
  mode: string;
  client: string;
  session: string;
  /** sim = cosine similarity of the hit's embedding to the question; null when search ran keyword-only. */
  top: Array<{ id: string; source: string; sim: number | null; kw?: number | null; vec?: number | null }>;
};
export type FeedbackOutcome = "changed_action" | "useful" | "not_useful" | "missed";
export type FeedbackEntry = {
  type: "feedback";
  ts: string;
  queryId?: string;
  outcome: FeedbackOutcome;
  note?: string;
  missing?: string;
  client: string;
  session: string;
};

export const newQueryId = () => "q-" + randomBytes(3).toString("hex");

async function write(entry: object): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(QUERY_LOG, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error("CAMS: query log write failed:", err);
  }
}

export const logQuery = (e: Omit<QueryEntry, "type" | "question"> & { question: string }) =>
  write({ type: "query", ...e, question: scrub(e.question) });

export const logFeedback = (e: Omit<FeedbackEntry, "type">) =>
  write({ type: "feedback", ...e, note: e.note && scrub(e.note), missing: e.missing && scrub(e.missing) });

export async function readLog(file = QUERY_LOG): Promise<Array<QueryEntry | FeedbackEntry>> {
  let raw: string;
  try { raw = await readFile(file, "utf8"); } catch { return []; }
  const out: Array<QueryEntry | FeedbackEntry> = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip torn line */ }
  }
  return out;
}
