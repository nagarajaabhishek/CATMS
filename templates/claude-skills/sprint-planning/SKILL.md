---
name: sprint-planning
description: Plan and scope a new cross-repo sprint or initiative for {PROJECT_NAME} — retrieves related existing sprints/tasks first, discusses scope with the user in conversation, then (once agreed) writes sprint.md with real verified status, assigns task IDs, sets depends_on/blocks_on dependency fields, links tasks.md, and syncs the session log/CAMS. Use this whenever the user wants to start a new sprint, plan a multi-task or multi-repo initiative, break a feature down into tasks and subtasks, asks what the plan is for something bigger than one repo's tasks.md section, OR simply raises a new idea/feature in conversation ("what if we built X," "I want to add Y," thinking out loud about a feature) — even casually, even without saying "sprint" or "plan." The retrieval-and-discuss step is cheap and should run proactively rather than waiting to be asked.
---

# Sprint planning ({PROJECT_NAME})

Scope a cross-repo (or cross-cutting) initiative and write it into `sprint.md`, grounded in verified current status rather than an old assumption. This is the start-of-sprint half of the workflow defined in `docs/SPRINT-WORKFLOW.md`; that file is the source of truth for *why* — this skill is the operational checklist for *how*.

A sprint is for work that's bigger than one repo/area's `tasks.md` section but doesn't need its own product — e.g. "merge two features," "a security-hardening rollup," "enforce a new uniqueness constraint across services." If the ask fits cleanly into one repo's Backlog as a single task, it doesn't need a sprint — just add it to `tasks.md` directly.

**This skill is always safe to run, regardless of which sprint (if any) is currently `Active`.** Only one sprint may be `Active`/building at a time (`docs/SPRINT-WORKFLOW.md` → Single active sprint), but planning is exempt from that limit — scope, write, and refine as many sprints as you want at any time. A new sprint you create here starts at `**Status:** Planned` and stays there until someone actually runs `task-kickoff` on one of its tasks; it does not compete for the active slot just by existing in `sprint.md`.

## Steps

### 0. Retrieve related work and discuss scope — before writing anything

This step runs even for a casual "what if we built X" — it's cheap and prevents both duplicate sprints and premature file-writing.
1. `cams_query` a plain-language question about the idea. Do not `Read` `sprint.md`/`tasks.md` whole. If CAMS returns nothing useful, one `Grep` (matching lines only), then stop.
2. Tell the user what you found: an overlapping sprint (`Planned`/`Active`/`Paused`/`Completed`), a related standalone task, or nothing tracked yet.
3. **Judge the size before proposing a sprint at all.** If this is small enough to be one `tasks.md` line, say so and offer to just add it there — don't manufacture sprint ceremony for a one-line task. Move to step 4 below only if it's genuinely sprint-shaped (3+ steps, multiple repos, or a real design decision).
4. **Discuss scope in chat before writing `sprint.md`.** Propose a goal and rough task breakdown, ask what's in/out of scope, and get actual agreement. If it overlaps an existing sprint, discuss whether this is new tasks under that sprint or a genuinely separate one — don't silently fold it in or silently spin up a duplicate.
5. Only once the user has actually agreed on scope, proceed to step 1 below to formalize it. Don't write `sprint.md` from a one-sided read of a casual conversation.

### 1. CAMS precondition

Confirm the local memory store is usable before researching anything — run `cams_backfill` if it hasn't run yet this session (cheap, safe, dedupes on content hash).

### 2. Research the real status — don't write a plan from memory

This is the step most likely to get skipped under time pressure, and it's the one that matters most. A sprint plan built on a stale assumption (a `tasks.md` `[x]` that's actually uncommitted WIP, a "shipped" feature whose backing service was later removed) sends whoever picks it up down the wrong path.

For each thing the sprint touches:
- Run `cams_query` with a plain-language question ("is X actually done", "what's the current status of Y") before trusting any label in `tasks.md`.
- If the plan will reference a specific file, column, function, or service, verify it exists — grep the actual repo, don't infer from a doc summary.
- If a task touches a surface with known incident history, say so explicitly in the sprint's status paragraph — the next person executing needs that warning up front, not discovered mid-merge.

