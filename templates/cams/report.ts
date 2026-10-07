/**
 * Weekly CAMS usage report from the query log.
 *   npm run report                 last 7 days to stdout
 *   npm run report -- --days 30
 *   npm run report -- --write      also save to docs/cams-reports/weekly-<date>.md (commit it)
 * Read "Candidate missing entries": repeated low-similarity questions usually mean
 * the answer was never written down — add a decision.md entry (or an eval case plus a
 * retrieval fix if the entry exists but isn't being found).
 */
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLog, type FeedbackEntry, type QueryEntry } from "./querylog.js";
import { tokenize } from "./core.js";

export function buildReport(
  all: Array<QueryEntry | FeedbackEntry>,
  opts: { days: number; low: number; now?: Date },
): string {
  const now = opts.now ?? new Date();
  const { days, low: LOW } = opts;
  const since = new Date(now.getTime() - days * 86400_000);
  const queries = all.filter((e): e is QueryEntry => e.type === "query" && new Date(e.ts) >= since);
  const feedback = all.filter((e): e is FeedbackEntry => e.type === "feedback" && new Date(e.ts) >= since);
  const byId = new Map(all.filter((e): e is QueryEntry => e.type === "query").map((q) => [q.id, q]));
  
  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "n/a");
  const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : NaN);
  // null = unknown (keyword-only search or no hits): not counted as weak by similarity
  const top1 = (q: QueryEntry): number | null => (q.top.length ? q.top[0].sim : 0);
  const isWeak = (q: QueryEntry) => top1(q) !== null && (top1(q) as number) < LOW;
  const fmt = (n: number | null) => (n === null ? "n/a" : n.toFixed(2));
  
  const out: string[] = [];
  out.push(`# CAMS weekly report — ${now.toISOString().slice(0, 10)}`, "", `Window: last ${days} days (since ${since.toISOString().slice(0, 10)}). Low-similarity threshold: top-1 < ${LOW}.`, "");
  
  const sessions = new Set(queries.map((q) => q.session));
  out.push("## Volume", "", `- Queries: **${queries.length}** across ${sessions.size} sessions (${[...new Set(queries.map((q) => q.client))].join(", ") || "—"})`, `- Median top-1 similarity: ${Number.isNaN(median(queries.map(top1).filter((x): x is number => x !== null))) ? "n/a" : median(queries.map(top1).filter((x): x is number => x !== null)).toFixed(3)}`, `- Queries with top-1 < ${LOW}: ${queries.filter(isWeak).length} (${pct(queries.filter(isWeak).length, queries.length)})`, "");
  
  const count = (o: string) => feedback.filter((f) => f.outcome === o).length;
  const good = count("changed_action") + count("useful");
  const answered = new Set(feedback.map((f) => f.queryId).filter(Boolean));
  out.push(
    "## Feedback", "",
    "| outcome | count |", "|---|---|",
    ...(["changed_action", "useful", "not_useful", "missed"] as const).map((o) => `| ${o} | ${count(o)} |`), "",
    `- Hit rate (changed_action + useful) / all feedback: **${pct(good, feedback.length)}** (${good}/${feedback.length})`,
    `- Feedback coverage: ${pct(answered.size, queries.length)} of queries have linked feedback — low coverage means the rate above is biased; nudge agents to call cams_feedback.`, "",
  );
  
  const missed = feedback.filter((f) => f.outcome === "missed" || f.outcome === "not_useful");
  out.push("## Misses reported by agents", "");
  if (missed.length === 0) out.push("_None._", "");
  for (const f of missed) {
    const q = f.queryId ? byId.get(f.queryId) : undefined;
    out.push(`- **${f.outcome}** — ${q ? `“${q.question}” (top-1 ${fmt(top1(q))} ${q.top[0]?.source ?? ""})` : "(no linked query)"}${f.missing ? `\n  - missing: ${f.missing}` : ""}${f.note ? `\n  - note: ${f.note}` : ""}`);
  }
  out.push("");
  
  // Cluster weak questions by token overlap
  const weak = queries.filter((q) => isWeak(q) || missed.some((f) => f.queryId === q.id));
  const clusters: { toks: Set<string>; qs: QueryEntry[] }[] = [];
  for (const q of weak) {
    const t = new Set(tokenize(q.question));
    const home = clusters.find((c) => { const inter = [...t].filter((x) => c.toks.has(x)).length; return inter / Math.max(1, new Set([...t, ...c.toks]).size) >= 0.5; });
    if (home) { home.qs.push(q); t.forEach((x) => home.toks.add(x)); } else clusters.push({ toks: t, qs: [q] });
  }
  out.push("## Candidate missing entries", "", "Repeated (or agent-flagged) weak questions. If the answer exists, add an eval case + fix retrieval; if not, write a decision.md entry.", "");
  const cand = clusters.filter((c) => c.qs.length >= 2 || c.qs.some((q) => missed.some((f) => f.queryId === q.id))).sort((a, b) => b.qs.length - a.qs.length);
  if (cand.length === 0) out.push("_None._", "");
  for (const c of cand) out.push(`- ×${c.qs.length} — “${c.qs[0].question}” (best top-1 ${fmt(Math.max(...c.qs.map((q) => top1(q) ?? 0)))})`);
  out.push("");
  
  const src: Record<string, number> = {};
  for (const q of queries) if (q.top[0]) src[q.top[0].source] = (src[q.top[0].source] ?? 0) + 1;
  out.push("## Top-1 source mix", "", Object.entries(src).sort((a, b) => b[1] - a[1]).map(([s, n]) => `- ${s}: ${n}`).join("\n") || "_No queries._", "");
  
  
  return out.join("\n");
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const flag = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const days = Number(flag("--days", "7")) || 7;
  const low = Number(flag("--low", "0.62")) || 0.62;
  const text = buildReport(await readLog(), { days, low });
  console.log(text);
  if (args.includes("--write")) {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "cams-reports");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `weekly-${new Date().toISOString().slice(0, 10)}.md`);
    writeFileSync(file, text);
    console.error(`wrote ${file}`);
  }
}
