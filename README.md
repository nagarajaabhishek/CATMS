# CATMS — Coding Agents Team Management System

A drop-in workflow template for teams building with multiple AI coding agents (Cursor, Claude Code) alongside humans.

**The problem:** AI agents are stateless. Every new session forgets everything. When two agents and a human work on the same codebase, work gets duplicated, context is lost, and nobody knows who did what.

**CATMS solves this** with a structured system where:
- **Linear** is the single source of truth for tasks, ownership, and state
- **Obsidian** is the cross-agent memory — session logs, decisions, specs
- **Agent rules** (CLAUDE.md, CURSOR.md, .mdc files) enforce consistent behaviour across every session
- **OpenSpec** gives every feature a paper trail before any code is written
- **Git branching** ties every branch to a Linear issue

---

## What's included

```
templates/          ← Drop into your project (run setup.sh)
  CLAUDE.md         ← Rules for Claude Code
  CURSOR.md         ← Rules for Cursor
  AGENTS.md         ← Generic agent baseline
  .cursor/rules/    ← Auto-applied Cursor rules (.mdc)
  docs/             ← Git workflow, pre-commit checklist

obsidian-template/  ← Copy into your Obsidian vault
  context/          ← active-projects.md
  projects/{name}/  ← Per-project memory structure

openspec-templates/ ← Design documents for features
  proposal.md       ← Why (problem, scope, success criteria)
  specs.md          ← What (ADDED / MODIFIED / REMOVED)
  design.md         ← How (architecture, decisions)
  tasks.md          ← Checklist mirroring Linear sub-issues

linear-setup.md     ← How to configure Linear for CATMS
setup.sh            ← Interactive init script
```

---

## Quick start

```bash
git clone https://github.com/nagarajaabhishek/CATMS.git
cd CATMS
./setup.sh
```

`setup.sh` will ask for your project name and paths, then copy all templates into the right places with your values substituted.

---

## Core concepts

### 1. Lazy context loading
Agents read only what they need for the current task — not everything upfront. Session start requires just 2 reads: `active-projects.md` + latest session log.

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

When running `setup.sh`, these are replaced with your values:

| Placeholder | Replaced with |
|-------------|--------------|
| `{PROJECT_NAME}` | Your project name |
| `{GITHUB_USER}` | Your GitHub username |
| `{LINEAR_TEAM_NAME}` | Your Linear team name |
| `{LINEAR_TEAM_ID}` | Your Linear team UUID |
| `{OBSIDIAN_VAULT_PATH}` | Path to your Obsidian vault |
| `{DROPLET_IP}` | Your server IP (if applicable) |

---

## Workflow phases (Linear states)

`Backlog` → `Design & Docs` → `In Development` → `Testing & QA` → `In Review` → `Ready to Deploy` → `Deployed`

Also: `Blocked` 🔴, `Cancelled`, `Ongoing` (for standing/long-lived issues)

---

## License

MIT — use freely, attribution appreciated.