### 3. Write the sprint into `sprint.md`

Follow the existing structure in the file. `cams_query` existing sprint slugs first so you don't overwrite another sprint. When inserting, `Read` only the Sprint queue heading and the insertion point — not every sprint. Each sprint section needs:
- **Sprint ID:** — a short slug for the sprint itself, right under the `## Sprint: {name}` heading. Separate namespace from the task-id prefix (step 4) — pick something that doesn't collide with any existing repo/area task-id prefix.
- **Goal** — one or two sentences.
- **Status as of {date}** — grounded in step 2's findings. State what's actually built vs. designed-only vs. greenfield. Flag caution surfaces explicitly.
- A checklist of concrete tasks, each formatted like a `tasks.md` line, with the sprint slug tagged on every one: `- [ ] **{id}** Task \`{priority}\` \`{owner}\` \`{updated}\` \`sprint: {slug}\`` + an indented one-line description.

### 4. Assign task IDs

- If the work belongs to a repo/area already tracked in `tasks.md` (has an existing prefix), continue that numbering. Check the current highest number first with a targeted grep.
- Only mint a new short prefix for a genuinely new cross-cutting initiative that doesn't map to one existing sequence.
- Never reuse a retired id.
- This is a different decision than the sprint's own ID (step 3) — a sprint reusing a repo's existing task-id prefix still needs its own distinct `sprint:` slug.

### 5. Larger tasks get an OpenSpec folder, not more sprint.md prose

If a task needs 3+ real steps or a design decision, create `docs/design/changes/{change-name}/` with `proposal.md`/`specs.md`/`design.md`/`tasks.md`. The `sprint.md` line for that task becomes one linking line, same convention `tasks.md` already uses for OpenSpec.

### 6. Set dependency fields — but don't over-chain

Most tasks in a sprint are independent of each other. Only add a dependency field when there's a real build-order constraint:
- `depends_on: {parent-id}` — same-repo only. The child task's branch will be cut from the parent's branch tip instead of the integration branch, and its PR can't merge before the parent's. Use this when a task literally can't be built without a sibling's unmerged code.
- `blocks_on: {repo}#{id}` — cross-repo coordination only. Not something anyone branches from — it's a "don't merge this until that repo's PR has merged *and deployed*" gate.
- If two tasks will plausibly touch the *same file* but aren't a clean parent→child relationship, say so as a caution note in the sprint status rather than forcing an artificial dependency chain — flag it for whoever executes to make the sequencing call (`task-kickoff`'s collision check catches this at branch-creation time too).

### 6b. Rank the new sprint into the Sprint queue

`sprint.md`'s **Sprint queue** section orders every `Planned` sprint by: standing decay/risk first, then highest task priority present, then agent-actionability of the next step, with incident-surface caution as a caveat (not a demotion) and staleness as the final tiebreaker — full criteria in `docs/SPRINT-WORKFLOW.md` → Sprint ordering. Insert the new sprint at its actual rank against the existing queue, with a one-line reason, rather than appending it to the bottom by default.

### 7. Link `tasks.md` to the sprint

Add (or update) a short pointer section near the top of `tasks.md`, one line per sprint, pointing into `sprint.md` — follow the existing "Sprints (cross-repo initiatives)" section as the template. `tasks.md` stays the state-of-record (owner/status/updated); `sprint.md` is the plan-of-record. Don't duplicate full task lines into both — the pointer is enough.

### 8. Sync everything before finishing

Same session-end discipline as any other work (`AGENTS.md` → Session End):
1. Session log: `sessions/YYYY-MM-DD.md` (or the tool-specific suffix — see `CURSOR.md`).
2. Prepend one line to `log.md`.
3. `cams_ingest` the real decisions from this planning pass, then `cams_backfill`.

## What this skill doesn't cover

- Actually starting work on a task → use `task-kickoff`.
- Wrapping up a finished sprint (merging, deploying, archiving) → use `sprint-close`.
- Code review, verification, or deployment of a specific change → use normal implementation practice; this skill is planning-only.
