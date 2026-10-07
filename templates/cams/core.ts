/**
 * CAMS core — pure functions with no I/O, so they can be tested without
 * starting the MCP server: markdown splitters that keep line ranges, a
 * tokenizer tuned for identifiers (task IDs, branch names, file paths),
 * an in-memory BM25 index, vocabulary alias expansion, reciprocal rank
 * fusion, and the per-file diff backfill uses to avoid re-embedding.
 */

// ---------------------------------------------------------------------------
// Splitting — every chunk remembers which lines of its file it came from
// ---------------------------------------------------------------------------

export type Span = { text: string; lineStart: number; lineEnd: number };

/** Chunks shorter than this carry too little meaning to be worth indexing. */
export const MIN_CHUNK_CHARS = 40;

/**
 * Builds a span from lines[from..to] (inclusive, 0-based indices into
 * `lines`), dropping blank lines at either edge. `firstLine` is the 1-based
 * file line number of lines[0]. Returns null if nothing but blanks remain.
 */
function makeSpan(lines: string[], from: number, to: number, firstLine: number): Span | null {
  while (from <= to && lines[from].trim() === "") from++;
  while (to >= from && lines[to].trim() === "") to--;
  if (from > to) return null;
  return {
    text: lines.slice(from, to + 1).join("\n").trim(),
    lineStart: firstLine + from,
    lineEnd: firstLine + to,
  };
}

/**
 * Splits one oversized span into pieces of at most `max` chars, preferring
 * paragraph breaks, and keeps each piece's line range accurate. A single
 * line longer than `max` is hard-split; its pieces share that line number.
 */
function capSpan(span: Span, max: number): Span[] {
  if (span.text.length <= max) return [span];
  const lines = span.text.split("\n");
  const out: Span[] = [];
  let start = 0;
  while (start < lines.length) {
    let len = 0;
    let end = start;
    let lastBlank = -1;
    let lenAtLastBlank = 0;
    while (end < lines.length && len + lines[end].length + 1 <= max) {
      if (end > start && lines[end].trim() === "") {
        lastBlank = end;
        lenAtLastBlank = len;
      }
      len += lines[end].length + 1;
      end++;
    }
    if (end === start) {
      const line = lines[start];
      for (let i = 0; i < line.length; i += max) {
        const lineNo = span.lineStart + start;
        out.push({ text: line.slice(i, i + max).trim(), lineStart: lineNo, lineEnd: lineNo });
      }
      start++;
      continue;
    }
    if (end < lines.length && lastBlank > start && lenAtLastBlank >= max * 0.5) end = lastBlank;
    const piece = makeSpan(lines, start, end - 1, span.lineStart);
    if (piece) out.push(piece);
    start = end;
  }
  return out;
}

/** Enforces `max` chars per chunk and drops chunks too short to be useful. */
export function enforceChunkSizeCap(spans: Span[], max: number): Span[] {
  return spans.flatMap((s) => capSpan(s, max)).filter((s) => s.text.length > MIN_CHUNK_CHARS);
}

function splitOn(fileContent: string, isBoundary: (line: string) => boolean, max: number): Span[] {
  const lines = fileContent.split("\n");
  const raw: Span[] = [];
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isBoundary(lines[i])) {
      if (start !== -1) {
        const span = makeSpan(lines, start, i - 1, 1);
        if (span) raw.push(span);
      }
      start = i;
    }
  }
  if (start !== -1) {
    const span = makeSpan(lines, start, lines.length - 1, 1);
    if (span) raw.push(span);
  }
  return enforceChunkSizeCap(raw, max);
}

/** One chunk per bullet (any indent level) or heading. */
export function splitSessionLog(fileContent: string, max: number): Span[] {
  return splitOn(fileContent, (l) => /^\s*- /.test(l) || /^#{1,6} /.test(l), max);
}

/** One chunk per heading section. */
export function splitDoc(fileContent: string, max: number): Span[] {
  return splitOn(fileContent, (l) => /^#{1,6} /.test(l), max);
}

// ---------------------------------------------------------------------------
// Tokenizing
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "do", "does", "for", "from",
  "has", "have", "how", "i", "if", "in", "into", "is", "it", "its", "of", "on", "or",
  "that", "the", "their", "then", "there", "these", "this", "to", "was", "we", "were",
  "what", "when", "where", "which", "who", "why", "will", "with", "you",
]);

