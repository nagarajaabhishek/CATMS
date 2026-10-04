# Claude Code — {PROJECT_NAME}

@AGENTS.md

---

## Claude Code specifics

- **MCP tools:** CAMS RAG MCP server — runs locally from `tools/cams/` and is registered via `.mcp.json`. Use `cams_query`, `cams_history`, `cams_ingest`, and `cams_backfill` to interact with project memory.
- **Skills:** seven project skills in `.claude/skills/` operationalize `docs/BRANCHING.md`/`docs/SPRINT-WORKFLOW.md`/`AGENTS.md` as runnable checklists — `task-kickoff` (claim + collision check + branch a task), `sprint-planning` (scope a new sprint), `pr-checks-loop` (get a PR's CI to a real green before merge), `sprint-close` (wrap up a finished sprint), `project-adoption` (run once, right after `catms init` on a project with existing history — seeds the trackers from the real codebase instead of starting blank), `session-sync` (the Every Session — End checklist — run proactively whenever wrapping up, not only when asked), `architecture-diagram` (generate a Mermaid diagram of this repo grounded in real code inspection — components, data flow, third-party/DB/cache/agent-RAG boundaries — saved to `docs/design/architecture.md`). Cursor/Antigravity don't read these natively — they get the same underlying rules from `docs/BRANCHING.md`/`docs/SPRINT-WORKFLOW.md`/`AGENTS.md` directly instead, minus the diagramming skill's automation.
- Use `/clear` between unrelated tasks to keep context lean
- Everything else — lazy loading, git workflow, local trackers — is defined once in [`AGENTS.md`](AGENTS.md), imported above. Do not duplicate it here.
