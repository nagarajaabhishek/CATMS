# Agent Workflow — {PROJECT_NAME}

This is the canonical, tool-agnostic instructions file for every AI coding agent working in this repo. **Cursor**, **Google Antigravity**, **Codex**, **Windsurf**, and any other tool that reads `AGENTS.md` natively will load this file directly, live, every session. **Claude Code** does not read `AGENTS.md` natively; `CLAUDE.md` in this repo imports it with `@AGENTS.md` and adds Claude-Code-only notes (including four extra skills — see that file).

Multiple agents and humans share this codebase. **Chat is ephemeral** — the next session or the other agent will not read this conversation. Anything another agent needs must live in local trackers (`tasks.md`, `sprint.md`, `decision.md`) or the semantic memory layer (**CAMS RAG**), never only in chat.

---

## Tools Available

- **tasks.md** — the canonical project backlog. One master task tracker at the root of the workspace.
- **sprint.md** — tracks active, planned, and completed sprints.
- **decision.md** — tracks settled architecture and product design decisions.
- **log.md** & **sessions/** — reverse-chronological session logs and narrative histories.
- **CAMS** — Coding Agent Memory System. A local, lightweight semantic memory layer running as an MCP server.
  - Tools: `cams_query` (search memory), `cams_ingest` (save a fact), `cams_backfill` (sync tracker files to memory).

Always query CAMS (`cams_query`) before assuming something is unknown, stale, or still true. Run `cams_backfill` to sync memory after editing tracker files.

---

## Every Session — Start (Lazy Context Loading)

**Load only what you need. Never read everything upfront.**

**Step 1 — Always (mandatory, fast):**
1. Read the top entry of `log.md` — what happened last session.
2. Query CAMS (`cams_query`) for specific details instead of opening full historical session files.
3. Read the Priority Queue or active sprint tasks in `tasks.md` when picking up new work.

**Step 2 — Work:**
- Check for unclaimed tasks in the Priority Queue or active sprint.
- Claim a task by setting `owner` to your agent handle (e.g. `@claude` or `@cursor`) and updating `updated` to today's date.

---

## Token Efficiency Rules

- **Short sessions over long ones.** One conversation per distinct task.
- **Lazy tool calls.** Only call tools when you actually need the output.
- **Query CAMS** rather than reading full log/sprint/decision trackers.

---

## Branch discipline

Full rules: `docs/BRANCHING.md` (applied automatically by the `task-kickoff` skill in Claude Code). **Every feature or fix gets its own branch — never commit directly to the integration branch.**

Every task branch starts with a **collision check** — `cams_query` what's currently `In Progress` in this repo and what it touches, before cutting the branch. See `docs/BRANCHING.md` → Branch origin & dependency rules for the full mechanism, including `depends_on`/`blocks_on` and the `park/` branch prefix for shelved work.

**No agent merges into the integration branch/`main` or deletes a branch without asking first** — every merge is a proposed PR, every deletion happens only after a user-approved merge.

---

## Sprint Workflow

Full rules: `docs/SPRINT-WORKFLOW.md`. A sprint is a cross-repo/cross-cutting initiative tracked in `sprint.md`, separate from `tasks.md`'s per-repo state-of-record. **Only one sprint may be `Active` at a time** — see `docs/SPRINT-WORKFLOW.md` → Single active sprint for the WIP limit, exemptions, and enforcement.

---

## Autonomous Task Ownership & Tracking

### Claim
Before starting a backlog task, move it to `In Progress` (under the appropriate repo/component section in `tasks.md`), set `owner` to your handle (e.g., `@claude` or `@cursor`), and set `updated` to today's date (`YYYY-MM-DD`). Before creating the branch (see Branch discipline above), run the collision check and tag the line with `branch: <name>` — in Claude Code, the `task-kickoff` skill does all of this as one step, including for tasks that start as pure investigation.

### Handoff
Before pausing or finishing, update the task in place (move to `Done` or add notes if blocked) and write the actual execution narrative in the session log under `sessions/YYYY-MM-DD.md`.

---

## During Work — Keep Trackers in Sync

| Event | trackers / tasks.md | Session log / CAMS |
|-------|--------------------|--------------------|
| Starting a task | → `In Progress`, set `owner` and `updated` | Note it in session log |
| Architecture decision | Add entry in `decision.md` | `cams_ingest` the decision |
| Blocker hit | Mark as `🔴 Blocked` with details | Note blocker in session log |
| Bug found | Add to `Backlog` in `tasks.md` | Write details in session log |
| Task done | Check off and move to `Done` | Run `cams_backfill` at session end |

---

## Every Session — End

1. Write session log at `sessions/YYYY-MM-DD.md` (or `sessions/YYYY-MM-DD-cursor.md` for Cursor).
2. Prepend a one-liner entry to `log.md`.
3. If you made/found any durable decisions or facts, run `cams_ingest`.
4. Run `cams_backfill` to sync all updated trackers into CAMS.

---

## Planning — Always Parallel: trackers + design specs

For large features (3+ steps, design decisions):
1. Create one linking line in `tasks.md` pointing to the specs.
2. Create OpenSpec files under `docs/design/changes/{change-name}/` (using templates from `docs/design/openspec-templates/`):
   - `proposal.md` → Why
   - `specs.md` → What
   - `design.md` → How
   - `tasks.md` → Component checklist

---

## Project Setup (new projects)

`catms init` sets all of this up in one pass: trackers (`tasks.md`/`sprint.md`/`decision.md`/`log.md`/`sessions/`), `docs/BRANCHING.md` (single- or two-stage, chosen at init) and `docs/SPRINT-WORKFLOW.md`, `tools/cams/`, and (in Claude Code) five skills. Run CAMS backfill afterward to seed initial project memory. For a new repo joining an existing multi-repo workspace, add its section to the shared `tasks.md` and add it to `.catms.json`'s `repos` field so `scripts/branch-audit.sh` picks it up.

**Adopting an existing project.** `catms init`'s trackers start empty regardless of whether the project is brand new or has years of history — it's a plain script, it can't read and summarize a codebase itself. If `catms init` flagged real commit history at setup time, run the `project-adoption` skill (Claude Code) before the first real session: it reads the actual git log, README, and stack, then writes an honest first `decision.md` entry and seeds `tasks.md`'s backlog from what it actually finds — conservatively, not by inventing a roadmap — then backfills CAMS. Outside Claude Code, do the equivalent pass manually using `.claude/skills/project-adoption/SKILL.md` as the checklist.