const TOKEN_RE = /[\p{L}\p{N}](?:[\p{L}\p{N}._/#-]*[\p{L}\p{N}])?/gu;
const PART_SEP = /[._/#-]+/;

/**
 * Lowercases and splits text into tokens. Identifier-like tokens are kept
 * whole *and* split into parts, so `feat/proj-42-auth` yields
 * `feat/proj-42-auth`, `feat`, `proj`, `42`, `auth` — an exact branch name
 * or task ID matches exactly, and its pieces still match loosely.
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().match(TOKEN_RE) ?? []) {
    const parts = raw.split(PART_SEP).filter(Boolean);
    if (parts.length > 1) out.push(raw);
    for (const p of parts) if (!STOPWORDS.has(p)) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vocabulary — alias groups like kubernetes == k8s
// ---------------------------------------------------------------------------

export type Vocab = Record<string, string[]>;

/** Turns `{ term: [aliases] }` into groups of token sequences. */
export function buildAliasGroups(vocab: Vocab | undefined): string[][][] {
  if (!vocab) return [];
  const groups: string[][][] = [];
  for (const [term, aliases] of Object.entries(vocab)) {
    if (!Array.isArray(aliases)) continue;
    const members = [term, ...aliases]
      .filter((m): m is string => typeof m === "string")
      .map((m) => tokenize(m))
      .filter((t) => t.length > 0);
    if (members.length > 1) groups.push(members);
  }
  return groups;
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Adds every alias of any group a query mentions, in both directions:
 * a query for `k8s` also searches `kubernetes`, and vice versa.
 */
export function expandTokens(tokens: string[], groups: string[][][]): string[] {
  const out = new Set(tokens);
  for (const members of groups) {
    if (members.some((m) => containsSequence(tokens, m))) {
      for (const m of members) for (const t of m) out.add(t);
    }
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// BM25
// ---------------------------------------------------------------------------

export class Bm25Index {
  private readonly postings = new Map<string, Array<[doc: number, tf: number]>>();
  private readonly lengths: number[];
  private readonly avgLength: number;

  constructor(docs: string[], private readonly k1 = 1.2, private readonly b = 0.75) {
    this.lengths = new Array(docs.length);
    let total = 0;
    docs.forEach((text, doc) => {
      const tokens = tokenize(text);
      this.lengths[doc] = tokens.length;
      total += tokens.length;
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const [t, n] of tf) {
        let list = this.postings.get(t);
        if (!list) this.postings.set(t, (list = []));
        list.push([doc, n]);
      }
    });
    this.avgLength = docs.length > 0 ? total / docs.length : 0;
  }

  /** Returns matching doc indices, best first. `allowed` restricts the candidates. */
  search(queryTokens: string[], allowed?: (doc: number) => boolean): Array<{ doc: number; score: number }> {
    const n = this.lengths.length;
    const scores = new Map<number, number>();
    for (const term of new Set(queryTokens)) {
      const list = this.postings.get(term);
      if (!list) continue;
      const idf = Math.log(1 + (n - list.length + 0.5) / (list.length + 0.5));
      for (const [doc, tf] of list) {
        if (allowed && !allowed(doc)) continue;
        const norm = tf + this.k1 * (1 - this.b + (this.b * this.lengths[doc]) / (this.avgLength || 1));
        scores.set(doc, (scores.get(doc) ?? 0) + (idf * tf * (this.k1 + 1)) / norm);
      }
    }
    return [...scores].map(([doc, score]) => ({ doc, score })).sort((a, b) => b.score - a.score);
  }
}

// ---------------------------------------------------------------------------
// Vectors and fusion
// ---------------------------------------------------------------------------

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Reciprocal rank fusion: each ranking contributes 1 / (k + rank) per item.
 * Returns items best first, with their 1-based rank in each input ranking.
 */
export function reciprocalRankFusion<T>(
  rankings: T[][],
  k = 60,
): Array<{ item: T; score: number; ranks: Array<number | null> }> {
  const fused = new Map<T, { score: number; ranks: Array<number | null> }>();
  rankings.forEach((ranking, r) => {
    ranking.forEach((item, i) => {
      let entry = fused.get(item);
      if (!entry) fused.set(item, (entry = { score: 0, ranks: rankings.map(() => null) }));
      entry.score += 1 / (k + i + 1);
      entry.ranks[r] = i + 1;
    });
  });
  return [...fused].map(([item, e]) => ({ item, ...e })).sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Ranking options — tuned with `npm run eval`, see CHANGELOG v0.10.0
// ---------------------------------------------------------------------------

export type RankOptions = {
  /** "hybrid" = BM25 + vector fused with RRF; "vector"/"keyword" use one ranking only (for the eval). */
  mode?: "hybrid" | "vector" | "keyword";
  /** Multiplicative bonus (0.1 = +10%) on the fused score of CURATED_SOURCES. 0 disables. */
  curatedBoost?: number;
};

/** Hand-maintained, current-truth sources: a hit here beats a session-log aside of similar relevance. */
export const CURATED_SOURCES = new Set(["decision-md", "decision", "manual", "task", "sprint-md", "tasks-md", "doc"]);

/** Re-sorts fused results after multiplying the score of curated-source items by (1 + boost). */
export function applyCuratedBoost<T extends { item: number; score: number }>(
  fused: T[],
  sourceOf: (item: number) => string,
  boost: number | undefined,
): T[] {
  if (!boost) return fused;
  return fused
    .map((f) => (CURATED_SOURCES.has(sourceOf(f.item)) ? { ...f, score: f.score * (1 + boost) } : f))
    .sort((a, b) => b.score - a.score);
}

export const DEFAULT_RANK: RankOptions = { mode: "hybrid", curatedBoost: 0.1 };

// ---------------------------------------------------------------------------
// Fact files — memory/facts/*.md, one committed file per cams_ingest call
// ---------------------------------------------------------------------------

export type FactMeta = Record<string, string>;

/** Frontmatter values are written JSON-quoted, which is also valid YAML. */
export function serializeFact(meta: FactMeta, body: string): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined && value !== "") lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

/**
 * Parses the small YAML subset fact files use: `key: value` lines, values
 * either JSON-quoted or bare (a bare value may carry a trailing `# comment`).
 * `bodyLine` is the 1-based line the body starts on. Returns null if the
 * file has no frontmatter.
 */
export function parseFact(text: string): { meta: FactMeta; body: string; bodyLine: number } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return null;
  const meta: FactMeta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const raw = kv[2];
    const quoted = /^"((?:[^"\\]|\\.)*)"/.exec(raw);
    if (quoted) {
      try {
        meta[kv[1]] = JSON.parse(`"${quoted[1]}"`);
        continue;
      } catch {
        // fall through to bare handling
      }
    }
    meta[kv[1]] = raw.replace(/\s+#.*$/, "").replace(/^'(.*)'$/, "$1").trim();
  }
  const rest = text.slice(m[0].length);
  const leading = rest.length - rest.trimStart().length;
  const bodyLine = m[0].split("\n").length + rest.slice(0, leading).split("\n").length - 1;
  return { meta, body: rest.trim(), bodyLine };
}

const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["OpenAI-style API key", /\bsk-[A-Za-z0-9_-]{20,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["credential assignment", /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*["']?[^\s"']{8,}/i],
];

/** Names the kind of secret found in `text`, or null. Facts are committed, so they must not carry one. */
export function detectSecret(text: string): string | null {
  for (const [name, re] of SECRET_PATTERNS) if (re.test(text)) return name;
  return null;
}

// ---------------------------------------------------------------------------
// Git log parsing — for history derived from commits
// ---------------------------------------------------------------------------

export type LogCommit = {
  sha: string;
  short: string;
  date: string;
  changes: Array<{ status: "A" | "M" | "D"; path: string }>;
};

/**
 * Parses `git log --name-status --no-renames --format=%x1e%H%x1f%h%x1f%cI`.
 * Returns commits in the order git printed them.
 */
export function parseGitLog(output: string): LogCommit[] {
  const commits: LogCommit[] = [];
  for (const record of output.split("\x1e")) {
    if (!record.trim()) continue;
    const [header, ...rest] = record.split("\n");
    const [sha, short, date] = header.split("\x1f");
    if (!sha || !date) continue;
    const changes: LogCommit["changes"] = [];
    for (const line of rest) {
      const m = /^([AMDT])\t(.+)$/.exec(line);
      if (!m) continue;
      changes.push({ status: m[1] === "T" ? "M" : (m[1] as "A" | "M" | "D"), path: m[2] });
    }
    commits.push({ sha, short, date: date.trim(), changes });
  }
  return commits;
}

/** path → content hash → [short commit, ISO date] that introduced that text. */
export type Introduced = Record<string, Record<string, [string, string]>>;

/**
 * Replays commits (oldest first) over tracked files. For every piece of text
 * a commit removes, calls `onRemoved` with the commit that introduced it
 * (from `introduced`, or `fallbackIntro` for text older than the walk) and
 * the commit that removed it. Keeps `introduced` up to date for text added.
 * `piecesAt(rev, path)` returns the pieces of a file at a revision ([] if absent).
 */
export function walkHistory<P extends { hash: string }>(opts: {
  commits: LogCommit[];
  introduced: Introduced;
  owned: (path: string) => boolean;
  piecesAt: (rev: string, path: string) => P[];
  fallbackIntro: (path: string, commit: LogCommit) => [string, string];
  onRemoved: (piece: P, path: string, introducedBy: [string, string], commit: LogCommit) => void;
}): number {
  let removedCount = 0;
  for (const commit of opts.commits) {
    for (const change of commit.changes) {
      if (!opts.owned(change.path)) continue;
      const before = change.status === "A" ? [] : opts.piecesAt(`${commit.sha}^1`, change.path);
      const after = change.status === "D" ? [] : opts.piecesAt(commit.sha, change.path);
      const intro = (opts.introduced[change.path] ??= {});
      const { added, removed } = diffChunks(
        before.map((p) => ({ piece: p, contentHash: p.hash })),
        after.map((p) => p.hash),
      );
      for (const { piece } of removed) {
        opts.onRemoved(piece, change.path, intro[piece.hash] ?? opts.fallbackIntro(change.path, commit), commit);
        delete intro[piece.hash];
        removedCount += 1;
      }
      for (const i of added) intro[after[i].hash] = [commit.short, commit.date];
      if (after.length === 0) delete opts.introduced[change.path];
    }
  }
  return removedCount;
}

// ---------------------------------------------------------------------------
// Backfill diff
// ---------------------------------------------------------------------------

/**
 * Matches a file's currently active chunks against its freshly split chunks
 * by content hash (as a multiset). `kept` pairs reuse the existing chunk,
 * `added` are incoming indices that need a new chunk, `removed` are active
 * chunks whose text is no longer in the file.
 */
export function diffChunks<A extends { contentHash: string }>(
  active: A[],
  incomingHashes: string[],
): { kept: Array<{ chunk: A; index: number }>; added: number[]; removed: A[] } {
  const pool = new Map<string, A[]>();
  for (const c of active) {
    const list = pool.get(c.contentHash);
    if (list) list.push(c);
    else pool.set(c.contentHash, [c]);
  }
  const kept: Array<{ chunk: A; index: number }> = [];
  const added: number[] = [];
  incomingHashes.forEach((h, index) => {
    const match = pool.get(h)?.shift();
    if (match) kept.push({ chunk: match, index });
    else added.push(index);
  });
  const removed = [...pool.values()].flat();
  return { kept, added, removed };
}
