/**
 * CAMS — Coding Agent Memory System ({PROJECT_NAME} instance).
 * Local, self-hosted semantic memory MCP server.
 *
 * Storage: a single NDJSON file (memory.ndjson), loaded into memory once at
 * server start and scanned in-process at query time. No database server, no
 * Docker — at the scale one project's own decision history runs at
 * (hundreds to low-thousands of chunks), an exact in-memory cosine-similarity
 * scan is the same algorithm a database would run with no index, just
 * without the server. Revisit only if this file ever grows past ~50k lines.
 *
 * Embeddings: pluggable via EMBED_PROVIDER — 'openai' (text-embedding-3-small,
 * default), 'voyage' (voyage-3-lite), or 'ollama' (mxbai-embed-large, local,
 * for anyone who already runs it). Switching provider on an existing project
 * invalidates memory.ndjson's vectors — re-run cams_backfill after a change.
 *
 * Single-project scope on purpose: no multi-tenant/project-scoping logic at
 * all. This server is wired via project-level MCP config (.mcp.json), so it
 * only loads when Claude Code / Cursor is opened in this project.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createHash } from "node:crypto";
import { readFile, writeFile, readdir, stat, appendFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

// Most embedding models cap out well under 8k tokens; keep chunks well under
// that (roughly 4 chars/token for English prose) so nothing gets silently
// truncated during embedding.
const MAX_CHUNK_CHARS = 1800;

const PROJECT_DIR = path.resolve(__dirname, "..", "..");
const SESSIONS_DIR = path.join(PROJECT_DIR, "sessions");
const MEMORY_FILE = path.join(__dirname, "memory.ndjson");

/**
 * Every source this backfill walks, rooted at the project directory itself
 * (no external vault). `dir` entries are scanned recursively; missing ones
 * are skipped, not an error. `splitter` picks the chunking strategy —
 * session logs and log.md are bullet-per-entry; tasks/sprint/decision/docs
 * are heading-based prose. `refresh: true` means this source is mutable
 * current-state (not append-only history) — its old chunks get deleted and
 * fully replaced on every backfill, rather than dedupe-and-append, so CAMS
 * never accumulates stale historical snapshots of a file that's constantly
 * edited in place — this matters in particular for tasks.md, since
 * task-kickoff's collision check depends on it reflecting current state.
 */
const SOURCES: Array<{
  kind: "dir" | "file";
  path: string;
  source: string;
  splitter: "bullet" | "heading";
  refresh?: boolean;
}> = [
  { kind: "dir", path: SESSIONS_DIR, source: "session-log", splitter: "bullet" },
  { kind: "file", path: path.join(PROJECT_DIR, "log.md"), source: "log-md", splitter: "bullet" },
  { kind: "file", path: path.join(PROJECT_DIR, "tasks.md"), source: "tasks-md", splitter: "heading", refresh: true },
  { kind: "file", path: path.join(PROJECT_DIR, "sprint.md"), source: "sprint-md", splitter: "heading", refresh: true },
  { kind: "file", path: path.join(PROJECT_DIR, "decision.md"), source: "decision-md", splitter: "heading", refresh: true },
  { kind: "dir", path: path.join(PROJECT_DIR, "docs"), source: "doc", splitter: "heading" },
  { kind: "dir", path: path.join(PROJECT_DIR, "docs", "design", "changes"), source: "design-change", splitter: "heading" },
  { kind: "dir", path: path.join(PROJECT_DIR, "docs", "design", "archive"), source: "design-archive", splitter: "heading" },
];

// ---------------------------------------------------------------------------
// Storage — NDJSON file, loaded once, scanned in-process
// ---------------------------------------------------------------------------

type Chunk = {
  id: string;
  content: string;
  source: string;
  sourceRef: string | null;
  metadata: Record<string, unknown>;
  embedding: number[];
  contentHash: string;
  createdAt: string;
};

let memory: Chunk[] = [];
let loaded = false;

