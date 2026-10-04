/**
 * CAMS — Coding Agent Memory System ({PROJECT_NAME} instance).
 * Local, self-hosted memory MCP server.
 *
 * Git is the source of truth; memory.ndjson is a disposable, per-machine
 * cache. Everything in it is rebuilt from the repo by a backfill:
 *   - tracker chunks from tasks.md, decision.md, sessions/, docs/, ...
 *   - facts from memory/facts/*.md — cams_ingest writes one committed file
 *     per fact, so teammates get them on their next pull
 *   - history (superseded versions) derived from git log, so every machine
 *     that has the same commits reports the same history
 * A new machine or teammate runs `catms setup` (or just a backfill) and
 * ends up with the same memory as everyone else.
 *
 * Storage: memory.ndjson plus memory.meta.json (history bookkeeping), both
 * gitignored. The server re-reads memory.ndjson whenever it changes, so a
 * backfill run by a git hook in another process is picked up live. Writes go
 * through a lockfile and an atomic rename.
 *
 * Search: hybrid. BM25 keyword ranking (with alias expansion from
 * .catms.json's cams.vocab) and cosine ranking over embeddings, fused with
 * reciprocal rank fusion. With no working embedder, search degrades to
 * keyword-only rather than failing. History versions are never embedded.
 *
 * Embeddings: pluggable via EMBED_PROVIDER — 'openai' (text-embedding-3-small,
 * default), 'voyage' (voyage-3-lite), or 'ollama' (mxbai-embed-large, local).
 * Each developer uses their own key; vectors are cached by content hash, so
 * unchanged text is never re-embedded.
 *
 * Single-project scope on purpose: this server is wired via project-level
 * MCP config (.mcp.json), so it only loads when Claude Code / Cursor is
 * opened in this project.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, readdir, stat, rename, open, unlink, utimes, mkdir } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Bm25Index,
  buildAliasGroups,
  cosineSimilarity,
  detectSecret,
  diffChunks,
  expandTokens,
  parseFact,
  parseGitLog,
  reciprocalRankFusion,
  serializeFact,
  splitDoc,
  splitSessionLog,
  tokenize,
  walkHistory,
  type Introduced,
  type Vocab,
} from "./core.js";

// ESM has no __dirname — derive it from import.meta.url so this resolves
// correctly regardless of the MCP client's working directory.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Node doesn't load .env files on its own. This is a minimal inline parser
// (no dotenv dependency) so `catms init`'s .env keeps working across Node
// versions without relying on --env-file (Node 20.6+ only). Real
// already-set env vars (e.g. injected by the MCP client) always win.
function loadDotEnv(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv(path.join(__dirname, ".env"));

const EMBED_PROVIDER = (process.env.EMBED_PROVIDER ?? "openai") as
  | "openai"
  | "voyage"
  | "ollama";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small";
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY ?? "";
const VOYAGE_EMBED_MODEL = process.env.VOYAGE_EMBED_MODEL ?? "voyage-3-lite";
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "mxbai-embed-large";

const EMBED_MODEL_ID =
  EMBED_PROVIDER === "openai"
    ? `openai:${OPENAI_EMBED_MODEL}`
    : EMBED_PROVIDER === "voyage"
      ? `voyage:${VOYAGE_EMBED_MODEL}`
      : `ollama:${OLLAMA_EMBED_MODEL}`;

// Most embedding models cap out well under 8k tokens; keep chunks well under
// that (roughly 4 chars/token for English prose) so nothing gets silently
// truncated during embedding.
const MAX_CHUNK_CHARS = 1800;

// Oldest superseded chunks beyond this count are pruned on backfill.
const HISTORY_MAX = Number(process.env.CAMS_HISTORY_MAX ?? 5000);
// How many commits back a from-scratch history rebuild walks.
const HISTORY_COMMITS = Number(process.env.CAMS_HISTORY_COMMITS ?? 500);

const PROJECT_DIR = path.resolve(__dirname, "..", "..");
const SESSIONS_DIR = path.join(PROJECT_DIR, "sessions");
const FACTS_REL = "memory/facts";
const FACTS_DIR = path.join(PROJECT_DIR, ...FACTS_REL.split("/"));
const MEMORY_FILE = path.join(__dirname, "memory.ndjson");
const META_FILE = path.join(__dirname, "memory.meta.json");
const LOCK_FILE = path.join(__dirname, "memory.lock");
const CATMS_CONFIG = path.join(PROJECT_DIR, ".catms.json");

/**
 * Every source this backfill walks, rooted at the project directory itself.
 * `dir` entries are scanned recursively; missing ones are skipped, not an
 * error. When directories nest (docs/ contains docs/design/changes/), each
 * file belongs to the most specific source only. `splitter` picks the
 * chunking strategy — session logs and log.md are bullet-per-entry;
 * tasks/sprint/decision/docs are heading-based prose; fact files are one
 * chunk each, whose source is the fact's `kind`.
 */
type Splitter = "bullet" | "heading" | "fact";
const SOURCES: Array<{ kind: "dir" | "file"; path: string; source: string; splitter: Splitter }> = [
  { kind: "dir", path: SESSIONS_DIR, source: "session-log", splitter: "bullet" },
  { kind: "file", path: path.join(PROJECT_DIR, "log.md"), source: "log-md", splitter: "bullet" },
  { kind: "file", path: path.join(PROJECT_DIR, "tasks.md"), source: "tasks-md", splitter: "heading" },
  { kind: "file", path: path.join(PROJECT_DIR, "sprint.md"), source: "sprint-md", splitter: "heading" },
  { kind: "file", path: path.join(PROJECT_DIR, "decision.md"), source: "decision-md", splitter: "heading" },
  { kind: "dir", path: path.join(PROJECT_DIR, "docs"), source: "doc", splitter: "heading" },
  { kind: "dir", path: path.join(PROJECT_DIR, "docs", "design", "changes"), source: "design-change", splitter: "heading" },
  { kind: "dir", path: path.join(PROJECT_DIR, "docs", "design", "archive"), source: "design-archive", splitter: "heading" },
  { kind: "dir", path: FACTS_DIR, source: "fact", splitter: "fact" },
];
const TRACKER_SOURCES = new Set(SOURCES.filter((s) => s.splitter !== "fact").map((s) => s.source));
const FACT_KINDS = ["manual", "decision", "task"] as const;
const ALL_SOURCES = [...TRACKER_SOURCES, ...FACT_KINDS];
const TRACKED_PATHSPECS = SOURCES.map((s) => toPosix(path.relative(PROJECT_DIR, s.path)));

