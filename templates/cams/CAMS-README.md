# CAMS — Coding Agent Memory System

File-based memory for {PROJECT_NAME}. No database, no hosted backend, no accounts — one MCP server per project, and everything worth sharing lives in git. If you can clone the repo, you have the project's whole memory.

## Architecture

- **What's shared (committed):** the trackers (`sessions/`, `log.md`, `tasks.md`, `sprint.md`, `decision.md`, `docs/`) and saved facts in `memory/facts/` — one small markdown file per `cams_ingest`. Git history is the record of how all of it changed.
- **What's local (gitignored, rebuildable):** `memory.ndjson` is a per-machine search cache built from the above, holding text, line ranges, and embeddings. `memory.meta.json` remembers which commit history was last read from. Delete both and `npm run backfill` rebuilds them from the repo — nothing is lost.
- **Search:** hybrid. BM25 keyword ranking and cosine similarity over embeddings, merged with reciprocal rank fusion. Keyword ranking means exact identifiers (task IDs, branch names, file names) match even when embeddings miss them.
- **Embeddings:** Pluggable via `EMBED_PROVIDER` — OpenAI, Voyage, or local Ollama (no external API calls for Ollama). Each developer uses their own key; embeddings are never shared or committed. Optional: with no key, or with Ollama down, backfill still indexes everything and search runs keyword-only (the response says so).
- **Backfill:** syncs every tracked file and fact file into the cache. Each file is diffed against what's stored: unchanged text is kept and never re-embedded (embeddings are cached by content hash), removed text drops out, new text is added. Runs on demand (`npm run backfill`, `cams_backfill`) and automatically after pulls, rebases, and branch switches (git hooks).
- **History:** derived from `git log`, not from what this machine happened to see. Every replaced version of a tracker section or fact is recorded with the commit that introduced it and the commit that replaced it, so two developers' histories match. Read incrementally from the last indexed commit; rebuilt from the last `CAMS_HISTORY_COMMITS` commits (default 500) on a fresh cache. Superseded versions are searched by keyword only, so history costs no embedding calls. `cams_query` hides them by default (`includeSuperseded: true` shows them); `cams_history` lists versions in time order. The oldest beyond `CAMS_HISTORY_MAX` (default 5000) are pruned.
- **Citations:** every result carries its file path, line range, and commit, marked `(uncommitted)` for local edits not yet committed. Facts also show who saved them and what they refer to — e.g. `[decision | memory/facts/2026-10-04-3f2a.md L8 @ a1b2c3d | by @alice | re src/auth.ts L10-30]`.
- **Concurrency:** writes take `memory.lock` and replace the file atomically, and the server re-reads the file when it changes on disk, so a hook's backfill and a running server never write over each other.

## Tools

| Tool | Use |
|------|-----|
| `cams_query` | Search. Optional `sources` filter (e.g. `["tasks-md"]` for the branch collision check), `k`, `includeSuperseded`. |
| `cams_history` | How something changed: pass a `question`, a `sourceRef` like `decision.md`, or both. |
| `cams_ingest` | Save a fact to `memory/facts/` (commit it so teammates get it). Optional `sourceRef` plus `lineStart`/`lineEnd`. Refuses content that looks like a key or password. |
| `cams_backfill` | Sync all tracked files and facts. Cheap to rerun. |

Sources: `session-log`, `log-md`, `tasks-md`, `sprint-md`, `decision-md`, `doc`, `design-change`, `design-archive`, and for facts `manual`, `decision`, `task`.

## Sharing memory

Memory is shared the same way code is: commit and push, then pull.

1. `cams_ingest` writes a fact file like `memory/facts/2026-10-04-3f2a9c1e.md` with its kind, author (your CATMS claim tag, e.g. `@alice`), date, and optional reference. It's searchable on your machine immediately.
2. Commit it with your tracker changes and push. Facts are plain markdown — review them in PRs, edit them, or delete a wrong one like any other file.
3. Teammates pull. The post-merge / post-rewrite hook runs a backfill in the background and the new facts and tracker edits become searchable, embedded with their own key.