async function loadMemory(): Promise<void> {
  if (loaded) return;
  if (existsSync(MEMORY_FILE)) {
    const raw = await readFile(MEMORY_FILE, "utf-8");
    memory = raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Chunk);
  }
  loaded = true;
}

async function persistMemory(): Promise<void> {
  const lines = memory.map((c) => JSON.stringify(c)).join("\n");
  await writeFile(MEMORY_FILE, lines.length > 0 ? lines + "\n" : "");
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

async function ingestOne(
  content: string,
  source: string,
  sourceRef: string | undefined,
  metadata: Record<string, unknown>,
): Promise<{ inserted: boolean; id: string }> {
  await loadMemory();
  const contentHash = hash(content);
  const existing = memory.find((c) => c.contentHash === contentHash);
  if (existing) return { inserted: false, id: existing.id };

  const embedding = await embed(content);
  const chunk: Chunk = {
    id: contentHash.slice(0, 16),
    content,
    source,
    sourceRef: sourceRef ?? null,
    metadata,
    embedding,
    contentHash,
    createdAt: new Date().toISOString(),
  };
  memory.push(chunk);
  await appendFile(MEMORY_FILE, JSON.stringify(chunk) + "\n");
  return { inserted: true, id: chunk.id };
}

/** Enforces MAX_CHUNK_CHARS, splitting an oversized chunk on paragraph breaks. */
function enforceChunkSizeCap(rawChunks: string[]): string[] {
  const chunks: string[] = [];
  for (const chunk of rawChunks) {
    if (chunk.length <= MAX_CHUNK_CHARS) {
      chunks.push(chunk);
      continue;
    }
    let remaining = chunk;
    while (remaining.length > MAX_CHUNK_CHARS) {
      let splitAt = remaining.lastIndexOf("\n\n", MAX_CHUNK_CHARS);
      if (splitAt < MAX_CHUNK_CHARS * 0.5) splitAt = MAX_CHUNK_CHARS;
      chunks.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }
    if (remaining.length > 0) chunks.push(remaining);
  }
  return chunks.filter((c) => c.length > 40);
}

/** Splits a file into one chunk per bullet (any indent level) or heading. */
function splitSessionLog(fileContent: string): string[] {
  const lines = fileContent.split("\n");
  const rawChunks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (/^\s*- /.test(line) || /^#{1,6} /.test(line)) {
      if (current.length > 0) rawChunks.push(current.join("\n").trim());
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) rawChunks.push(current.join("\n").trim());
  return enforceChunkSizeCap(rawChunks);
}

/** Splits a heading-organized prose doc into one chunk per heading section. */
function splitDoc(fileContent: string): string[] {
  const lines = fileContent.split("\n");
  const rawChunks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (/^#{1,6} /.test(line)) {
      if (current.length > 0) rawChunks.push(current.join("\n").trim());
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) rawChunks.push(current.join("\n").trim());
  return enforceChunkSizeCap(rawChunks);
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

async function backfill(): Promise<{
  filesScanned: number;
  chunksIngested: number;
  chunksSkipped: number;
  bySource: Record<string, number>;
}> {
  await loadMemory();
  let filesScanned = 0;
  let chunksIngested = 0;
  let chunksSkipped = 0;
  const bySource: Record<string, number> = {};

  for (const src of SOURCES) {
    let filePaths: string[];
    if (src.kind === "dir") {
      filePaths = await listMarkdownFilesRecursive(src.path);
    } else {
      try {
        await stat(src.path);
        filePaths = [src.path];
      } catch {
        filePaths = [];
      }
    }

    if (src.refresh && filePaths.length > 0) {
      memory = memory.filter((c) => c.source !== src.source);
    }

    for (const filePath of filePaths) {
      filesScanned += 1;
      const content = await readFile(filePath, "utf-8");
      const chunks = src.splitter === "bullet" ? splitSessionLog(content) : splitDoc(content);
      const sourceRef = src.kind === "dir" ? path.relative(src.path, filePath) : path.basename(filePath);
      for (const chunk of chunks) {
        const { inserted } = await ingestOne(chunk, src.source, sourceRef, {});
        if (inserted) {
          chunksIngested += 1;
          bySource[src.source] = (bySource[src.source] ?? 0) + 1;
        } else {
          chunksSkipped += 1;
        }
      }
    }
  }

  await persistMemory();
  return { filesScanned, chunksIngested, chunksSkipped, bySource };
}

async function query(question: string, k: number): Promise<
  Array<{ content: string; source: string; sourceRef: string | null; similarity: number }>
> {
  await loadMemory();
  const vector = await embed(question);
  return memory
    .map((c) => ({
      content: c.content,
      source: c.source,
      sourceRef: c.sourceRef,
      similarity: cosineSimilarity(vector, c.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const server = new McpServer({ name: "{PROJECT_NAME}-cams", version: "1.0.0" });

server.registerTool(
  "cams_query",
  {
    title: "Search project memory (CAMS)",
    description:
      "Semantic search over this project's decisions, findings, and history. Use this before assuming something is unknown or before repeating past work — ask it a plain-language question. Also use it before creating any branch, to check what's currently In Progress and what it touches.",
    inputSchema: {
      question: z.string().describe("A plain-language question, e.g. 'is the staging DB migration done?'"),
      k: z.number().int().min(1).max(20).optional().describe("How many results to return (default 5)"),
    },
  },
  async ({ question, k }) => {
    const results = await query(question, k ?? 5);
    if (results.length === 0) {
      return { content: [{ type: "text", text: "No memory ingested yet — run cams_backfill first." }] };
    }
    const text = results
      .map(
        (r, i) =>
          `${i + 1}. [${(r.similarity * 100).toFixed(0)}% match, source: ${r.source}${r.sourceRef ? ` — ${r.sourceRef}` : ""}]\n${r.content}`,
      )
      .join("\n\n");
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "cams_ingest",
  {
    title: "Save a decision or finding to project memory (CAMS)",
    description:
      "Save a real decision, finding, or piece of context to persistent project memory so future sessions can recall it semantically. Use this after making or discovering something durably important — not for trivial/ephemeral details.",
    inputSchema: {
      content: z.string().describe("The decision/finding, written as a self-contained statement"),
      source: z.enum(["manual", "decision", "task"]).default("manual"),
      sourceRef: z.string().optional().describe("Optional reference, e.g. a file path or PR URL"),
    },
  },
  async ({ content, source, sourceRef }) => {
    const { inserted, id } = await ingestOne(content, source, sourceRef, {});
    return {
      content: [
        {
          type: "text",
          text: inserted ? `Saved (id: ${id}).` : `Already saved (id: ${id}) — identical content already exists.`,
        },
      ],
    };
  },
);

server.registerTool(
  "cams_backfill",
  {
    title: "Sync memory from everything about this project (CAMS)",
    description:
      "Bulk ingest of every source this project's memory should cover: session logs, log.md, tasks.md, sprint.md, decision.md, and docs/ (including OpenSpec design changes). Safe/cheap to rerun anytime — historical sources dedupe on content hash (no duplicates), tasks.md/sprint.md/decision.md are fully refreshed each run since they're current state, not history. Run this at the start of every session, not just once.",
    inputSchema: {},
  },
  async () => {
    const result = await backfill();
    const bySourceText = Object.entries(result.bySource)
      .map(([s, n]) => `${s}: ${n}`)
      .join(", ");
    return {
      content: [
        {
          type: "text",
          text: `Scanned ${result.filesScanned} files. Ingested ${result.chunksIngested} new chunks (${bySourceText || "none new"}), skipped ${result.chunksSkipped} already-present.`,
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  if (process.argv.includes("--backfill")) {
    const result = await backfill();
    const bySourceText = Object.entries(result.bySource)
      .map(([s, n]) => `${s}: ${n}`)
      .join(", ");
    console.log(
      `Backfill complete: ${result.filesScanned} files scanned, ${result.chunksIngested} chunks ingested (${bySourceText || "none new"}), ${result.chunksSkipped} skipped (already present).`,
    );
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("CAMS fatal error:", err);
  process.exit(1);
});
