# CATMS — Coding Agents Team Management System

A drop-in workflow template for teams building with multiple AI coding agents (Cursor, Claude Code) alongside humans.

**The problem:** AI agents are stateless. Every new session forgets everything. When two agents and a human work on the same codebase, work gets duplicated, context is lost, and nobody knows who did what.

**CATMS solves this** with a structured system where:
- **Linear** is the single source of truth for tasks, ownership, and state
- **Obsidian** is the cross-agent memory — session logs, decisions, specs, formatted per [Google's Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (OKF)
- **`AGENTS.md`** is the single canonical rules file — read natively by Cursor, Google Antigravity, Codex, and Windsurf; `CLAUDE.md` imports it for Claude Code
- **OpenSpec** gives every feature a paper trail before any code is written
- **Git branching** ties every branch to a Linear issue

---

## Multi-agent support

`AGENTS.md` is the [open, tool-native standard](https://agents.md) — Cursor and Google Antigravity read it live off disk every session, no setup required. Claude Code doesn't read `AGENTS.md` natively, so `templates/CLAUDE.md` is a thin file that imports it with `@AGENTS.md` plus Claude-Code-only notes (MCP tool setup, `/clear` usage). `CURSOR.md` similarly shrinks to just the Cursor+Claude coordination details (session-log naming, claim/handoff agent name) that don't belong in the generic parent.

Net effect: one file (`AGENTS.md`) to edit, three tools that stay in sync automatically.

---

## Documentation format (OKF)

Everything under `obsidian-template/projects/{name}/` follows [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) v0.1 — plain markdown, no tooling required:
- Concept docs (`overview.md`, `context.md`, `context/*.md`) carry YAML frontmatter (`type`, `title`, `description`, `tags`, `timestamp`)
- `index.md` — reserved filename, progressive-disclosure listing of what's in a folder
- `log.md` — reserved filename, reverse-chronological one-liner per session

This is what makes "lazy context loading" (below) fast: agents read `log.md` for "what happened last" and `index.md` for "what exists," instead of listing directories or opening every file.

---

## What's included (v0.4.0)

```
bin/catms.js        ← CLI entry point (init | update | --version | --help)
lib/                ← CLI implementation (no runtime dependencies, Node builtins only)

templates/          ← Copied into your project by `catms init`
  AGENTS.md         ← Canonical rules — read natively by Cursor, Antigravity, Codex, Windsurf
  CLAUDE.md         ← Thin wrapper: @AGENTS.md import + Claude Code specifics
  CURSOR.md         ← Thin wrapper: Cursor+Claude coordination specifics
  .cursor/rules/    ← Auto-applied Cursor rules (.mdc) — point at AGENTS.md
  docs/             ← Git workflow, pre-commit checklist

obsidian-template/  ← Copied into your Obsidian vault
  context/          ← active-projects.md
  projects/{name}/  ← Per-project memory structure (OKF-formatted: index.md, log.md, frontmatter)

openspec-templates/ ← Design documents for features
  proposal.md       ← Why (problem, scope, success criteria)
  specs.md          ← What (ADDED / MODIFIED / REMOVED)
  design.md         ← How (architecture, decisions)
  tasks.md          ← Checklist mirroring Linear sub-issues

linear-setup.md       ← How to configure Linear for CATMS
linear-milestones.md  ← Phase gates, roadmap, sprint cycles
```

---

## Quick start

```bash
npm install -g catms   # or: npx catms init (no global install)
catms init
```

> Not yet published to npm. Until then, run it from a local clone:
> ```bash
> git clone https://github.com/nagarajaabhishek/CATMS.git
> cd CATMS && npm link
> cd /path/to/your-project && catms init
> ```

`catms init` asks for your project name and paths, then copies all templates into the right places with your values substituted.

**If `AGENTS.md`/`CLAUDE.md`/`CURSOR.md` already exist** in your project (e.g. you already had your own `AGENTS.md` for another tool), `catms init` won't overwrite them — it appends a clearly marked, delimited CATMS block to the end of the existing file instead, leaving everything above it untouched.

---

## Keeping templates up to date

CATMS is versioned via npm. When a new version ships:

```bash
# From inside your project directory
catms update
```

**What gets updated automatically:**
- `.cursor/rules/*.mdc`, `docs/GIT_WORKFLOW.md`, `openspec-templates/*.md` — overwritten (no project customisation expected)
- `AGENTS.md` / `CLAUDE.md` / `CURSOR.md` — only the CATMS-managed block (between `<!-- CATMS:BEGIN -->` / `<!-- CATMS:END -->` markers) is replaced; anything you added outside those markers is preserved
- New files from the new version — added

**What needs manual review:**
- `AGENTS.md`/`CLAUDE.md`/`CURSOR.md` from a project set up with the old bash-script era (`setup.sh`/`update.sh`, pre-v0.4.0) — those files predate the marker format, so `catms update` prints a diff hint instead of guessing where to merge

`catms update` reads `.catms.json` in your project root to know your current version and project config.

---

## Core concepts

### 1. Lazy context loading
Agents read only what they need for the current task — not everything upfront. Session start requires just 2 reads: `active-projects.md` + the top entry of `log.md`. Anything beyond that is one hop away via `index.md`.

### 2. One branch per Linear issue
```bash
git checkout -b feat/LOG-42-short-description
```
Every feature, fix, or chore maps to a Linear issue and a branch.

### 3. Claim + handoff comments
When an agent starts an issue, it posts a claim comment. When it finishes, it posts a handoff. The next agent (or human) always knows the current state without reading the full chat.

### 4. OpenSpec before code
For any feature that takes more than a few hours: write `proposal.md` → `specs.md` → `design.md` → `tasks.md` first. Create Linear sub-issues from `tasks.md`.

### 5. Session logs as shared memory
Every agent session ends with a log entry in Obsidian. Context survives across agents, sessions, and days.

---

## Issue naming convention

All Linear issues use the prefix pattern: `[P1][You]` or `[P1][Agent]`

- `P1/P2/P3/P4` = phase priority (P1 = must-do now, P4 = deferred)
- `[You]` = human action required
- `[Agent]` = Cursor or Claude Code handles it

---

## Placeholders in templates

When running `catms init`, these are replaced with your values:

| Placeholder | Replaced with |
|-------------|--------------|
| `{PROJECT_NAME}` | Your project name |
| `{GITHUB_USER}` | Your GitHub username |
| `{LINEAR_TEAM_NAME}` | Your Linear team name |
| `{LINEAR_TEAM_ID}` | Your Linear team UUID |
| `{OBSIDIAN_VAULT_PATH}` | Path to your Obsidian vault |
| `{DROPLET_IP}` | Your server IP (if applicable) |
| `{SETUP_DATE}` | Today's date (`YYYY-MM-DD`), auto-filled |

---

## Workflow phases (Linear states)

`Backlog` → `Design & Docs` → `In Development` → `Testing & QA` → `In Review` → `Ready to Deploy` → `Deployed`

Also: `Blocked` 🔴, `Cancelled`, `Ongoing` (for standing/long-lived issues)

---

## License

MIT — use freely, attribution appreciated.