Who can read the memory is exactly who can read the repo — there are no separate accounts. Never put secrets in facts or trackers; describe where a secret lives instead.

Freshness across developers is bounded by how often you push and pull. To keep it tight, push tracker and fact changes as soon as they're made rather than batching them to session end, and optionally run `watch-sync.sh` in a spare terminal to pull every few minutes.

## Moving to a new machine (or a new teammate)

```bash
git clone <repo> && cd <repo>
catms setup
```

`catms setup` writes `tools/cams/.env` with your embedding key, installs dependencies and git hooks, registers the MCP server, matches you to the team roster in `.catms.json`, and builds memory from the repo. Re-embedding costs one embedding call per current chunk (cents with OpenAI or Voyage, free with Ollama); history needs none.

Coming from CAMS 0.8 or earlier, where `cams_ingest` facts lived only in the old machine's `memory.ndjson`? Copy that file over and import it once:

```bash
cd tools/cams && npm run import -- /path/to/old/memory.ndjson
```

It writes each fact to `memory/facts/` (skipping ones already there) — review and commit them. On a machine that still has its old `memory.ndjson`, the first backfill does this export automatically.

## Vocabulary

Teach CAMS project abbreviations once in the project's `.catms.json`, and keyword search will treat each alias group as the same term in both directions:

```json
{
  "cams": {
    "vocab": {
      "kubernetes": ["k8s"],
      "pull request": ["pr"]
    }
  }
}
```

The file is re-read whenever it changes; no restart or backfill needed.

## Files

- `server.ts` — MCP server entry point (TypeScript, runs via `tsx`).
- `core.ts` — pure logic used by `server.ts` (tokenizer, BM25, rank fusion, line-aware splitters, fact files, git history walk).
- `package.json` — dependencies (`@modelcontextprotocol/sdk`, `zod`).
- `tsconfig.json` — TypeScript config (strict mode).
- `.env` — your embedding provider and key (gitignored).
- `.env.example` — example env file (committed, safe).
- `memory.ndjson` — local search cache (gitignored, rebuilt by backfill).
- `memory.meta.json` — last commit history was read from (gitignored).
- `memory.lock` — present only while a write is in progress (gitignored). Treated as stale after 30 seconds without a heartbeat.
- `backfill.log` — output of hook-triggered backfills (gitignored).
- `hooks/backfill-hook.sh` — installed as `.git/hooks/post-merge`, `post-checkout`, and `post-rewrite` by `catms init` / `catms setup`.
- `watch-sync.sh` — optional continuous-pull background loop (opt-in).
- `../../memory/facts/` — shared facts (committed).

## Setup

Run `catms setup` from anywhere in the repo — it does everything below. By hand:

1. `npm install`
2. Copy `.env.example` to `.env` and set `EMBED_PROVIDER` plus its key (`openai`, `voyage`, or `ollama`).
3. `npm run backfill`
4. The server is wired via `.mcp.json` in the project root; Claude Code, Cursor, and Antigravity start it on demand. Test with `npm run query -- "what changed recently"`.

## Maintenance

- **CAMS results stale?** Pull, or run `npm run backfill`. Check `backfill.log` if hooks seem not to run.
- **Something looks wrong with history?** `npm run rebuild` re-derives it from git.
- **Switching embedding providers?** Update `.env` and re-run `npm run backfill`. Each chunk records which model embedded it; until the backfill finishes, chunks from the old model are still found by keyword search, just not by vector search.
- **Results say "keyword-only"?** The embedder isn't reachable (missing key, Ollama not running). Fix it and run `npm run backfill` to embed whatever was indexed without vectors.
- **Upgrading from an older CAMS?** Run `npm run backfill` once: it exports local-only facts to `memory/facts/` (commit them) and rebuilds history from git, reusing existing embeddings.
- **A wrong or outdated fact?** Edit or delete its file in `memory/facts/` and commit; the old version stays in history.

## For New Developers

Run `catms setup` after cloning. See `.claude/skills/team-onboarding/SKILL.md` for the full checklist, including installing Ollama for local embeddings and optionally enabling `watch-sync.sh`.