// ---------------------------------------------------------------------------
// Storage — NDJSON file, reloaded on change, written atomically under a lock
// ---------------------------------------------------------------------------

type Chunk = {
  id: string;
  content: string;
  source: string;
  sourceRef: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  /** Commit that introduced this text (or HEAD, with dirty=true, if not committed yet). */
  commit: string | null;
  dirty: boolean;
  embedding: number[] | null;
  embedModel: string | null;
  contentHash: string;
  createdAt: string;
  supersededAt: string | null;
  supersededCommit: string | null;
  metadata: Record<string, unknown>;
  /** A pre-v2 chunk from a tracker source, replaced on next backfill. */
  legacy?: boolean;
};

/** History bookkeeping; per machine, but derived only from git so it converges. */
type Meta = {
  schemaVersion: number;
  historyCommit: string | null;
  introduced: Introduced;
};
const META_SCHEMA = 3;

let memory: Chunk[] = [];
let loadedStamp: string | null = null;
let index: Bm25Index | null = null;

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function chunkId(source: string, sourceRef: string | null, content: string): string {
  return hash(`${source}\u0000${sourceRef ?? ""}\u0000${content}`).slice(0, 16);
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

function isFactRef(sourceRef: string | null): boolean {
  return !!sourceRef && sourceRef.startsWith(`${FACTS_REL}/`);
}

/** Chunks that mirror a file in the repo (and so are owned by backfill). */
function isFileBacked(c: Chunk): boolean {
  return TRACKER_SOURCES.has(c.source) || isFactRef(c.sourceRef);
}

/** Fills defaults on a chunk read from disk; pre-v2 tracker chunks are flagged legacy. */
function normalizeChunk(raw: Partial<Chunk> & { content: string; source: string; contentHash: string }): Chunk {
  const isLegacy = raw.legacy === true || raw.lineStart === undefined;
  return {
    id: raw.id ?? chunkId(raw.source, raw.sourceRef ?? null, raw.content),
    content: raw.content,
    source: raw.source,
    sourceRef: raw.sourceRef ?? null,
    lineStart: raw.lineStart ?? null,
    lineEnd: raw.lineEnd ?? null,
    commit: raw.commit ?? null,
    dirty: raw.dirty ?? false,
    embedding: raw.embedding ?? null,
    // Pre-v2 files didn't record a model; they were embedded with whatever provider was configured.
    embedModel: raw.embedModel ?? (raw.embedding ? EMBED_MODEL_ID : null),
    contentHash: raw.contentHash,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    supersededAt: raw.supersededAt ?? null,
    supersededCommit: raw.supersededCommit ?? null,
    metadata: raw.metadata ?? {},
    ...(isLegacy && TRACKER_SOURCES.has(raw.source) ? { legacy: true } : {}),
  };
}

function fileStamp(filePath: string): string | null {
  try {
    const s = statSync(filePath);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return null;
  }
}

/** Reloads memory.ndjson if another process (e.g. a git hook's backfill) changed it. */
async function ensureFresh(): Promise<void> {
  const stamp = fileStamp(MEMORY_FILE) ?? "missing";
  if (stamp === loadedStamp) return;
  if (stamp === "missing") {
    memory = [];
  } else {
    const raw = await readFile(MEMORY_FILE, "utf-8");
    memory = raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => normalizeChunk(JSON.parse(line)));
  }
  loadedStamp = stamp;
  index = null;
}

async function writeAtomic(filePath: string, content: string): Promise<void> {
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, filePath);
}

async function persistMemory(): Promise<void> {
  const lines = memory.map((c) => JSON.stringify(c)).join("\n");
  await writeAtomic(MEMORY_FILE, lines.length > 0 ? lines + "\n" : "");
  loadedStamp = fileStamp(MEMORY_FILE);
  index = null;
}

function readMeta(): Meta | null {
  try {
    const meta = JSON.parse(readFileSync(META_FILE, "utf-8")) as Meta;
    return meta.schemaVersion === META_SCHEMA ? meta : null;
  } catch {
    return null;
  }
}

async function persistMeta(meta: Meta): Promise<void> {
  await writeAtomic(META_FILE, JSON.stringify(meta) + "\n");
}

const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 120_000;

