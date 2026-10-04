# CATMS Changelog

All notable changes to CATMS are documented here.
Format: `## [version] — YYYY-MM-DD`

## [v0.9.0] — 2026-10-04

### Added
- **Shared CAMS facts:** `cams_ingest` writes each fact to a committed markdown file in `memory/facts/` (kind, author, date, optional file/line reference in frontmatter) instead of only to the local `memory.ndjson`. Facts reach teammates and your other machines through normal commit/push/pull, are reviewable in PRs, and cite their author (`by @alice`). Content that looks like an API key, token, or password is refused.
- **`catms setup`:** one command for a fresh clone — new machine or new teammate. Writes `tools/cams/.env` with the developer's own embedding key, runs `npm install`, installs git hooks, registers the MCP server, matches the GitHub username to the team roster (sets the claim tag used as fact author), then builds memory from the repo and runs a test query.
- **`npm run import -- <old memory.ndjson>`:** moves facts from a CAMS 0.8 install on another machine into `memory/facts/`. On a machine that still has its old `memory.ndjson`, the first backfill exports local-only facts automatically.
- `npm run rebuild` re-derives history from git; `npm run query -- "<question>"` searches from the terminal.

### Changed
- **CAMS history now comes from `git log`**, not from what one machine happened to observe: every replaced version of tracker text or a fact records the commit that introduced it and the commit that replaced it, so all developers see the same history. Read incrementally from the last indexed commit (`memory.meta.json`); rebuilt from the last `CAMS_HISTORY_COMMITS` commits (default 500) on a fresh cache, after a history rewrite, or on `npm run rebuild`. Superseded versions are keyword-searched only, so history costs no embedding calls.
- `memory.ndjson` is now a disposable per-machine cache — delete it and the next backfill rebuilds everything from the repo. Text not yet committed is cited as `(uncommitted)`.
- Git hooks: one `tools/cams/hooks/backfill-hook.sh` replaces `hooks/post-merge` and is installed as `post-merge`, `post-checkout` (branch switches), and `post-rewrite` (rebasing pulls). It runs the backfill in the background so git never waits, logs to `tools/cams/backfill.log`, respects `core.hooksPath`, and never overwrites hooks CATMS didn't write. `catms init`, `catms update`, and `catms setup` all install it.
- `catms team add` output now spells out the whole onboarding path: commit `.catms.json`, grant repo access (the only access CAMS needs), then the new developer runs `git clone` and `catms setup`.
- Docs: `CAMS-README.md` gains **Sharing memory** and **Moving to a new machine** (replacing the freshness-tradeoff section); `team-onboarding` uses `catms setup` instead of manual npm/hook steps; `AGENTS.md` **Every Session — End** and `session-sync` now commit and push `memory/facts/`.

## [v0.8.0] — 2026-10-04

### Added
- **CAMS hybrid search:** `cams_query` now fuses BM25 keyword ranking with embedding similarity (reciprocal rank fusion). Exact identifiers — task IDs, branch names, file paths — match reliably, which the branch collision check depends on. With no embedding key, or Ollama down, CAMS indexes and searches keyword-only instead of failing.
- **CAMS citations:** every result shows file path, line range, and the commit it was indexed at (marked `(uncommitted)` if the file had local edits), plus its keyword/vector ranks.
- **CAMS history:** changed or deleted tracker text is marked superseded (with timestamp and commit) instead of being discarded. New `cams_history` tool lists how a topic or file changed over time; `cams_query` accepts `includeSuperseded`. Pruned past `CAMS_HISTORY_MAX` (default 5000).
- **CAMS filters and vocabulary:** `cams_query` accepts `sources` (e.g. `["tasks-md"]`, now used by the collision check in `task-kickoff`, `docs/BRANCHING.md`, `AGENTS.md`, and `git-workflow.mdc`). Alias groups in `.catms.json` → `cams.vocab` (e.g. `kubernetes` = `k8s`) expand keyword queries both ways. `cams_ingest` accepts `lineStart`/`lineEnd`.
- `tools/cams/core.ts` — CAMS's pure search/splitting logic, with unit tests in `test/cams/` (`npm test`).

