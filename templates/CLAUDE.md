# Global Claude Instructions — {PROJECT_NAME} Workspace

## Tools Available
- **Linear MCP** — task lifecycle management
- **Obsidian MCP** — session memory, design docs, ADRs at `{OBSIDIAN_VAULT_PATH}`
- **Slack MCP** — post updates to `#dev-updates` (optional)

---

## Every Session — Start (Lazy Context Loading)

**Load only what you need. Never read everything upfront.**

**Step 1 — Always (mandatory, 2 reads max):**
1. Read `context/active-projects.md` — identifies active project + current phase + next action
2. Read the latest session log at `projects/{name}/sessions/` — what happened last

**Step 2 — Only if needed for the task:**
- `projects/{name}/overview.md` — only if you need the full stack/issue list
- Topic-specific context file only:
  - `context/infra.md` → deployment/CI/CD/env work
  - `context/agent.md` → AI/LLM/agent work
  - `context/mobile.md` → mobile app work
  - `context/decisions.md` → architecture questions
  - Fall back to `context.md` only if no topic file exists

**Step 3 — Linear: narrow searches only:**
- Always filter by **project**, **state**, or **identifier**
- Never fetch all issues — max 10–15 at a time
- States priority: `In Development` → `Blocked` → `Testing & QA`

**Step 4 — Work:**
- If unclear what to work on, ask — unless told to "continue" or "pick up Linear tasks", then pick the highest-value `In Development` issue.

---

## Token Efficiency Rules

**Short sessions over long ones.** One conversation per distinct task.

**Lazy tool calls.** Only call tools when you actually need the output.

**Specific Linear searches.** Always filter — never fetch all issues without a filter.

**Use `/clear` between tasks** when switching topics mid-session.

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
**Agent:** Claude Code
**Action:** Claimed — in progress
**When:** YYYY-MM-DD
**Plan:** one line (optional)
```
Move issue → `In Development`.

### Handoff comment (when finishing or pausing)
```
**Agent:** Claude Code
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
| Architecture decision | — | Write ADR in `projects/{name}/design/decisions/` |
| Blocker hit | Mark → `Blocked` | Note blocker in session log |
| Dev done | Move → `Testing & QA` | — |
| Bug found | Create issue (label `Bug`) | Write bug report in `testing/bugs/` |
| Tests passing | Move → `In Review` | — |
| Deployed | Move → `Deployed` | — |

---

## Every Session — End

1. Write session log at `projects/{name}/sessions/YYYY-MM-DD.md`
2. Append new facts to `projects/{name}/context/{topic}.md`
3. Update `projects/{name}/overview.md`
4. Update `context/active-projects.md`
5. Ensure all worked-on Linear issues reflect correct phase

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
2. **Obsidian** — OpenSpec under `projects/{name}/design/changes/{change-name}/`
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
2. Create `projects/{name}/` in Obsidian vault
3. Create folder structure (sessions/, design/, testing/bugs/)
4. Add to `context/active-projects.md`
