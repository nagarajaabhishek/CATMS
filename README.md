# CATMS — Coding Agents Team Management System

A drop-in workflow template for teams building with multiple AI coding agents (Cursor, Claude Code) alongside humans.

**The problem:** AI agents are stateless. Every new session forgets everything. When two agents and a human work on the same codebase, work gets duplicated, context is lost, and nobody knows who did what.

**CATMS solves this** with a lightweight local workflow:
- **Local Trackers** (`tasks.md`, `sprint.md`, `decision.md`) are the single source of truth for tasks, ownership, state, and design decisions
- **CAMS RAG** is the cross-agent memory — a local, lightweight memory layer running as an MCP server, with hybrid keyword + semantic search, file/line/commit citations on every result, history of superseded facts, pluggable embedding providers (OpenAI, Voyage, Ollama, or none for keyword-only), and no database — shared facts are committed markdown files in `memory/facts/`, history comes from `git log`, and the search index is a rebuildable local cache
- **`AGENTS.md`** is the single canonical rules file — read natively by Cursor, Google Antigravity, Codex, and Windsurf; `CLAUDE.md` imports it for Claude Code
- **OpenSpec** gives every feature a paper trail before any code is written
- **`docs/BRANCHING.md`** ties every branch to a task ID, with a CAMS-backed collision check before you cut one and a `depends_on`/`blocks_on` mechanism for real cross-task dependencies — single-stage (`feat→main`) or two-stage (`feat→dev→main`), chosen at `catms init`
- **`docs/SPRINT-WORKFLOW.md`** groups multi-task/multi-repo initiatives in `sprint.md`, with a single-active-sprint WIP limit
- Seven Claude Code skills (`task-kickoff`, `sprint-planning`, `pr-checks-loop`, `sprint-close`, `project-adoption`, `session-sync`, `architecture-diagram`) turn the docs above into runnable checklists — including a first-run pass that seeds the trackers from an existing codebase, a proactive end-of-session sync so nothing gets forgotten, and a grounded Mermaid architecture diagram saved into the repo

---

## Multi-agent support

`AGENTS.md` is the canonical standard — Cursor and Google Antigravity read it live off disk every session, no setup required. Claude Code doesn't read `AGENTS.md` natively, so `templates/CLAUDE.md` is a thin file that imports it with `@AGENTS.md` plus Claude-Code-only notes (the CAMS MCP tools, the four skills, `/clear` usage). `CURSOR.md` similarly shrinks to just Cursor+Claude coordination details.

Net effect: one file (`AGENTS.md`) to edit, multiple tools that stay in sync automatically.

---

## What's included (v0.9.0)

```
bin/catms.js          ← CLI entry point (init | setup | update | team | --version | --help)
lib/                  ← CLI implementation (no runtime dependencies, Node builtins only)

templates/            ← Copied into your project by `catms init`
  AGENTS.md           ← Canonical rules — read natively by Cursor, Antigravity, Codex, Windsurf
  CLAUDE.md           ← Thin wrapper: @AGENTS.md import + Claude Code specifics (incl. the 4 skills)
  CURSOR.md           ← Thin wrapper: Cursor+Claude coordination specifics
  .cursor/rules/      ← Auto-applied Cursor rules (.mdc) — point at AGENTS.md

  branching/          ← docs/BRANCHING.md — single-stage.md or two-stage.md, chosen at init
  docs/               ← SPRINT-WORKFLOW.md
  scripts/            ← branch-audit.sh — report-only, reads .catms.json's repos field
  claude-skills/      ← task-kickoff, sprint-planning, pr-checks-loop, sprint-close, project-adoption, session-sync,
                        architecture-diagram → .claude/skills/

  trackers/           ← Tracker templates copied to project root
    tasks.md          ← Project backlog, component tasks, claim/handoff/branch/depends_on fields
    sprint.md         ← Active, planned, and completed sprints
    decision.md       ← Settled product/architecture decisions
    log.md            ← Reverse-chronological session summary log
    sessions/         ← Session logs folder containing YYYY-MM-DD.md files
    
  cams/               ← Lightweight hybrid-search memory server
    server.ts         ← MCP server with cams_query, cams_history, cams_ingest, cams_feedback, cams_status, cams_backfill
    core.ts           ← Tokenizer, BM25, rank fusion, splitters, fact files, git history walk (pure, tested in test/cams/)
    CAMS-README.md    ← How CAMS works: search, citations, history, sharing, moving machines
    hooks/            ← backfill-hook.sh → .git/hooks/post-merge, post-checkout, post-rewrite
    package.json      ← MCP SDK dependencies
    tsconfig.json     ← TypeScript config
    gitignore.template ← → tools/cams/.gitignore (ignores node_modules, .env, the local memory cache)
    .env.example      ← Reference only — catms init writes the real tools/cams/.env directly

openspec-templates/   ← Design documents for features
  proposal.md         ← Why (problem, scope, success criteria)
  specs.md            ← What (ADDED / MODIFIED / REMOVED)
  design.md           ← How (architecture, decisions)
  tasks.md            ← Checklist mirroring task sub-issues
```