### Fixed
- A running CAMS server never reloaded `memory.ndjson`, so it kept serving pre-pull results after the post-merge hook's backfill; it now reloads whenever the file changes. Writes use a lockfile and an atomic rename so the hook and the server can't clobber each other.
- Every backfill re-embedded all of `tasks.md`/`sprint.md`/`decision.md`, paying embedding cost for unchanged text. Backfill now diffs each file and caches embeddings by content hash; a no-change backfill makes zero embedding calls.
- Chunks from deleted files stayed searchable forever; they're now superseded.
- Files under `docs/design/changes/` and `docs/design/archive/` were indexed as generic `doc` (and their `design-change`/`design-archive` copies skipped as duplicates); each file now belongs to its most specific source.
- Switching embedding provider no longer requires deleting `memory.ndjson`: each chunk records its embedding model, and old-model chunks stay keyword-searchable until the next backfill re-embeds them. Existing memory files upgrade automatically on first backfill, reusing their embeddings.

### Changed
- `catms init`/`catms update` copy `tools/cams/core.ts` and `tools/cams/CAMS-README.md`; `.gitignore` for `tools/cams/` also ignores `memory.lock` and temp files.
- `docs/BRANCHING.md` → **Branch granularity** section: "one task = one branch" is now an explicit default, not an absolute — sequential same-session subtasks of one initiative can bundle into a single branch/PR when there's no real collision risk, with clear exceptions (a `P0`/standing-risk fix stays solo, a task that might get picked up by a different agent later stays split, trivial/zero-risk findings never get a branch at all). `task-kickoff` checks this before branching (continue an open branch vs. cut a new one) instead of always cutting fresh. `.cursor/rules/git-workflow.mdc` updated to point at it.
- `architecture-diagram` skill → **Step 2b, parallel sub-agent sweep** for a large repo or multi-repo workspace: spawns one investigation sub-agent per repo/module (bounded, same checklist as the single-repo pass, plus a sibling-reference grep for cross-repo edges) instead of one sequential bounded read, then synthesizes a system-level diagram plus zoomed-in detail diagrams for any repo that turned out complex — flagging contradictions between sub-agent reports rather than silently picking one.
- `architecture-diagram` skill → **Step 0, mandatory classification**: every run (single-repo or multi-repo) now explicitly answers repo count, distinct frontend count, distinct backend/service count, whether an AI/agent/RAG layer is present, and whether cloud/managed services are in use — "always check" categories, not "draw if convenient." Cloud/deployment services split out as its own checklist row, separate from generic third-party integrations. Step 2b's sub-agents now also produce a draft Mermaid fragment of their own repo's internals, not just a text report, and the synthesized diagram is laid out as the actual end-to-end request journey (frontend → backend → AI/RAG layer → data stores → cloud/third-party services) rather than an unordered component list.

## [v0.7.0] — 2026-09-01

### Added
- **Multi-developer support:** `catms team add` command to register new developers, generate per-developer claim tags (`@claude-<slug>` pattern), and update team roster in AGENTS.md/CLAUDE.md/CURSOR.md managed blocks. `.catms.json` now includes a `team` array with name, GitHub username, and claim tag for each developer.
- **Team onboarding skill:** `.claude/skills/team-onboarding/` — comprehensive checklist for onboarding a new developer to a CATMS project, covering repository access, CAMS setup, git hooks, and first-task claiming.
- **Git hook for CAMS sync:** `.git/hooks/post-merge` — automatically runs CAMS backfill after pulling new changes, keeping semantic memory in sync across developers without manual steps.
- **Watch-sync script:** `tools/cams/watch-sync.sh` — optional background loop for near-real-time CAMS freshness (polls for changes every 5 minutes, can be customized).
- **Branch Plan section in `sprint.md`:** New per-sprint table documenting branching strategy, dependencies, and merge targets — optional but recommended for multi-developer coordination.
- **Cross-machine collision prevention guidance:** New subsection in both `docs/BRANCHING.md` templates (single-stage and two-stage) explaining how to avoid divergence when developers work on separate local clones — emphasizes `git fetch` + `git pull` before branching, post-merge hook for CAMS, and optional watch-sync for freshness.
- **CAMS multi-developer documentation:** `tools/cams/CAMS-README.md` — explicitly states the local-first design choice (no hosted backend, freshness bounded by git pull cadence) and describes how the post-merge hook + optional watch-sync mitigate sync latency.
- **Claim-tag convention in trackers:** `tasks.md` and `decision.md` templates now document the `@claude-<slug>` convention for multi-developer teams, so two developers running Claude Code produce distinguishable owner tags.

