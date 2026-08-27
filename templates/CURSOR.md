# Cursor Agent — {PROJECT_NAME} (paired with Claude Code)

## Why this exists — collaborative AI coding

{PROJECT_NAME} is built with **more than one AI agent** (Cursor, Claude Code, possibly Antigravity) and humans in the loop. Chat threads are **not** the system of record — the next session or the other agent will not read this conversation.

The full workflow (trackers + CAMS + git) lives in one place: **[AGENTS.md](AGENTS.md)**. Cursor loads it automatically (also mirrored in `.cursor/rules/workflow.mdc` for guaranteed always-apply behavior). This file only covers what's specific to running as **Cursor alongside Claude Code**.

---

## Cursor-specific conventions

- **Session log naming:** Cursor writes `sessions/YYYY-MM-DD-cursor.md` (note the `-cursor` suffix) so it never collides with Claude Code's `sessions/YYYY-MM-DD.md` for the same day. Read both if both exist for today.
- **Claim/handoff comments:** update `tasks.md`'s `owner` and `updated` fields directly (see `AGENTS.md` for details).
- **Auto-applied rules:** `.cursor/rules/workflow.mdc` (trackers/CAMS workflow) and `.cursor/rules/git-workflow.mdc` (branch discipline) load on every chat automatically — no action needed.

---

## Relationship to `AGENTS.md`

- **`AGENTS.md`** — the single canonical source: lazy loading, token efficiency, git workflow, local trackers, CAMS RAG server, documentation format. Read natively by Cursor and Antigravity; imported by `CLAUDE.md` for Claude Code.
- **`CURSOR.md`** (this file) — only the bits unique to running Cursor in tandem with Claude Code (session log suffix, coordination notes).

If this file and `AGENTS.md` ever conflict, `AGENTS.md` wins.
