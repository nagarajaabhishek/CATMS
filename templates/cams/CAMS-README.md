# CAMS — Coding Agent Memory System

Local, file-based semantic memory for {PROJECT_NAME}. No database, no hosted backend, no multi-tenancy — one MCP server per project, one developer's local memory per machine.

## Architecture

- **Storage:** NDJSON chunks stored locally (`memory.ndjson`), loaded into memory at startup, scanned in-process via cosine similarity.
- **Embeddings:** Pluggable via `EMBED_PROVIDER` — OpenAI, Voyage, or local Ollama (no external API calls for Ollama).
- **Backfill:** Reads from `sessions/`, `tasks.md`, `sprint.md`, `decision.md`, docs — on-demand via `npm run backfill` or automatically after `git pull` (via `.git/hooks/post-merge`).

## Multi-Developer Freshness Tradeoff

**CAMS is intentionally local-only by design** — no hosted backend, no multi-tenant coordination server. This makes setup simple (no DevOps, no separate infra cost) but introduces a deliberate tradeoff on memory freshness across developers:

- **Single developer:** memory is always fresh (one clone, one CAMS instance).
- **Multiple developers:** memory freshness is bounded by git pull cadence (typically a few minutes), not real-time. When developer A pushes a new decision and developer B hasn't pulled yet, B's CAMS still reflects the old state — until they `git pull`.

### How freshness is maintained (with mitigations)

1. **Automatic backfill on pull:** The `.git/hooks/post-merge` hook runs `npm run backfill` automatically whenever pulling new changes. This keeps the semantic index within ~seconds of the new git state.

2. **Manual backfill:** A developer can run `npm run backfill` any time to re-index immediately (e.g., if they notice stale results and haven't pulled recently).

3. **Optional continuous sync (watch-sync.sh):** For aggressive freshness, a developer can run the `watch-sync.sh` script in a spare terminal to poll for new changes every 5 minutes (or a custom interval). This bridges the gap between "git pull when you remember" and "near-live freshness," at the cost of a quiet background loop.

### Acceptable tradeoff

For typical solo or pair workflows and small teams (2–5 developers):
- Pull frequency of 30–60 minutes naturally keeps memory reasonably fresh.
- The post-merge hook handles the backfill automatically.
- Memory lag never exceeds time-since-last-pull.
- No CAMS server downtime, no database backups, no deploy process.

For larger teams (6+ developers) or high-frequency sprint work, consider:
- Making watch-sync.sh the default (run in a tmux session), or
- Re-evaluating whether a hosted/centralized memory layer is worth the ops cost for your team.

**This is NOT a limitation of the design; it's a documented constraint.** The team chose local-first simplicity over multi-tenant sync complexity. If sync latency matters more than operational simplicity, that's a deliberate trade-off to revisit, not a bug to "fix" by adding a backend.

## Files

- `server.ts` — MCP server entry point (TypeScript, runs via `tsx`).
- `package.json` — dependencies (`@modelcontextprotocol/sdk`, `zod`).
- `tsconfig.json` — TypeScript config (strict mode).
- `.env` — configuration (embed provider, API keys if needed).
- `.env.example` — example env file (checked into git, safe).
- `memory.ndjson` — semantic index (gitignored, regenerated on backfill).
- `hooks/post-merge` — git hook for automatic backfill (symlinked to `.git/hooks/post-merge`).
- `watch-sync.sh` — optional continuous-pull background loop (opt-in).

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure embedding provider:**
   - Edit `.env` or set `EMBED_PROVIDER` + API keys via environment.
   - Options: `openai` (default), `voyage`, `ollama` (local).

3. **Run initial backfill:**
   ```bash
   npm run backfill
   ```

4. **Start the server (for local development/testing):**
   ```bash
   npm start
   ```

5. **For Claude Code / Cursor / Antigravity:**
   - The server is wired via `.mcp.json` in the project root.
   - No manual start needed; the MCP client starts it on-demand.
   - To test: call `cams_query` or `cams_ingest` in your session.

## Maintenance

- **CAMS results stale?** Run `npm run backfill` to re-index.
- **Switching embedding providers?** Update `.env` and re-run `npm run backfill` (old vectors become invalid).
- **Memory file growing too large?** Check `memory.ndjson` size; if it exceeds ~50k lines, consider archiving old sessions or decisions to keep backfill snappy.

## For New Developers

See `.claude/skills/team-onboarding/SKILL.md` for the full setup checklist, including:
- Installing Ollama (if using local embeddings)
- Installing `.git/hooks/post-merge` manually (not cloned automatically)
- Running the initial backfill
- Optionally enabling watch-sync.sh for continuous freshness