/** Runs `fn` holding memory.lock, so a hook's backfill and the server never write at once. */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  let delay = 50;
  for (;;) {
    try {
      const handle = await open(LOCK_FILE, "wx");
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
      await handle.close();
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        const s = await stat(LOCK_FILE);
        if (Date.now() - s.mtimeMs > LOCK_STALE_MS) {
          await unlink(LOCK_FILE).catch(() => {});
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for ${LOCK_FILE}; delete it if no backfill is running.`);
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 1000);
    }
  }
  // A long backfill keeps the lock fresh so others don't treat it as stale.
  const heartbeat = setInterval(() => {
    const now = new Date();
    utimes(LOCK_FILE, now, now).catch(() => {});
  }, LOCK_STALE_MS / 3);
  try {
    await ensureFresh();
    return await fn();
  } finally {
    clearInterval(heartbeat);
    await unlink(LOCK_FILE).catch(() => {});
  }
}

function getIndex(): Bm25Index {
  if (!index) index = new Bm25Index(memory.map((c) => `${c.sourceRef ?? ""}\n${c.content}`));
  return index;
}

// ---------------------------------------------------------------------------
// Project context — git and .catms.json
// ---------------------------------------------------------------------------

/** Raw stdout (not trimmed — some git output is whitespace-significant), or null on failure. */
function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: PROJECT_DIR,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 256 * 1024 * 1024,
    }).toString();
  } catch {
    return null;
  }
}

function headCommit(): { sha: string; short: string } | null {
  const out = git(["rev-parse", "HEAD"])?.trim();
  if (!out) return null;
  return { sha: out, short: git(["rev-parse", "--short", "HEAD"])?.trim() ?? out.slice(0, 7) };
}

/** File content at a revision, or null if it didn't exist there. `rel` is relative to the project dir. */
function gitShow(rev: string, rel: string): string | null {
  return git(["show", `${rev}:./${rel}`]);
}

/** Who a new fact is attributed to: CAMS_AUTHOR, then the claim tag `catms setup` stored, then git email. */
function currentAuthor(): string {
  return (
    process.env.CAMS_AUTHOR ||
    git(["config", "--get", "catms.claimTag"])?.trim() ||
    git(["config", "--get", "user.email"])?.trim() ||
    "unknown"
  );
}

let vocabStamp: string | null = null;
let aliasGroups: string[][][] = [];

/** Alias groups from .catms.json → cams.vocab, re-read whenever the file changes. */
function getAliasGroups(): string[][][] {
  const stamp = fileStamp(CATMS_CONFIG);
  if (stamp === vocabStamp) return aliasGroups;
  vocabStamp = stamp;
  try {
    const config = JSON.parse(readFileSync(CATMS_CONFIG, "utf-8")) as { cams?: { vocab?: Vocab } };
    aliasGroups = buildAliasGroups(config.cams?.vocab);
  } catch {
    aliasGroups = [];
  }
  return aliasGroups;
}

// ---------------------------------------------------------------------------
// Embedding — pluggable provider, plain fetch, no SDKs
// ---------------------------------------------------------------------------

async function embed(text: string): Promise<number[]> {
  if (EMBED_PROVIDER === "openai") {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (tools/cams/.env).");
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: OPENAI_EMBED_MODEL, input: text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI embed failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }

  if (EMBED_PROVIDER === "voyage") {
    if (!VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY is not set (tools/cams/.env).");
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({ model: VOYAGE_EMBED_MODEL, input: [text] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Voyage embed failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }

  // ollama — local, for anyone who already runs it
  const res = await fetch(`${OLLAMA_HOST}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, input: [text] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Ollama embed failed (${res.status}): ${body.slice(0, 300)}. Is Ollama running and the model pulled ("ollama pull ${OLLAMA_EMBED_MODEL}")?`,
    );
  }
  const data = (await res.json()) as { embeddings?: number[][] };
  const vec = data.embeddings?.[0];
  if (!vec) throw new Error(`Ollama returned no embedding for model ${OLLAMA_EMBED_MODEL}.`);
  return vec;
}

/** Embeds, or returns the error message instead of throwing so callers can degrade to keyword-only. */
async function tryEmbed(text: string): Promise<{ vector: number[] } | { error: string }> {
  try {
    return { vector: await embed(text) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

type EmbedStats = { embedded: number; reused: number; error: string | null };

/** Embedding lookup for one backfill/ingest: cache by content hash first, stop calling a dead embedder. */
function makeEmbedder(stats: EmbedStats): (content: string, contentHash: string) => Promise<number[] | null> {
  const cache = new Map<string, number[]>();
  for (const c of memory) {
    if (c.embedding && c.embedModel === EMBED_MODEL_ID) cache.set(c.contentHash, c.embedding);
  }
  let down = false;
  return async (content, contentHash) => {
    const cached = cache.get(contentHash);
    if (cached) {
      stats.reused += 1;
      return cached;
    }
    if (down) return null;
    const r = await tryEmbed(content);
    if ("error" in r) {
      down = true;
      stats.error = r.error;
      return null;
    }
    stats.embedded += 1;
    cache.set(contentHash, r.vector);
    return r.vector;
  };
}

// ---------------------------------------------------------------------------
// Turning a file into pieces
// ---------------------------------------------------------------------------

type Piece = {
  source: string;
  text: string;
  hash: string;
  lineStart: number;
  lineEnd: number;
  metadata: Record<string, unknown>;
  createdAt?: string;
};

/** The source that owns a project-relative path (most specific match), if any. */
function sourceFor(rel: string): (typeof SOURCES)[number] | null {
  if (!rel.endsWith(".md")) return null;
  const abs = path.join(PROJECT_DIR, rel);
  let best: (typeof SOURCES)[number] | null = null;
  for (const src of SOURCES) {
    const match = src.kind === "file" ? abs === src.path : abs.startsWith(src.path + path.sep);
    if (match && (!best || src.path.length > best.path.length)) best = src;
  }
  return best;
}

/** Splits one version of a tracked file into pieces, deduped by content within the file. */
function piecesFor(rel: string, content: string): Piece[] {
  const src = sourceFor(rel);
  if (!src || !content) return [];
  if (src.splitter === "fact") {
    const parsed = parseFact(content);
    if (!parsed || !parsed.body) return [];
    const { meta, body, bodyLine } = parsed;
    const kind = (FACT_KINDS as readonly string[]).includes(meta.kind) ? meta.kind : "manual";
    return [
      {
        source: kind,
        text: body,
        hash: hash(body),
        lineStart: bodyLine,
        lineEnd: bodyLine + body.split("\n").length - 1,
        metadata: {
          ...(meta.author ? { author: meta.author } : {}),
          ...(meta.sourceRef ? { ref: meta.sourceRef } : {}),
          ...(meta.lines ? { refLines: meta.lines } : {}),
        },
        createdAt: meta.created || undefined,
      },
    ];
  }
  const split = src.splitter === "bullet" ? splitSessionLog : splitDoc;
  const pieces: Piece[] = [];
  const seen = new Set<string>();
  for (const span of split(content, MAX_CHUNK_CHARS)) {
    const h = hash(span.text);
    if (seen.has(h)) continue;
    seen.add(h);
    pieces.push({ source: src.source, text: span.text, hash: h, lineStart: span.lineStart, lineEnd: span.lineEnd, metadata: {} });
  }
  return pieces;
}

async function listMarkdownFilesRecursive(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFilesRecursive(full)));
    } else if (entry.name.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

/** Every tracked file in the working tree, as project-relative posix paths. */
async function trackedFiles(): Promise<string[]> {
  const out = new Set<string>();
  for (const src of SOURCES) {
    const files =
      src.kind === "dir" ? await listMarkdownFilesRecursive(src.path) : existsSync(src.path) ? [src.path] : [];
    for (const f of files) {
      const rel = toPosix(path.relative(PROJECT_DIR, f));
      if (sourceFor(rel) === src) out.add(rel);
    }
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// History — derived from git log, identical on every machine with the same commits
// ---------------------------------------------------------------------------

type HistoryResult = { added: number; rebuilt: boolean };

function historyChunk(p: Piece, rel: string, introduced: [string, string], removedShort: string, removedAt: string): Chunk {
  return {
    id: chunkId(p.source, rel, p.text),
    content: p.text,
    source: p.source,
    sourceRef: rel,
    lineStart: p.lineStart,
    lineEnd: p.lineEnd,
    commit: introduced[0],
    dirty: false,
    embedding: null,
    embedModel: null,
    contentHash: p.hash,
    createdAt: introduced[1],
    supersededAt: removedAt,
    supersededCommit: removedShort,
    metadata: p.metadata,
  };
}

/**
 * Brings history up to HEAD. Incremental from meta.historyCommit when that
 * commit is still an ancestor of HEAD; otherwise (fresh machine, rebase,
 * branch switch, upgrade) rebuilds the last HISTORY_COMMITS commits from
 * scratch. Follows first parents only, so merges count as one change.
 */
function updateHistory(meta: Meta, head: { sha: string; short: string }, forceRebuild: boolean): HistoryResult {
  const incremental =
    !forceRebuild &&
    meta.historyCommit !== null &&
    (meta.historyCommit === head.sha || git(["merge-base", "--is-ancestor", meta.historyCommit, head.sha]) !== null);
  if (incremental && meta.historyCommit === head.sha) return { added: 0, rebuilt: false };

  if (!incremental) {
    memory = memory.filter((c) => !c.supersededAt);
    meta.introduced = {};
  }
  const baseArgs = [
    "log",
    "--first-parent",
    "--diff-merges=first-parent",
    "--no-renames",
    "--name-status",
    "--relative",
    "--format=%x1e%H%x1f%h%x1f%cI",
  ];
  const range = incremental ? [`${meta.historyCommit}..${head.sha}`] : ["-n", String(HISTORY_COMMITS), head.sha];
  const logArgs = [...baseArgs, ...range, "--", ...TRACKED_PATHSPECS];
  // --diff-merges needs git 2.31+; older git already diffs first-parent merges this way under --first-parent.
  const logOut = git(logArgs) ?? git(logArgs.filter((a) => !a.startsWith("--diff-merges"))) ?? "";
  const commits = parseGitLog(logOut).reverse();

  // For text that predates the walked window, the best attribution is the
  // last commit that touched its file before the window started.
  const oldest = commits[0];
  const baseRev = !incremental && oldest && git(["rev-parse", "--verify", "-q", `${oldest.sha}^1`]) !== null ? `${oldest.sha}^1` : null;
  const preWindow = new Map<string, [string, string] | null>();
  const preWindowInfo = (rel: string, fallback: [string, string]): [string, string] => {
    if (incremental || !baseRev) return fallback;
    if (!preWindow.has(rel)) {
      const out = git(["log", "-1", "--format=%h%x1f%cI", baseRev, "--", rel])?.trim();
      preWindow.set(rel, out ? (out.split("\x1f") as [string, string]) : null);
    }
    return preWindow.get(rel) ?? fallback;
  };

  const added = walkHistory({
    commits,
    introduced: meta.introduced,
    owned: (rel) => sourceFor(rel) !== null,
    piecesAt: (rev, rel) => piecesFor(rel, gitShow(rev, rel) ?? ""),
    fallbackIntro: (rel, commit) => preWindowInfo(rel, [commit.short, commit.date]),
    onRemoved: (p, rel, introducedBy, commit) => {
      memory.push(historyChunk(p, rel, introducedBy, commit.short, commit.date));
    },
  });

  if (!incremental) {
    // Text at HEAD that the window never saw being added.
    for (const rel of (git(["ls-files", "--", ...TRACKED_PATHSPECS]) ?? "").split("\n").filter(Boolean)) {
      if (!sourceFor(rel)) continue;
      const content = gitShow(head.sha, rel);
      if (!content) continue;
      const intro = (meta.introduced[rel] ??= {});
      for (const p of piecesFor(rel, content)) {
        if (intro[p.hash]) continue;
        const out = git(["log", "-1", "--format=%h%x1f%cI", head.sha, "--", rel])?.trim();
        intro[p.hash] = preWindowInfo(rel, out ? (out.split("\x1f") as [string, string]) : [head.short, new Date().toISOString()]);
      }
    }
  }

  meta.historyCommit = head.sha;
  return { added, rebuilt: !incremental };
}

// ---------------------------------------------------------------------------
// Working tree sync
// ---------------------------------------------------------------------------

type SyncContext = {
  head: { sha: string; short: string } | null;
  introduced: Meta["introduced"];
  embeddingFor: (content: string, contentHash: string) => Promise<number[] | null>;
  stats: { added: number; kept: number; removed: number; withoutEmbedding: number; addedBySource: Record<string, number> };
};

/** Committed-ness of a piece: the commit that introduced it, or HEAD + dirty if it isn't committed yet. */
function provenance(ctx: SyncContext, rel: string, p: Piece): { commit: string | null; dirty: boolean; createdAt: string | null } {
  if (!ctx.head) return { commit: null, dirty: false, createdAt: null };
  const intro = ctx.introduced[rel]?.[p.hash];
  if (intro) return { commit: intro[0], dirty: false, createdAt: intro[1] };
  return { commit: ctx.head.short, dirty: true, createdAt: null };
}

/** Makes the active chunks for one file match its current content. */
async function syncFile(rel: string, content: string, ctx: SyncContext): Promise<void> {
  const pieces = piecesFor(rel, content);
  const active = memory.filter((c) => !c.supersededAt && c.sourceRef === rel && isFileBacked(c));
  const { kept, added, removed } = diffChunks(active, pieces.map((p) => p.hash));
  const now = new Date().toISOString();

  for (const { chunk, index: i } of kept) {
    const p = pieces[i];
    const prov = provenance(ctx, rel, p);
    Object.assign(chunk, {
      source: p.source,
      lineStart: p.lineStart,
      lineEnd: p.lineEnd,
      metadata: p.metadata,
      commit: prov.commit,
      dirty: prov.dirty,
      createdAt: p.createdAt ?? prov.createdAt ?? chunk.createdAt,
    });
    if (!chunk.embedding || chunk.embedModel !== EMBED_MODEL_ID) {
      chunk.embedding = await ctx.embeddingFor(chunk.content, chunk.contentHash);
      chunk.embedModel = chunk.embedding ? EMBED_MODEL_ID : null;
    }
    if (!chunk.embedding) ctx.stats.withoutEmbedding += 1;
    ctx.stats.kept += 1;
  }
  if (removed.length > 0) {
    const drop = new Set(removed);
    memory = memory.filter((c) => !drop.has(c));
    ctx.stats.removed += removed.length;
  }
  for (const i of added) {
    const p = pieces[i];
    const prov = provenance(ctx, rel, p);
    const embedding = await ctx.embeddingFor(p.text, p.hash);
    if (!embedding) ctx.stats.withoutEmbedding += 1;
    memory.push({
      id: chunkId(p.source, rel, p.text),
      content: p.text,
      source: p.source,
      sourceRef: rel,
      lineStart: p.lineStart,
      lineEnd: p.lineEnd,
      commit: prov.commit,
      dirty: prov.dirty,
      embedding,
      embedModel: embedding ? EMBED_MODEL_ID : null,
      contentHash: p.hash,
      createdAt: p.createdAt ?? prov.createdAt ?? now,
      supersededAt: null,
      supersededCommit: null,
      metadata: p.metadata,
    });
    ctx.stats.added += 1;
    ctx.stats.addedBySource[p.source] = (ctx.stats.addedBySource[p.source] ?? 0) + 1;
  }
}

// ---------------------------------------------------------------------------
// Fact files
// ---------------------------------------------------------------------------

type NewFact = {
  content: string;
  kind: string;
  author: string;
  created: string;
  sourceRef?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
};

/** Content hashes of every fact file currently on disk. */
async function existingFactHashes(): Promise<Set<string>> {
  const hashes = new Set<string>();
  for (const f of await listMarkdownFilesRecursive(FACTS_DIR)) {
    const parsed = parseFact(await readFile(f, "utf-8"));
    if (parsed?.body) hashes.add(hash(parsed.body));
  }
  return hashes;
}

/** Writes memory/facts/YYYY-MM-DD-<id>.md and returns its project-relative path. */
async function writeFactFile(fact: NewFact): Promise<string> {
  const body = fact.content.trim();
  const id = hash(body).slice(0, 16);
  const lines =
    fact.lineStart != null ? (fact.lineEnd != null && fact.lineEnd !== fact.lineStart ? `${fact.lineStart}-${fact.lineEnd}` : String(fact.lineStart)) : "";
  await mkdir(FACTS_DIR, { recursive: true });
  const rel = `${FACTS_REL}/${fact.created.slice(0, 10)}-${id}.md`;
  const text = serializeFact(
    { id, kind: fact.kind, author: fact.author, created: fact.created, sourceRef: fact.sourceRef ?? "", lines },
    body,
  );
  await writeFile(path.join(PROJECT_DIR, rel), text);
  return rel;
}

/** Exports facts (from an old memory.ndjson, or local-only chunks) into fact files, skipping ones already on disk. */
async function exportFacts(chunks: Chunk[]): Promise<string[]> {
  const existing = await existingFactHashes();
  const written: string[] = [];
  for (const c of chunks) {
    const body = c.content.trim();
    if (!body || existing.has(hash(body))) continue;
    existing.add(hash(body));
    written.push(
      await writeFactFile({
        content: body,
        kind: (FACT_KINDS as readonly string[]).includes(c.source) ? c.source : "manual",
        author: typeof c.metadata?.author === "string" ? c.metadata.author : currentAuthor(),
        created: c.createdAt,
        sourceRef: c.sourceRef,
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
      }),
    );
  }
  return written;
}

/** Facts saved by older CAMS versions that live only in this machine's memory.ndjson. */
function localOnlyFacts(chunks: Chunk[]): Chunk[] {
  return chunks.filter(
    (c) => (FACT_KINDS as readonly string[]).includes(c.source) && !isFactRef(c.sourceRef) && !c.supersededAt,
  );
}

// ---------------------------------------------------------------------------
// Backfill
// ---------------------------------------------------------------------------

type BackfillResult = {
  filesScanned: number;
  added: number;
  kept: number;
  removed: number;
  historyAdded: number;
  historyRebuilt: boolean;
  embedded: number;
  reusedEmbeddings: number;
  withoutEmbedding: number;
  pruned: number;
  migratedFacts: string[];
  addedBySource: Record<string, number>;
  embedError: string | null;
};

async function backfillLocked(opts: { rebuild?: boolean } = {}): Promise<BackfillResult> {
  const cacheMissing = !existsSync(MEMORY_FILE);

  // Facts from older versions lived only in memory.ndjson; give them files so they're shared.
  const orphans = localOnlyFacts(memory);
  const migratedFacts = orphans.length > 0 ? await exportFacts(orphans) : [];
  memory = memory.filter(
    (c) => !c.legacy && !((FACT_KINDS as readonly string[]).includes(c.source) && !isFactRef(c.sourceRef)),
  );

  const head = headCommit();
  let meta = readMeta();
  const forceRebuild = !!opts.rebuild || cacheMissing || meta === null;
  if (!meta || forceRebuild) meta = { schemaVersion: META_SCHEMA, historyCommit: null, introduced: {} };
  let history: HistoryResult = { added: 0, rebuilt: false };
  if (head) {
    history = updateHistory(meta, head, forceRebuild);
  } else {
    memory = memory.filter((c) => !c.supersededAt);
    meta = { schemaVersion: META_SCHEMA, historyCommit: null, introduced: {} };
  }

  const embedStats: EmbedStats = { embedded: 0, reused: 0, error: null };
  const ctx: SyncContext = {
    head,
    introduced: meta.introduced,
    embeddingFor: makeEmbedder(embedStats),
    stats: { added: 0, kept: 0, removed: 0, withoutEmbedding: 0, addedBySource: {} },
  };
  const files = await trackedFiles();
  for (const rel of files) {
    await syncFile(rel, await readFile(path.join(PROJECT_DIR, rel), "utf-8"), ctx);
  }
  // Files deleted, renamed, or moved to a more specific source.
  const present = new Set(files);
  const gone = memory.filter((c) => !c.supersededAt && isFileBacked(c) && !present.has(c.sourceRef ?? ""));
  if (gone.length > 0) {
    const drop = new Set(gone);
    memory = memory.filter((c) => !drop.has(c));
    ctx.stats.removed += gone.length;
  }

  let pruned = 0;
  const superseded = memory.filter((c) => c.supersededAt);
  if (superseded.length > HISTORY_MAX) {
    const drop = new Set(
      superseded.sort((a, b) => (a.supersededAt! < b.supersededAt! ? -1 : 1)).slice(0, superseded.length - HISTORY_MAX),
    );
    memory = memory.filter((c) => !drop.has(c));
    pruned = drop.size;
  }

  await persistMemory();
  await persistMeta(meta);
  return {
    filesScanned: files.length,
    added: ctx.stats.added,
    kept: ctx.stats.kept,
    removed: ctx.stats.removed,
    historyAdded: history.added,
    historyRebuilt: history.rebuilt,
    embedded: embedStats.embedded,
    reusedEmbeddings: embedStats.reused,
    withoutEmbedding: ctx.stats.withoutEmbedding,
    pruned,
    migratedFacts,
    addedBySource: ctx.stats.addedBySource,
    embedError: embedStats.error,
  };
}

function backfill(opts: { rebuild?: boolean } = {}): Promise<BackfillResult> {
  return withLock(() => backfillLocked(opts));
}

/** Imports the facts from another machine's memory.ndjson as fact files, then backfills. */
async function importFrom(file: string): Promise<{ written: string[]; result: BackfillResult }> {
  const raw = await readFile(path.resolve(file), "utf-8");
  const chunks = raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => normalizeChunk(JSON.parse(l)));
  return withLock(async () => {
    const written = await exportFacts(localOnlyFacts(chunks));
    return { written, result: await backfillLocked() };
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

type Hit = { chunk: Chunk; kwRank: number | null; vecRank: number | null };
type SearchResult = { hits: Hit[]; mode: "hybrid" | "keyword-only"; note: string | null };

const FUSION_DEPTH = 50;

async function search(
  question: string,
  opts: { k: number; sources?: string[]; includeSuperseded?: boolean; sourceRef?: string },
): Promise<SearchResult> {
  await ensureFresh();
  const allowed = (i: number) => {
    const c = memory[i];
    if (!opts.includeSuperseded && c.supersededAt) return false;
    if (opts.sources && opts.sources.length > 0 && !opts.sources.includes(c.source)) return false;
    if (opts.sourceRef && c.sourceRef !== opts.sourceRef && !c.sourceRef?.endsWith(`/${opts.sourceRef}`)) return false;
    return true;
  };

  const queryTokens = expandTokens(tokenize(question), getAliasGroups());
  const kwRanking = getIndex()
    .search(queryTokens, allowed)
    .slice(0, FUSION_DEPTH)
    .map((r) => r.doc);

  let vecRanking: number[] = [];
  let note: string | null = null;
  const vectorCandidates = memory
    .map((_, i) => i)
    .filter((i) => allowed(i) && memory[i].embedding && memory[i].embedModel === EMBED_MODEL_ID);
  if (vectorCandidates.length > 0) {
    const q = await tryEmbed(question);
    if ("vector" in q) {
      vecRanking = vectorCandidates
        .map((i) => ({ i, s: cosineSimilarity(q.vector, memory[i].embedding!) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, FUSION_DEPTH)
        .map((r) => r.i);
    } else {
      note = `embedder unavailable: ${q.error}`;
    }
  } else if (memory.some((c) => !c.supersededAt)) {
    note = "no chunks embedded with the current model — run cams_backfill once an embedder is configured";
  }

  const fused = reciprocalRankFusion([kwRanking, vecRanking]).slice(0, opts.k);
  return {
    hits: fused.map((f) => ({ chunk: memory[f.item], kwRank: f.ranks[0], vecRank: f.ranks[1] })),
    mode: vecRanking.length > 0 ? "hybrid" : "keyword-only",
    note,
  };
}

function lineLabel(start: number | null, end: number | null): string {
  if (start === null) return "";
  return start === end || end === null ? ` L${start}` : ` L${start}-${end}`;
}

function citation(c: Chunk): string {
  const parts = [c.source];
  if (c.sourceRef) {
    const at = c.commit ? ` @ ${c.commit}${c.dirty ? " (uncommitted)" : ""}` : "";
    parts.push(`${c.sourceRef}${lineLabel(c.lineStart, c.lineEnd)}${at}`);
  } else if (c.commit) {
    parts.push(`@ ${c.commit}`);
  }
  if (typeof c.metadata.author === "string") parts.push(`by ${c.metadata.author}`);
  if (typeof c.metadata.ref === "string") {
    parts.push(`re ${c.metadata.ref}${typeof c.metadata.refLines === "string" ? ` L${c.metadata.refLines}` : ""}`);
  }
  return parts.join(" | ");
}

function rankLabel(h: Hit): string {
  const r = [h.kwRank ? `kw #${h.kwRank}` : null, h.vecRank ? `vec #${h.vecRank}` : null].filter(Boolean);
  return r.join(", ");
}

function modeLine(r: SearchResult): string {
  return r.mode === "keyword-only" ? `(keyword-only search${r.note ? `: ${r.note}` : ""})\n\n` : "";
}

function formatHits(r: SearchResult): string {
  if (r.hits.length === 0) {
    const empty = memory.length === 0 ? "No memory ingested yet — run cams_backfill first." : "No matching memory.";
    return modeLine(r) + empty;
  }
  return (
    modeLine(r) +
    r.hits
      .map((h, i) => {
        const old = h.chunk.supersededAt
          ? ` | superseded ${h.chunk.supersededAt.slice(0, 10)}${h.chunk.supersededCommit ? ` @ ${h.chunk.supersededCommit}` : ""}`
          : "";
        return `${i + 1}. [${citation(h.chunk)} | ${rankLabel(h)}${old}]\n${h.chunk.content}`;
      })
      .join("\n\n")
  );
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "{PROJECT_NAME}-cams", version: "3.0.0" });

server.registerTool(
  "cams_query",
  {
    title: "Search project memory (CAMS)",
    description:
      "Hybrid keyword + semantic search over this project's decisions, facts, tasks, and history — shared by everyone on the team via git. Use this before assuming something is unknown or before repeating past work — ask it a plain-language question; exact identifiers (task IDs, branch names, file names) match too. Before creating any branch, use it with sources: [\"tasks-md\"] to check what's currently In Progress and what it touches. Each result cites file, line range, commit, and author where known.",
    inputSchema: {
      question: z.string().describe("A plain-language question or identifier, e.g. 'is the staging DB migration done?' or 'proj-42'"),
      k: z.number().int().min(1).max(20).optional().describe("How many results to return (default 5)"),
      sources: z
        .array(z.string())
        .optional()
        .describe(`Only search these sources. Known sources: ${ALL_SOURCES.join(", ")}`),
      includeSuperseded: z
        .boolean()
        .optional()
        .describe("Also return text that has since been changed or deleted in git (default false)"),
    },
  },
  async ({ question, k, sources, includeSuperseded }) => {
    const r = await search(question, { k: k ?? 5, sources, includeSuperseded });
    return { content: [{ type: "text", text: formatHits(r) }] };
  },
);

server.registerTool(
  "cams_history",
  {
    title: "How project memory changed over time (CAMS)",
    description:
      "Shows current and superseded (changed or deleted) memory in time order, derived from git history — when and at which commit each version appeared and was replaced. Use it to answer 'when/how did this decision or task change?'. Give a question, a sourceRef (file path like 'decision.md'), or both.",
    inputSchema: {
      question: z.string().optional().describe("What to look for, e.g. 'auth provider decision'"),
      sourceRef: z.string().optional().describe("Limit to one file, e.g. 'decision.md' or 'sessions/2026-01-05.md'"),
      k: z.number().int().min(1).max(50).optional().describe("How many entries to return (default 10)"),
    },
  },
  async ({ question, sourceRef, k }) => {
    const limit = k ?? 10;
    if (!question && !sourceRef) {
      return { content: [{ type: "text", text: "Provide a question, a sourceRef, or both." }] };
    }
    let chunks: Chunk[];
    let prefix = "";
    if (question) {
      const r = await search(question, { k: limit, includeSuperseded: true, sourceRef });
      chunks = r.hits.map((h) => h.chunk);
      prefix = modeLine(r);
    } else {
      await ensureFresh();
      chunks = memory
        .filter((c) => c.sourceRef === sourceRef || c.sourceRef?.endsWith(`/${sourceRef}`))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit);
    }
    if (chunks.length === 0) return { content: [{ type: "text", text: prefix + "No matching memory." }] };
    const text = chunks
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((c) => {
        const added = `added ${c.createdAt.slice(0, 10)}${c.commit ? ` @ ${c.commit}` : ""}`;
        const status = c.supersededAt
          ? `superseded ${c.supersededAt.slice(0, 10)}${c.supersededCommit ? ` @ ${c.supersededCommit}` : ""}`
          : "current";
        return `- [${citation(c)} | ${added} | ${status}]\n${c.content}`;
      })
      .join("\n\n");
    return { content: [{ type: "text", text: prefix + text }] };
  },
);

