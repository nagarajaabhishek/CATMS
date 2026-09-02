# Tasks — {PROJECT_NAME}

> Master backlog. One file covers this whole project — if this is a multi-repo workspace, section by repo below rather than creating a `tasks.md` per repo.
>
> **Task line format:** `- [ ] **{id}** {title} \`{priority}\` \`{owner}\` \`{updated}\`` followed by an indented one-line description.
>
> **Fields:**
> - **id** — short stable reference, `{PREFIX}-{n}` (e.g. `APP-1`, `BE-2`), incrementing per repo/area. Never reuse a retired id.
> - **priority** — `P0` (urgent/near-done, do next) → `P1` (normal) → `P2` (later/nice-to-have).
> - **owner** — `—` for unclaimed, or `@claude` / `@cursor` / `@you` / a real name / agent claim tag. For multi-developer teams using Claude Code / Cursor / Antigravity, use the per-developer claim tags registered in `.catms.json`'s `team` array: `@claude-<slug>` (e.g. `@claude-an`, `@claude-jordan`) so two developers both running Claude Code produce distinguishable tags instead of both collapsing to `@claude`. Always check this is still `—` before claiming a Backlog item.
> - **updated** — `YYYY-MM-DD`, bumped whenever the line's state/owner/description changes.
> - **branch** — `branch: <name>`, required once a task is `In Progress`. See `docs/BRANCHING.md`.
> - **depends_on** — optional, `depends_on: {parent-id}` — only when this task's branch genuinely can't be built without a *same-repo* sibling task's unmerged code. The child branch cuts from the parent's branch tip, and the child's PR can't merge before the parent's. See `docs/BRANCHING.md` → Branch origin & dependency rules.
> - **blocks_on** — optional, `blocks_on: {repo}#{id-or-PR}`, for a *cross-repo* dependency (a different repo's unmerged PR or not-yet-deployed change this task needs). Not something you branch from — a coordination gate: don't merge until the named repo's work has merged *and* deployed. See `docs/BRANCHING.md`.
> - **description** — one line, plain prose. If it needs more than a sentence or two, it belongs in an OpenSpec change folder (`docs/design/changes/{change-name}/`) instead, with just a linking line here.

## Priority queue (do next)
1. [area] `{priority}` `{owner}` — Task — why it's top (optional, 1 line)

---

## Sprints (cross-repo initiatives)
> Grouped planning view for multi-task, multi-repo work — see `sprint.md` (goal/status/branching/merge strategy) and `docs/SPRINT-WORKFLOW.md` for how sprints relate to this file. Task ids below also live in their repo section here; `tasks.md` is still the state-of-record (owner/status/updated). Each sprint has its own `sprint:` id, a separate namespace from its tasks' id prefix — see `docs/SPRINT-WORKFLOW.md` → Sprint IDs.

---

## {repo-or-area-name}

### 🔴 Blocked
- [ ] **{id}** Task `{priority}` `{owner}` `{updated}`
      One-line description. Blocked on: reason / who unblocks it.

### In Progress
- [ ] **{id}** Task `{priority}` `@claude` `{updated}` `branch: feat/{id}-short-description`
      One-line description of what/why.

### Backlog
- [ ] **{id}** Task `P0` `—` `{updated}`
      One-line description.
- [ ] **{id}** Task `P2` `—` `{updated}`
      One-line description.

### Done
- [x] **{id}** Task `—` `@claude` `{updated}`

**Completed tasks are marked `[x]` and moved to `Done` — never deleted.** If `Done` grows long, move older entries into `log.md` (or a dated archive) rather than dropping them — the completion record stays, it just moves out of the actively-scanned section.

## States
`Backlog` → `In Progress` → `Blocked` (flag, don't move out of its section) → `Done`. No separate `Design & Docs`/`Testing & QA`/`In Review`/`Ready to Deploy` states — if a task needs that nuance, say so inline: `- [ ] Ledger CRUD — built, needs QA`.

## Claim (avoiding duplicate work across agents/sessions)
When starting a Backlog task, move it to `In Progress`, set `owner` to `@claude`/`@cursor`, bump `updated` to today, and tag `branch:` once the branch exists. That edit *is* the claim — no separate comment step. Before picking up any Backlog item, check its `owner` is still `—`, and check for an existing branch/PR too — two concurrent sessions of the same tool aren't disambiguated by `owner` alone. See `docs/BRANCHING.md` and (in Claude Code) the `task-kickoff` skill, which runs this automatically.

## Handoff
When you pause or finish a task, update its line in place (move section, add a short outcome note if non-obvious) and write the actual narrative in the session log (`sessions/YYYY-MM-DD.md`) — same as always. `tasks.md` stays terse; the session log carries the "why/what happened."

## Relationship to OpenSpec (`docs/design/changes/`)
Small tasks (bug fix, one-file feature) live directly in `tasks.md` — no OpenSpec folder needed. Larger features (3+ concrete steps, needs a design decision) get the full OpenSpec flow (`docs/design/changes/{change-name}/{proposal,specs,design,tasks}.md`), but `tasks.md` gets exactly **one** line linking to it.

## Every Session — Start/End
- **Start:** after reading `log.md`'s top entry and `cams_query`-ing anything specific, read this file's Priority Queue (or just the relevant section) before picking up new work.
- **End:** update this file — move/checkbox any tasks touched this session — before writing the session log. Completed tasks get checked off and moved to `Done`, not deleted.
