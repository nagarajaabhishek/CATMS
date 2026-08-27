---
name: sprint-close
description: Close out a finished sprint in {PROJECT_NAME} — merges each task branch individually in dependency order, verifies staging, cuts exactly one release PR from the integration branch to main for the whole sprint (two-stage projects), deletes merged branches, archives the sprint.md section, and runs full session-end sync. Use whenever every task in a sprint has reached Done, or the user wants to wrap up, release, or ship a sprint, land a batch of related branches, or asks to "finish up" or "close out" a piece of work. Always confirm explicit go-ahead before any merge or branch deletion — never do either autonomously, even when this skill is running.
---

# Sprint close ({PROJECT_NAME})

Run this once every task in a sprint has reached `[x]` Done in `tasks.md`, to land the sprint's branches and close the loop on tracking. This is the end-of-sprint half of `docs/SPRINT-WORKFLOW.md`.

**The one rule that overrides everything else in this skill:** no agent — regardless of tool — merges branches into the integration branch/`main` or deletes branches autonomously. Every merge is a normal reviewed PR; every deletion happens only after a PR the user approved has actually merged, or the user explicitly says to delete something. This isn't a suggestion — an unsupervised bulk merge/delete pass is a real, expensive failure mode in concurrent multi-tool workspaces, and it's exactly what this rule exists to prevent. Everything below assumes you're proposing PRs and reporting status, not executing merges yourself.

## Steps

### 1. Verify Done actually means Done

`cams_query` the sprint slug and its task ids first. Then `Read` only that sprint's section in `sprint.md` (by `**Sprint ID:**`, not the whole file) and only the matching `tasks.md` lines — confirm each is genuinely `[x]`, not just believed to be. If anything's still open, stop here and say so rather than starting close-out on an incomplete sprint.

### 2. Determine merge order from the dependency graph

List every task's branch alongside its `depends_on`/`blocks_on` fields (if any):
- Tasks with no dependency field can merge in any order.
- A task with `depends_on: {parent-id}` cannot merge before its parent has merged into the integration branch.
- A task with `blocks_on: {repo}#{id}` cannot merge before that other repo's referenced work has both merged *and* actually deployed — verify with a real deploy log or staging URL, not just the GitHub merge event.

Produce a simple ordered list (or note if there are independent parallel groups) before proposing anything.

### 3. Propose one PR per task branch, in order

For each task branch, in the order from step 2:
1. Merge the integration branch into the task branch locally first (not the other direction) and confirm it's still buildable/testable against current state.
2. Push the branch.
3. Open a PR into the integration branch — **one task branch per PR**, never a combined PR for multiple sprint tasks. This keeps review scoped and bisectable, and matches how the tasks were branched in the first place (see `task-kickoff`).
4. **Run `pr-checks-loop` on it before treating it as ready.** A PR isn't done at "opened" — every required check needs to be genuinely green, root-caused and fixed rather than bypassed, before it counts as mergeable.
5. Report the PR to the user and wait for review/merge — don't proceed to the next dependent task's PR until a parent PR it depends on has actually merged.

### 4. Verify staging once every task branch is merged (two-stage projects)

If this project has a staging environment, check it actually reflects the change — don't assume a green merge means it's live and correct. Single-stage projects (no separate integration branch) can skip this — each task's PR already went straight to `main`.

### 5. Cut exactly one release PR for the whole sprint (two-stage projects only)

Once staging looks right, propose a single integration-branch → `main` PR covering the sprint as a whole — not one per task. This is the normal release-PR flow already used for any other work in this project, just scoped to "everything this sprint touched." Run `pr-checks-loop` on this one too before proposing it as ready. Single-stage projects have nothing to do here — this step doesn't apply.

### 6. Propose branch deletion — only after merge, only with confirmation

For each task branch, once its PR has actually merged (confirmed, not assumed): propose deleting the local and remote copies. That's the only path a branch is allowed to disappear through. Don't batch-delete without the user's go-ahead, even at the end of a clean sprint.

### 7. Archive the sprint in `sprint.md`

Flip the sprint's `**Status:**` line to `Completed`, then move the whole section to the trailing "Completed sprints" area at the bottom of `sprint.md`, checkboxes ticked — don't delete it. Same convention as `tasks.md`'s `Done` section. This also clears the single-active-sprint slot (see `docs/SPRINT-WORKFLOW.md` → Single active sprint) — say explicitly that another `Planned` sprint is now free to become `Active` next.

### 8. Full session-end sync

Same as any other session (`AGENTS.md` → Session End):
1. Session log narrating the close-out (which PRs, in what order, any snags).
2. Prepend a line to `log.md`.
3. Confirm `tasks.md` correctly reflects `Done` for every task touched.
4. `cams_ingest` the close-out decisions, then `cams_backfill`.

## What this skill doesn't cover

- Scoping or planning the sprint in the first place → use `sprint-planning`.
- Starting individual tasks within the sprint → use `task-kickoff`.
- The actual code review or verification of each task's changes before its PR is proposed → use normal review/verification practice; this skill assumes that already happened per-task and focuses on the merge/release choreography across the whole sprint.