server.registerTool(
  "cams_ingest",
  {
    title: "Save a decision or finding to project memory (CAMS)",
    description:
      "Save a real decision, finding, or piece of context to shared project memory. It is written as a file under memory/facts/ — commit it with your tracker changes so teammates get it on their next pull. Use this after making or discovering something durably important — not for trivial/ephemeral details, and never for secrets (content that looks like a key or password is refused).",
    inputSchema: {
      content: z.string().describe("The decision/finding, written as a self-contained statement"),
      source: z.enum(FACT_KINDS).default("manual").describe("Kind of fact"),
      sourceRef: z.string().optional().describe("Optional reference, e.g. a file path or PR URL"),
      lineStart: z.number().int().min(1).optional().describe("First line in sourceRef this refers to"),
      lineEnd: z.number().int().min(1).optional().describe("Last line in sourceRef this refers to"),
    },
  },
  async ({ content, source, sourceRef, lineStart, lineEnd }) => {
    const secret = detectSecret(content);
    if (secret) {
      return {
        content: [
          {
            type: "text",
            text: `Not saved: the content looks like it contains a secret (${secret}). Facts are committed to git and shared with the whole team — remove the secret and describe where it lives instead (e.g. "stored in the team secrets manager under X").`,
          },
        ],
      };
    }
    const outcome = await withLock(async () => {
      const body = content.trim();
      const contentHash = hash(body);
      const existing = memory.find((c) => !c.supersededAt && isFactRef(c.sourceRef) && c.contentHash === contentHash);
      if (existing) return { rel: existing.sourceRef!, inserted: false, embedError: null as string | null };
      if ((await existingFactHashes()).has(contentHash)) {
        return { rel: null, inserted: false, embedError: null };
      }
      const rel = await writeFactFile({
        content: body,
        kind: source,
        author: currentAuthor(),
        created: new Date().toISOString(),
        sourceRef,
        lineStart,
        lineEnd,
      });
      const stats: EmbedStats = { embedded: 0, reused: 0, error: null };
      const ctx: SyncContext = {
        head: headCommit(),
        introduced: readMeta()?.introduced ?? {},
        embeddingFor: makeEmbedder(stats),
        stats: { added: 0, kept: 0, removed: 0, withoutEmbedding: 0, addedBySource: {} },
      };
      await syncFile(rel, await readFile(path.join(PROJECT_DIR, rel), "utf-8"), ctx);
      await persistMemory();
      return { rel, inserted: true, embedError: stats.error };
    });
    let text: string;
    if (!outcome.inserted) {
      text = `Already saved${outcome.rel ? ` in ${outcome.rel}` : " in memory/facts/"} — identical content already exists.`;
    } else {
      text = `Saved to ${outcome.rel}. Commit and push it with your tracker changes so teammates get it.`;
      if (outcome.embedError) {
        text += ` (No embedding — keyword search will find it; run cams_backfill once the embedder works: ${outcome.embedError})`;
      }
    }
    return { content: [{ type: "text", text }] };
  },
);

