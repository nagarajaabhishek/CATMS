# CATMS Changelog

All notable changes to CATMS are documented here.
Format: `## [version] — YYYY-MM-DD`

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
