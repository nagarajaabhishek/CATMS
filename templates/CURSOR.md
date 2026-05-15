# Cursor Agent — {PROJECT_NAME} (paired with Claude Code)

## Why this exists

{PROJECT_NAME} is built with multiple AI agents (Cursor, Claude Code) and humans in the loop. Chat threads are ephemeral — the next session or agent will not read this conversation.

**Collaborative coding only works if information lives in the right place:**

| Store | Role |
|-------|------|
| **Linear** | Tasks, state, ownership, blockers, phases |
| **Obsidian vault** | Context, session logs, ADRs, OpenSpec, `active-projects.md` |

This file is the Cursor-specific mirror of `CLAUDE.md`. Full paths: see **Paths** below.

---

## Paths

| What | Where |
|------|-------|
| Obsidian vault | `{OBSIDIAN_VAULT_PATH}` |
| Active project index | `{OBSIDIAN_VAULT_PATH}/context/active-projects.md` |
| Project context | `{OBSIDIAN_VAULT_PATH}/projects/{PROJECT_NAME}/context.md` |
| Session logs | `{OBSIDIAN_VAULT_PATH}/projects/{PROJECT_NAME}/sessions/` |
| Linear team | {LINEAR_TEAM_NAME} |

---

## Every Session — Start (Lazy Context Loading)

**Load only what you need.**

**Step 1 — Always:**
1. Read `active-projects.md`
2. Read latest `sessions/YYYY-MM-DD-cursor.md`

**Step 2 — Only if needed:**
- `overview.md` — full issue list
- Topic context file: `context/infra.md`, `context/agent.md`, `context/mobile.md`, `context/decisions.md`
- Fall back to `context.md` if no topic file exists

**Step 3 — Linear: narrow only:**
- Filter by project, state, or identifier
- Max 10–15 issues at a time
- Never fetch all issues

---

## Token Efficiency

- One Cursor chat per distinct task
- Only call tools when you need the output
- Filter all Linear searches

---

## Git Branch Workflow

Every feature or fix → its own branch tied to a Linear issue:

```bash
git fetch origin && git checkout main && git pull origin main
git checkout -b feat/LOG-XX-short-description
git push -u origin feat/LOG-XX-short-description
# Open PR → main
```

| Prefix | Example |
|--------|---------|
| `feat/` | `feat/LOG-42-auth-flow` |
| `fix/` | `fix/LOG-51-secret-rotation` |
| `chore/` | `chore/update-deps` |
| `docs/` | `docs/api-guide` |

Never force-push `main`. Never commit `.env` or secrets. Squash merge PRs.

---

## Autonomous Task Ownership

### Claim comment
```
**Agent:** Cursor
**Action:** Claimed — in progress
**When:** YYYY-MM-DD
**Plan:** one line
```

### Handoff comment
```
**Agent:** Cursor
**Outcome:** Completed | Partial | Blocked
**Summary:** 2–4 sentences
**Work done:** bullets
**Verification:** tests run or not
**Follow-ups:** issue IDs
**Phase:** what you set
```

---

## During Work

- Starting → move issue to `In Development`
- Blocker → `Blocked` + session log note
- Done → `Testing & QA`
- Discovery worth keeping → append to `context/{topic}.md` immediately

---

## Session End (before wrapping)

If work was substantive:

1. Append to `sessions/YYYY-MM-DD-cursor.md`
2. Append durable facts to `context/{topic}.md`
3. Update `overview.md` and `active-projects.md` if phase changed
4. Update Linear issue state + post handoff comment

---

## Linear Projects

One project per repo. Issue naming: `[P1][You]` or `[P1][Agent]`

---

## Planning

New feature → **Linear issues + Obsidian OpenSpec in parallel:**
- `design/changes/{name}/proposal.md` → Why
- `design/changes/{name}/specs.md` → What
- `design/changes/{name}/design.md` → How
- `design/changes/{name}/tasks.md` → Checklist (mirrors sub-issues)
