# CATMS Changelog

All notable changes to CATMS are documented here.
Format: `## [version] — YYYY-MM-DD`

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