### Changed
- `lib/init.js` now copies git hooks and watch-sync.sh into `tools/cams/` during setup, initializes `.catms.json` with a `team` array starting with the setup user as `@you`, and includes `team-onboarding` in the skills list.
- `lib/update.js` includes `team-onboarding` skill in the update pipeline.
- `.catms.json.template` now includes an example `team` array field.

## [v0.6.0] — 2026-08-28

### Added
- `project-adoption` Claude Code skill — run once, right after `catms init` on a project with existing commit history, to seed `tasks.md`/`decision.md`/`log.md` with real context read from the actual git log, README, and stack, then backfill CAMS. `catms init` is a plain script with no model access, so trackers previously started empty regardless of whether a project was brand new or years old; this closes that gap without adding any LLM-calling logic to the CLI itself, since the agent running `catms init` already has reasoning available for free.
- `catms init` detects existing commit history (>5 commits, per-repo for a multi-repo workspace) and points at the skill in its "Next steps" output.
- `session-sync` Claude Code skill — the checklist version of `AGENTS.md`'s "Every Session — End" section (update `tasks.md`, write the session log, prepend `log.md`, record any real decision, `cams_ingest` + `cams_backfill`), run proactively whenever a session wraps up rather than left as an unenforced manual step. This is the highest-frequency action in the whole workflow and the one most likely to get skipped under time pressure.
- `architecture-diagram` Claude Code skill — generates a Mermaid diagram of the repo grounded in real code inspection (dependency manifests, `.env.example`, infra config, API routes, `.mcp.json`, migrations, CI config), covering entry points, application layers, data stores, third-party integrations, async/background processing, caching, auth/secrets boundaries, and — when present — agent/RAG components including an explicit marker for where untrusted content enters the context. Saved to `docs/design/architecture.md`, not left as a one-off chat reply.

## [v0.5.0] — 2026-08-27

### Added
- Native markdown trackers (`tasks.md`, `sprint.md`, `decision.md`, `log.md`) at the project root.
- Lightweight, file-based CAMS RAG server (`tools/cams/`) which runs as a self-contained MCP server (storing chunks in `memory.ndjson` and using pluggable OpenAI, Voyage, or local Ollama embeddings) — no Docker or database server required.
- `.mcp.json` automatic registration on `catms init` and `catms update` (`lib/merge-json.js`).
- Real branch discipline (`docs/BRANCHING.md`, single-stage `feat→main` or two-stage `feat→dev→main`, chosen at `catms init`): a CAMS-backed collision check before every branch, `depends_on`/`blocks_on` task fields for real cross-task dependencies, a `park/` branch prefix, and a no-autonomous-merge rule.
- Sprint workflow (`docs/SPRINT-WORKFLOW.md`): cross-repo initiatives in `sprint.md`, a single-active-sprint WIP limit, and an agent-determined sprint-ordering algorithm.
- Four Claude Code skills (`.claude/skills/`) that operationalize the two docs above: `task-kickoff`, `sprint-planning`, `pr-checks-loop`, `sprint-close`.
- `scripts/branch-audit.sh` — report-only audit of branches ahead of the integration branch, across every repo in `.catms.json`'s `repos` field (auto-detected for multi-repo workspaces).

### Removed
- Obsidian project vault template (`obsidian-template/`) and path settings.
- Linear task tracking setup docs and settings.
- `templates/docs/GIT_WORKFLOW.md` (single-stage-only, no dependency tracking) — replaced by `docs/BRANCHING.md`.

### Changed
- `lib/init.js` and `lib/update.js` updated to prompt for embedding provider/keys and branch strategy, register CAMS in `.mcp.json`, write the branch/sprint docs and skills, and manage local trackers instead of Linear/Obsidian.
- Workflow instructions (`AGENTS.md`, `CLAUDE.md`, `CURSOR.md` and `.cursor/rules/*.mdc`) updated to use local trackers, CAMS, and the new branch/sprint discipline.
- `.catms.json` gained `branch_strategy`, `integration_branch`, and `repos` fields; projects updating from pre-v0.5.0 default to `single-stage`/`main`/`[]`.