---

## Prerequisites

- Node ≥18
- Recommended, one embedding source for CAMS: an **OpenAI** or **Voyage** API key (default path — a few cents to ingest a project's worth of trackers, nothing to install), or a locally running **Ollama** with `mxbai-embed-large` pulled if you'd rather not use an API key. Without one, CAMS still works with keyword-only search.
- **No Docker, no Postgres, no database server** — CAMS keeps its search index in a local `memory.ndjson` file, scanned in-process, rebuilt from the repo on any machine

---

## Quick start

```bash
npm install -g @abhishek.nagaraja/catms   # or: npx @abhishek.nagaraja/catms init
catms init
```

Until you've installed it, you can also run it from a local clone:
```bash
git clone https://github.com/nagarajaabhishek/CATMS.git
cd CATMS && npm link
cd /path/to/your-project && catms init
```

`catms init` asks for your project name, an embedding provider (OpenAI/Voyage/Ollama) and key, a branch strategy (single-stage `feat→main` or two-stage `feat→dev→main`), and a target directory — then copies all templates, trackers, `docs/BRANCHING.md`/`docs/SPRINT-WORKFLOW.md`, the four Claude Code skills, and CAMS, and registers the local CAMS MCP server in `.mcp.json`. If the target directory contains multiple git repos (a multi-repo workspace), they're auto-detected into `.catms.json`'s `repos` field so `scripts/branch-audit.sh` covers all of them.

### New machine or new teammate

Everything CAMS knows is in the repo — trackers, shared facts in `memory/facts/`, and git history — so there's nothing to copy and no accounts to create. Whoever has repo access runs:

```bash
git clone <repo> && cd <repo>
catms setup
```

`catms setup` asks for their own embedding key, installs CAMS dependencies and git hooks, registers the MCP server, matches them to the team roster in `.catms.json`, and builds memory from the repo. To add someone to the roster first, run `catms team add`. Moving from a machine on CAMS 0.8 or earlier with facts that never left its `memory.ndjson`? `cd tools/cams && npm run import -- /path/to/old/memory.ndjson`, then commit the new `memory/facts/` files.

---

## Keeping templates up to date

CATMS is versioned via npm. When a new version ships, run inside your project directory:

```bash
catms update
```

**What gets updated automatically:**
- `.cursor/rules/*.mdc`, `docs/BRANCHING.md` (re-written with the *same* single-/two-stage variant your project was set up with), `docs/SPRINT-WORKFLOW.md`, `scripts/branch-audit.sh`, `.claude/skills/*/SKILL.md`, `openspec-templates/*.md`, `tools/cams/server.ts`, `tools/cams/package.json` — overwritten
- `AGENTS.md` / `CLAUDE.md` / `CURSOR.md` — only the CATMS-managed block is updated, preserving custom contents outside markers
- `.mcp.json` — CAMS MCP server configuration key is updated, leaving other tools intact
- Git hooks — CAMS's backfill hooks are (re)installed; hooks CATMS didn't write are left alone
- New files from the new version — added, e.g. `tasks.md`/`sprint.md`/`decision.md`/`log.md` are created if missing but never overwritten once they exist

---

## Core concepts

### 1. Lazy context loading
Agents read only what they need for the current task. Session start requires just reading `log.md`'s top entry and querying CAMS (`cams_query`) for specific details.

### 2. One branch per task, with a real collision check
```bash
git checkout -b feat/my-project-42-short-description
```
Every feature, fix, or chore maps to a task ID in `tasks.md` and a branch — cut only after `cams_query`-ing what else is `In Progress` in the repo and what it touches (`docs/BRANCHING.md`). Real cross-task dependencies get a `depends_on`/`blocks_on` tag instead of racing to reconcile at merge time.

### 3. Claim + handoff tracking
When an agent starts a task, it sets `owner` in `tasks.md` to claim it. When it finishes or pauses, it updates the task status and records the execution details in `sessions/YYYY-MM-DD.md`.

### 4. Sprints, one at a time
Multi-task/multi-repo initiatives live in `sprint.md`, ranked into a queue and built one at a time — a WIP limit that keeps concurrent-branch collisions rare even with multiple agents in play (`docs/SPRINT-WORKFLOW.md`).

### 5. OpenSpec before code
For any feature that takes more than a few hours: write `proposal.md` → `specs.md` → `design.md` → `tasks.md` first under `docs/design/changes/{change-name}/`.

### 6. Memory (CAMS)
Every decision/finding is searchable by meaning and by exact keyword (task IDs, branch names, file paths), and every result cites its file, line range, and commit. Facts saved with `cams_ingest` are committed files in `memory/facts/`, so the whole team shares them through git. History of how decisions and tasks changed is derived from `git log`, identical on every machine, and shown by `cams_history`. Git hooks re-sync memory after every pull, rebase, and branch switch; unchanged text is never re-embedded. Project abbreviations can be taught once in `.catms.json` (`cams.vocab`). See `tools/cams/CAMS-README.md`.

### 7. Adopting an existing project
`catms init`'s trackers start empty whether the project is brand new or has years of history — it's a plain script with no model access, so it can't summarize a codebase itself. If it detects real commit history at setup time, it points at the `project-adoption` skill: run once, it reads the actual git log/README/stack and writes a conservative first `decision.md` entry plus a real `tasks.md` backlog (only from things it actually finds, never invented), then backfills CAMS — so session one has real context instead of nothing.

### 8. Session sync, every time
The "Every Session — End" checklist (update `tasks.md`, write the session log, prepend `log.md`, record any real decision, `cams_ingest` + `cams_backfill`, commit and push including `memory/facts/`) is the highest-frequency step in the whole workflow and the easiest one to skip under time pressure. The `session-sync` skill runs it proactively whenever a session wraps up, not only when explicitly asked.

### 9. Architecture diagrams grounded in real code
The `architecture-diagram` skill inspects the actual codebase (dependency manifests, `.env.example`, infra config, API routes, `.mcp.json`) before drawing anything, then produces a Mermaid diagram — component overview, a request/RAG-pipeline trace, or a schema view, whichever fits what was asked — saved to `docs/design/architecture.md`. Draws only what's evidenced; explicitly marks the boundary where untrusted content (user input, RAG-retrieved chunks, tool output) enters an agent's context, when there is one.

---

## Placeholders in templates

When running `catms init`, these are replaced with your values:

| Placeholder | Replaced with |
|-------------|--------------|
| `{PROJECT_NAME}` | Your project name |
| `{GITHUB_USER}` | Your GitHub username |
| `{DROPLET_IP}` | Your server IP (if applicable) |
| `{SETUP_DATE}` | Today's date (`YYYY-MM-DD`), auto-filled |
| `{INTEGRATION_BRANCH}` | `main` (single-stage) or `dev` (two-stage) — derived from the branch-strategy prompt, not asked directly |

---

## License

MIT — use freely, attribution appreciated.
