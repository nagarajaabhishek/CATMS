# CATMS — Coding Agents Team Management System

A drop-in workflow template for teams building with multiple AI coding agents (Cursor, Claude Code) alongside humans.

**The problem:** AI agents are stateless. Every new session forgets everything. When two agents and a human work on the same codebase, work gets duplicated, context is lost, and nobody knows who did what.

**CATMS solves this** with a lightweight local workflow:
- **Local Trackers** (`tasks.md`, `sprint.md`, `decision.md`) are the single source of truth for tasks, ownership, state, and design decisions
- **CAMS RAG** is the cross-agent memory — a local, lightweight semantic memory layer running as an MCP server with pluggable embedding providers (OpenAI, Voyage, Ollama) and flat file storage (`memory.ndjson`)
- **`AGENTS.md`** is the single canonical rules file — read natively by Cursor, Google Antigravity, Codex, and Windsurf; `CLAUDE.md` imports it for Claude Code
- **OpenSpec** gives every feature a paper trail before any code is written
- **`docs/BRANCHING.md`** ties every branch to a task ID, with a CAMS-backed collision check before you cut one and a `depends_on`/`blocks_on` mechanism for real cross-task dependencies — single-stage (`feat→main`) or two-stage (`feat→dev→main`), chosen at `catms init`
- **`docs/SPRINT-WORKFLOW.md`** groups multi-task/multi-repo initiatives in `sprint.md`, with a single-active-sprint WIP limit
- Four Claude Code skills (`task-kickoff`, `sprint-planning`, `pr-checks-loop`, `sprint-close`) turn the two docs above into runnable checklists

---

## Multi-agent support

`AGENTS.md` is the canonical standard — Cursor and Google Antigravity read it live off disk every session, no setup required. Claude Code doesn't read `AGENTS.md` natively, so `templates/CLAUDE.md` is a thin file that imports it with `@AGENTS.md` plus Claude-Code-only notes (the CAMS MCP tools, the four skills, `/clear` usage). `CURSOR.md` similarly shrinks to just Cursor+Claude coordination details.

Net effect: one file (`AGENTS.md`) to edit, multiple tools that stay in sync automatically.

---

## What's included (v0.5.0)

```
bin/catms.js          ← CLI entry point (init | update | --version | --help)
lib/                  ← CLI implementation (no runtime dependencies, Node builtins only)

templates/            ← Copied into your project by `catms init`
  AGENTS.md           ← Canonical rules — read natively by Cursor, Antigravity, Codex, Windsurf
  CLAUDE.md           ← Thin wrapper: @AGENTS.md import + Claude Code specifics (incl. the 4 skills)
  CURSOR.md           ← Thin wrapper: Cursor+Claude coordination specifics
  .cursor/rules/      ← Auto-applied Cursor rules (.mdc) — point at AGENTS.md

  branching/          ← docs/BRANCHING.md — single-stage.md or two-stage.md, chosen at init
  docs/               ← SPRINT-WORKFLOW.md
  scripts/            ← branch-audit.sh — report-only, reads .catms.json's repos field
  claude-skills/      ← task-kickoff, sprint-planning, pr-checks-loop, sprint-close → .claude/skills/

  trackers/           ← Tracker templates copied to project root
    tasks.md          ← Project backlog, component tasks, claim/handoff/branch/depends_on fields
    sprint.md         ← Active, planned, and completed sprints
    decision.md       ← Settled product/architecture decisions
    log.md            ← Reverse-chronological session summary log
    sessions/         ← Session logs folder containing YYYY-MM-DD.md files
    
  cams/               ← Lightweight semantic memory RAG server
    server.ts         ← MCP server with cams_query, cams_ingest, cams_backfill
    package.json      ← MCP SDK dependencies
    tsconfig.json     ← TypeScript config
    gitignore.template ← → tools/cams/.gitignore (ignores node_modules, .env, memory.ndjson)
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
- One embedding source for CAMS: an **OpenAI** or **Voyage** API key (default path — a few cents to ingest a project's worth of trackers, nothing to install), or a locally running **Ollama** with `mxbai-embed-large` pulled if you'd rather not use an API key
- **No Docker, no Postgres, no database server** — CAMS stores memory in a single `memory.ndjson` file, scanned in-process

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

### 6. Semantic memory (CAMS)
Every decision/finding is stored semantically. Rerunning `cams_backfill` keeps memory in sync with local trackers.

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