---

## [v0.4.0] — 2026-07-04

### Added
- `catms` npm CLI (`bin/catms.js` + `lib/`) — `catms init` and `catms update` replace `setup.sh`/`update.sh`. No runtime dependencies (Node builtins only: `readline`, `fs`, `path`).
- Marker-delimited managed blocks (`<!-- CATMS:BEGIN -->` / `<!-- CATMS:END -->`) for `AGENTS.md`, `CLAUDE.md`, `CURSOR.md`: `catms init` appends rather than overwrites if these files already exist with non-CATMS content; `catms update` replaces only the marked block, preserving anything a project added outside it.
- `package.json` — versioning now driven by npm/semver instead of parsing `CHANGELOG.md`; `.catms.json` read/written with `JSON.parse`/`fs.writeFileSync` instead of shelling out to `python3`.

### Removed
- `setup.sh`, `update.sh` — replaced entirely by the CLI. Projects set up under the old bash scripts are still supported by `catms update` (it falls back to a manual-diff hint for files that predate the marker format).

### Changed
- `README.md` — install/update instructions now `npm install -g catms` / `npx catms init` (not yet published; `npm link` from a local clone until then).

---

## [v0.3.0] — 2026-07-04

### Added
- `templates/AGENTS.md` — canonical, tool-agnostic rules file. Read natively by Cursor, Google Antigravity, Codex, and Windsurf; no setup required for those tools.
- OKF (Google's [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) v0.1) applied to `obsidian-template/projects/{name}/`: YAML frontmatter on concept docs, plus new `index.md` (progressive-disclosure listing) and `log.md` (reverse-chronological session summary) templates.
- `{SETUP_DATE}` placeholder — auto-filled with today's date by `setup.sh`/`update.sh`.
- `setup.sh`/`update.sh` — copy and version `AGENTS.md`, `index.md`, `log.md`.

### Changed
- `templates/CLAUDE.md` — now a thin file (`@AGENTS.md` import + Claude Code-only notes) instead of duplicating the full workflow.
- `templates/CURSOR.md` — now only covers Cursor+Claude coordination specifics (session-log suffix, claim/handoff agent name); the rest moved to `AGENTS.md`.
- `templates/.cursor/rules/workflow.mdc` — trimmed to a pointer at `AGENTS.md` instead of a third copy of the same workflow.
- Session-start "Step 2" (topic-file lookup) replaced by reading `index.md`.
- `README.md` — reflects the `AGENTS.md`-as-parent architecture, multi-agent support (Cursor/Antigravity), and OKF documentation format.

### Migration notes (existing projects)
- Run `update.sh` — it adds `AGENTS.md` if missing and prints a reminder to migrate `CLAUDE.md`/`CURSOR.md` to the thin form manually (not automated, since those files carry project-specific customization).

---

## [v0.2.0] — 2026-05-15

### Added
- `update.sh` — smart version diff and merge script for projects already using CATMS
- `.catms.json` — version tracking file added to each project by `setup.sh`
- `linear-milestones.md` — guide on using Linear milestones as phase gates, roadmap planning, and sprint cycles
- `CHANGELOG.md` — this file

### Changed
- `setup.sh` — now writes `.catms.json` to the target project after setup
- `README.md` — updated with update instructions and milestone section link
- `linear-setup.md` — added milestone setup steps

---

## [v0.1.0] — 2026-05-14

### Added
- Initial release
- `CLAUDE.md` template with lazy context loading, token efficiency, git workflow
- `CURSOR.md` template (Cursor-specific mirror)
- `.cursor/rules/workflow.mdc` — auto-apply Linear + Obsidian rules
- `.cursor/rules/git-workflow.mdc` — auto-apply branch discipline
- `docs/GIT_WORKFLOW.md`
- Obsidian vault folder structure template
- OpenSpec templates (proposal, specs, design, tasks)
- `linear-setup.md` — Linear team + project + state configuration guide
- `setup.sh` — interactive init script with placeholder replacement
