# Sprints — {PROJECT_NAME}

> Cross-repo initiative planning. `tasks.md` is grouped by repo/area and is the state-of-record (owner/status/updated live there); this file groups the same work by sprint/initiative and is the plan-of-record. Same task-line format as `tasks.md`: `- [ ] **{id}** Task \`{priority}\` \`{owner}\` \`{updated}\`` + indented description.
> Workflow (start-of-sprint planning + branching, single-active-sprint WIP limit, end-of-sprint merge strategy) lives in `docs/SPRINT-WORKFLOW.md` — don't duplicate it here.
> **Sprint IDs** are a separate, distinct namespace from task-id prefixes — declared as `**Sprint ID:**` on each sprint's heading, tagged as `sprint: <slug>` on every task line. A sprint's task-id prefix can be reused from a repo's pre-existing numbering that isn't itself sprint-scoped, so the prefix alone can't identify the sprint. See `docs/SPRINT-WORKFLOW.md` → Sprint IDs.
> `depends_on` marks a real *same-repo* branch-lineage dependency (child branches from the parent's branch tip, not the integration branch; child's PR can't merge before the parent's). `blocks_on: {repo}#{id}` marks a *cross-repo* coordination gate instead (don't branch from it, just don't merge until the named repo's work has merged and deployed). See `docs/BRANCHING.md`.
> **Only one sprint may be `Active` at a time** (a WIP limit — see `docs/SPRINT-WORKFLOW.md` → Single active sprint). `Planned`/ideation work on any number of sprints is always fine — scoping, writing tasks/subtasks, adjusting priority — just no branches/code until a sprint is `Active`. In Claude Code, `task-kickoff` enforces this before creating a branch for a sprint task.

## Sprint queue (agent-determined order — see `docs/SPRINT-WORKFLOW.md` → Sprint ordering)
Ranked {SETUP_DATE}. Re-rank whenever a sprint is added or the active slot frees up.

0. **{Sprint name}** (`{slug}`, tasks `{PREFIX}-1..n`) — `Planned` / `Active` / `Paused` / `Completed`. One-line reason for its rank.

---

## Sprint: {Example sprint name}

**Sprint ID:** `{slug}`
**Status:** Planned
**Goal:** One or two sentences.

**Status as of {SETUP_DATE}:** Greenfield / partially built — grounded in what's actually been verified (code, `cams_query`), not assumed from an old label.

- [ ] **{PREFIX}-1** Task `P1` `—` `{SETUP_DATE}` `sprint: {slug}`
      One-line description.
- [ ] **{PREFIX}-2** Task `P1` `—` `{SETUP_DATE}` `depends_on: {PREFIX}-1` `sprint: {slug}`
      One-line description of why this needs `{PREFIX}-1`'s code first.

---

## Completed sprints
> Moved here once every task is `Done` and the release PR has landed — never deleted, checkboxes ticked. See `docs/SPRINT-WORKFLOW.md` → End of sprint.
