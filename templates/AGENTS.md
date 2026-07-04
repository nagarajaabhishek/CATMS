# Agent Workflow — {PROJECT_NAME}

This is the canonical, tool-agnostic instructions file for every AI coding agent working in this repo. **Cursor**, **Google Antigravity**, **Codex**, **Windsurf**, and any other tool that reads `AGENTS.md` natively will load this file directly, live, every session. **Claude Code** does not read `AGENTS.md` natively; `CLAUDE.md` in this repo imports it with `@AGENTS.md` and adds Claude-Code-only notes.

Multiple agents and humans share this codebase. **Chat is ephemeral** — the next session or the other agent will not read this conversation. Anything another agent needs must live in **Linear** (tasks/state) or the **Obsidian vault** (context/history), never only in chat.

---

## Tools Available

- **Linear** — task lifecycle management (`Backlog` → `Design & Docs` → `In Development` → `Testing & QA` → `In Review` → `Ready to Deploy` → `Deployed`)
- **Obsidian vault** (`{OBSIDIAN_VAULT_PATH}`) — session memory, design docs, ADRs

Don't worry about whether an Obsidian MCP server is connected. The vault is just a folder of markdown files — read and write them directly at `{OBSIDIAN_VAULT_PATH}/projects/{PROJECT_NAME}/...` with your normal file tools. MCP (if present) is a convenience layer for backlinks/graph view inside the Obsidian app; it is never required for this workflow.

---

## Documentation Format — OKF

All docs under `{OBSIDIAN_VAULT_PATH}/projects/{PROJECT_NAME}/` conform to Google's [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) v0.1 — plain markdown, no tooling required:

- Every concept doc (`overview.md`, `context.md`, `context/*.md`) carries YAML frontmatter: `type`, `title`, `description`, `tags`, `timestamp`. Unknown fields must be preserved, nothing is centrally registered.
- `index.md` (reserved filename) — progressive-disclosure directory listing for a folder. No frontmatter except `okf_version: "0.1"` at the project root's `index.md`.
- `log.md` (reserved filename) — reverse-chronological, one line per session, newest first. Points at the full `sessions/YYYY-MM-DD.md` entry.

This is what makes lazy loading below fast: `log.md` tells you what happened most recently without listing a directory; `index.md` tells you what exists without opening every file.

---

## Every Session — Start (Lazy Context Loading)

**Load only what you need. Never read everything upfront.**

**Step 1 — Always (mandatory, fast):**
1. Read `{OBSIDIAN_VAULT_PATH}/context/active-projects.md` — current phase + next action
2. Read the top entry of `projects/{PROJECT_NAME}/log.md` — what happened last session

**Step 2 — Only if needed for the task:**
- Read `projects/{PROJECT_NAME}/index.md` — lists what's available and where (overview, topic context files, design docs, sessions) — follow only the link relevant to the current task.

**Step 3 — Linear: search narrow, not broad:**
- Filter by **project**, **state**, or **identifier**
- States priority: `In Development` → `Blocked` → `Testing & QA`
- Never fetch all issues — max 10–15 at a time

**Step 4 — Work:**
- If unclear what to work on, ask — unless told to "continue" or "pick up Linear tasks", then pick the highest-value `In Development` issue.

---

## Token Efficiency Rules

**Short sessions over long ones.** One conversation per distinct task.

**Lazy tool calls.** Only call tools when you actually need the output.

**Specific Linear searches.** Always filter — never fetch all issues without a filter.

---

## Git Branch Workflow

**Every feature or fix gets its own branch — never commit directly to `main`.**

```bash
git fetch origin && git checkout main && git pull origin main
git checkout -b feat/LOG-XX-short-description
# ... commit work ...
git push -u origin feat/LOG-XX-short-description
# Open PR → main on GitHub
```

| Prefix | Use for | Example |
|--------|---------|---------|
| `feat/` | New feature | `feat/LOG-42-auth-flow` |
| `fix/` | Bug fix | `fix/LOG-51-secret-rotation` |
| `chore/` | Tooling, deps | `chore/update-requirements` |
| `docs/` | Docs only | `docs/api-guide` |

**Rules:**
- One Linear issue = one branch
- Never force-push `main`
- Never commit `.env` files or secrets
- Squash merge PRs, delete branch after merge

---

## Autonomous Task Ownership

### Claim comment (when starting an issue)
```
**Agent:** {your agent name — e.g. Claude Code, Cursor, Antigravity}
**Action:** Claimed — in progress
**When:** YYYY-MM-DD
**Plan:** one line (optional)
```
Move issue → `In Development`.

### Handoff comment (when finishing or pausing)
```
**Agent:** {your agent name}
**Outcome:** Completed | Partial | Blocked
**Summary:** what changed (2–4 sentences)
**Work done:** bullets — files, migrations, config
**Verification:** tests run or not (why)
**Follow-ups:** issue IDs or none
**Phase:** what you set
```

---

## During Work — Keep Linear + Obsidian in Sync

| When | Linear | Obsidian |
|------|--------|----------|
| Starting a task | Post claim comment; move → `In Development` | Note in session log |
| Architecture decision | — | Write ADR in `projects/{PROJECT_NAME}/design/decisions/` |
| Blocker hit | Mark → `Blocked` | Note blocker in session log |
| Dev done | Move → `Testing & QA` | — |
| Bug found | Create issue (label `Bug`) | Write bug report in `testing/bugs/` |
| Tests passing | Move → `In Review` | — |
| Deployed | Move → `Deployed` | — |

---

## Every Session — End

1. Write session log at `projects/{PROJECT_NAME}/sessions/YYYY-MM-DD.md`
2. Prepend a one-line entry to `projects/{PROJECT_NAME}/log.md`
3. Append new facts to `projects/{PROJECT_NAME}/context/{topic}.md`
4. Update `projects/{PROJECT_NAME}/index.md` if new docs were added
5. Update `context/active-projects.md`
6. Ensure all worked-on Linear issues reflect correct phase

---

## Linear Team + Projects

- **Team:** {LINEAR_TEAM_NAME} (ID: `{LINEAR_TEAM_ID}`)
- **Projects:** one per repo/codebase
- **Issue naming:** `[P1][You]` or `[P1][Agent]` prefix
  - P1/P2/P3/P4 = phase priority
  - [You] = human action, [Agent] = AI handles it

---

## Planning — Always Parallel: Linear + Obsidian

New feature or large fix → create **both** simultaneously:

1. **Linear** — parent issue + sub-issues
2. **Obsidian** — OpenSpec under `projects/{PROJECT_NAME}/design/changes/{change-name}/`
   - `proposal.md` → Why
   - `specs.md` → What
   - `design.md` → How
   - `tasks.md` → Checklist (mirrors Linear sub-issues)

---

## Lifecycle Phases

`Backlog` → `Design & Docs` → `In Development` → `Testing & QA` → `In Review` → `Ready to Deploy` → `Deployed`

Also: `Blocked` 🔴, `Cancelled`, `Ongoing` (standing/long-lived issues)

---

## Project Setup (new projects)

1. Create Linear project for the repo
2. Create `projects/{PROJECT_NAME}/` in Obsidian vault
3. Create folder structure (`sessions/`, `design/`, `testing/bugs/`), plus `index.md` and `log.md`
4. Add to `context/active-projects.md`
