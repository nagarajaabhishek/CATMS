/**
 * CAMS recall eval. Run before ANY change to chunking, the embedding model, or
 * ranking:  npm run eval
 *
 * eval/cases.json: agent-phrased questions, each with the decision id(s) or
 * phrase(s) a good answer must contain. A case is a STRICT hit if a top-k chunk
 * contains an expected id, a LENIENT hit if it contains an id OR a phrase.
 * Add a case for every real miss (cams_feedback "missed", `npm run report`).
 * Start from eval/cases.example.json.
 *
 * Flags: --config <name>   one config (default: all)
 *        --sweep a,b       ad-hoc "hybrid:0.1" / "vector:0.05" (mode:boost)
 *        --json            machine-readable
 *        --misses          list lenient misses of the production config
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { search } from "../server.js";
import { DEFAULT_RANK, type RankOptions } from "../core.js";

type Case = { q: string; ids: string[]; phrases: string[]; sources?: string[] };
const here = path.dirname(fileURLToPath(import.meta.url));
const file = [path.join(here, "cases.json"), path.join(here, "cases.example.json")].find(existsSync)!;
const cases: Case[] = JSON.parse(readFileSync(file, "utf8")).cases;

const CONFIGS: Record<string, RankOptions> = {
  vector: { mode: "vector", curatedBoost: 0 },
  keyword: { mode: "keyword", curatedBoost: 0 },
  hybrid: { mode: "hybrid", curatedBoost: 0 },
  "hybrid+boost": { mode: "hybrid", curatedBoost: 0.25 },
  production: DEFAULT_RANK,
};

const args = process.argv.slice(2);
const flag = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const names = flag("--sweep")?.split(",") ?? (flag("--config") ? [flag("--config")!] : Object.keys(CONFIGS));

const hitStrict = (t: string, c: Case) => c.ids.some((id) => t.includes(id));
const hitLenient = (t: string, c: Case) => hitStrict(t, c) || c.phrases.some((p) => t.toLowerCase().includes(p.toLowerCase()));
const at = (v: (number | null)[], k: number) => v.filter((x) => x && x <= k).length;
const mrr = (v: (number | null)[]) => v.reduce<number>((s, x) => s + (x ? 1 / x : 0), 0) / Math.max(1, v.length);

const summary: Record<string, Record<string, number>> = {};
const misses: string[] = [];
for (const name of names) {
  const adhoc = /^(hybrid|vector|keyword):([\d.]+)$/.exec(name);
  const rank = adhoc ? ({ mode: adhoc[1], curatedBoost: +adhoc[2] } as RankOptions) : CONFIGS[name];
  if (!rank) throw new Error(`unknown config ${name}; have ${Object.keys(CONFIGS).join(", ")}`);
  const lenient: (number | null)[] = [];
  const strict: (number | null)[] = [];
  for (const c of cases) {
    const r = await search(c.q, { k: 10, sources: c.sources, rank });
    if (r.mode === "keyword-only" && rank.mode !== "keyword") {
      throw new Error(`Embedder unavailable (${r.note ?? "no vectors"}) — the ${name} config would silently score keyword-only. Start Ollama / fix .env and run npm run backfill, then re-run.`);
    }
    const texts = r.hits.map((h) => h.chunk.content);
    const first = (p: (t: string) => boolean) => { const i = texts.findIndex(p); return i < 0 ? null : i + 1; };
    const l = first((t) => hitLenient(t, c));
    lenient.push(l);
    if (c.ids.length) strict.push(first((t) => hitStrict(t, c)));
    if (name === "production" && (!l || l > 3)) misses.push(`${c.q} | first hit: ${l ?? "none in top 10"}`);
  }
  summary[name] = { n: lenient.length, "recall@1": at(lenient, 1), "recall@3": at(lenient, 3), "recall@5": at(lenient, 5), "recall@10": at(lenient, 10), mrr: +mrr(lenient).toFixed(3), "strict@1": at(strict, 1), "strict@3": at(strict, 3), strict_n: strict.length, strict_mrr: +mrr(strict).toFixed(3) };
}

if (args.includes("--json")) console.log(JSON.stringify({ cases: cases.length, summary, misses }, null, 2));
else {
  console.log(`cases: ${cases.length} (${path.basename(file)})\n`);
  console.log("config".padEnd(16) + "n   @1  @3  @5  @10  MRR    strict@1/@3 (of n)  sMRR");
  for (const [name, s] of Object.entries(summary))
    console.log(`${name.padEnd(16)}${s.n}  ${String(s["recall@1"]).padStart(3)} ${String(s["recall@3"]).padStart(3)} ${String(s["recall@5"]).padStart(3)} ${String(s["recall@10"]).padStart(4)}  ${s.mrr.toFixed(3)}  ${s["strict@1"]}/${s["strict@3"]} of ${s.strict_n}        ${s.strict_mrr.toFixed(3)}`);
  if (args.includes("--misses") || misses.length) { console.log("\nProduction-config misses (lenient, not in top 3):"); misses.forEach((m) => console.log(" -", m)); }
}