function summarize(r: BackfillResult): string {
  const bySource = Object.entries(r.addedBySource)
    .map(([s, n]) => `${s}: ${n}`)
    .join(", ");
  let text =
    `Scanned ${r.filesScanned} files. Added ${r.added} chunks (${bySource || "none new"}), kept ${r.kept} unchanged, removed ${r.removed}.` +
    ` History: ${r.historyRebuilt ? "rebuilt from git, " : ""}${r.historyAdded} superseded versions added.` +
    ` Embeddings: ${r.embedded} new, ${r.reusedEmbeddings} reused from cache.`;
  if (r.migratedFacts.length > 0) {
    text += ` Moved ${r.migratedFacts.length} locally-saved facts into ${FACTS_REL}/ — commit them so teammates get them.`;
  }
  if (r.pruned > 0) text += ` Pruned ${r.pruned} oldest superseded chunks.`;
  if (r.withoutEmbedding > 0) {
    text += ` ${r.withoutEmbedding} chunks have no embedding (keyword search still finds them)${r.embedError ? `: ${r.embedError}` : ""}.`;
  }
  return text;
}

server.registerTool(
  "cams_backfill",
  {
    title: "Sync memory from everything about this project (CAMS)",
    description:
      "Syncs every source this project's memory covers: session logs, log.md, tasks.md, sprint.md, decision.md, docs/ (including OpenSpec design changes), and shared facts in memory/facts/, plus history from git log. Safe and cheap to rerun anytime — unchanged text is never re-embedded. Git hooks run it after pulls and branch switches; run it yourself at session start and after editing trackers.",
    inputSchema: {},
  },
  async () => {
    const result = await backfill();
    return { content: [{ type: "text", text: summarize(result) }] };
  },
);

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.argv.includes("--import")) {
    const file = argValue("--import");
    if (!file) throw new Error("Usage: npm run import -- <path/to/old/memory.ndjson>");
    const { written, result } = await importFrom(file);
    console.log(
      written.length > 0
        ? `Imported ${written.length} facts into ${FACTS_REL}/ — review and commit them:\n  ${written.join("\n  ")}`
        : "No new facts to import (all already present).",
    );
    console.log(`Backfill complete. ${summarize(result)}`);
    return;
  }
  if (process.argv.includes("--backfill")) {
    console.log(`Backfill complete. ${summarize(await backfill({ rebuild: process.argv.includes("--rebuild") }))}`);
    return;
  }
  if (process.argv.includes("--query")) {
    const question = argValue("--query");
    if (!question) throw new Error('Usage: npm run query -- "your question"');
    console.log(formatHits(await search(question, { k: 5 })));
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("CAMS fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
