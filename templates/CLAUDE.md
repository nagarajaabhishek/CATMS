# Claude Code — {PROJECT_NAME}

@AGENTS.md

---

## Claude Code specifics

- **MCP tools:** Linear MCP — see `linear-setup.md` for setup (`claude mcp add -s user linear-mcp`). Obsidian MCP is optional — the vault is just markdown files, so read/write `{OBSIDIAN_VAULT_PATH}` directly with normal file tools whether or not Obsidian MCP is connected.
- **Slack MCP** (optional) — post session wraps to `#dev-updates`
- Use `/clear` between unrelated tasks to keep context lean
- Everything else — lazy loading, git workflow, Linear/Obsidian sync, OKF doc format — is defined once in [`AGENTS.md`](AGENTS.md), imported above. Do not duplicate it here.
