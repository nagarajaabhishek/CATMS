# Claude Code — {PROJECT_NAME}

@AGENTS.md

---

## Claude Code specifics

- **MCP tools:** CAMS RAG MCP server — runs locally from `tools/cams/` and is registered via `.mcp.json`. Use `cams_query`, `cams_ingest`, and `cams_backfill` to interact with project memory.
- **Skills:** four project skills in `.claude/skills/` operationalize `docs/BRANCHING.md`/`docs/SPRINT-WORKFLOW.md` as runnable checklists — `task-kickoff` (claim + collision check + branch a task), `sprint-planning` (scope a new sprint), `pr-checks-loop` (get a PR's CI to a real green before merge), `sprint-close` (wrap up a finished sprint). Cursor/Antigravity don't read these natively — they get the same rules from `docs/BRANCHING.md`/`docs/SPRINT-WORKFLOW.md` directly instead.
- Use `/clear` between unrelated tasks to keep context lean
- Everything else — lazy loading, git workflow, local trackers — is defined once in [`AGENTS.md`](AGENTS.md), imported above. Do not duplicate it here.
