---
name: task-kickoff
description: Claim and safely start any tasks.md or sprint.md task in {PROJECT_NAME} — runs the collision check, branch-origin rules (integration branch vs. a depends_on parent's tip), local/GitHub checkout hygiene, and a migration-number safety check that together prevent branches from silently colliding, then creates the branch immediately. Use this at the start of ANY tasks.md/sprint.md item — including ones that look like pure investigation, not just ones where code is already planned — whenever about to start implementation, claim a task, create a new feature branch, or when the user says something like "let's start working on X," "pick up the next task," "look into Y," or "I'm going to build Z now" — even if they don't mention branches explicitly.
---

# Task kickoff ({PROJECT_NAME})

Run this at the start of any `tasks.md`/`sprint.md` item — including ones that start as pure investigation, before you know whether they'll need a code change at all. It exists because concurrent work on different features can cause branches to overlap or collide, and because a task that starts as diagnosis can drift into a fix mid-flow with no natural moment to branch. Every step below closes one specific way that happens.

Full rule text lives in `docs/BRANCHING.md` → **Branch origin & dependency rules** and **Branch maintenance — edge cases**; this skill is the checklist version to actually run.

## Steps

### 0. Single-active-sprint check — do this before anything else

If the task belongs to a sprint, its `sprint.md` line carries a `sprint: <slug>` tag identifying which one — that's a separate id from the task's own prefix. `cams_query` which sprint is `Active` and which slug this task belongs to — do not `Read` `sprint.md` whole. Then `Read` only that sprint's `**Status:**` line if you need to flip it:
- **This sprint is already `Active`** → proceed.
- **No sprint is `Active` yet, and the user asked for a specific task/sprint by name** → proceed with that one; their explicit choice overrides the queue. This claim activates it — flip this sprint's status line to `Active` in `sprint.md` as part of step 1's claim, and say so explicitly.
- **No sprint is `Active` yet, and the user asked open-endedly ("what's next," "let's continue")** → don't ask which sprint; `cams_query` the **Sprint queue** and pick the top-ranked one yourself (see `docs/SPRINT-WORKFLOW.md` → Sprint ordering). State which sprint you picked and why (one line from its queue rationale) before proceeding, then activate it as above. Do not `Read` `sprint.md` whole.
- **A *different* sprint is currently `Active`** → **stop before claiming or branching.** Tell the user which sprint is `Active` and which one this task belongs to, and that only one sprint builds at a time (see `docs/SPRINT-WORKFLOW.md` → Single active sprint). Ask which of these they want:
  1. Finish (→ `sprint-close`) or explicitly pause the `Active` sprint first, then come back to this task — pausing is just flipping that sprint's `sprint.md` status line from `Active` to `Paused`, which frees the slot, or
  2. Explicitly override the WIP limit for just this one task — if they say yes, proceed, but say plainly that you're breaking the WIP limit on purpose, don't do it quietly.
  Don't guess which they'd want and don't proceed without an answer — this is the one gate in this skill that's a hard stop, not a judgment call.
- **The task isn't part of any sprint** (a standalone `tasks.md` backlog item) → the WIP limit doesn't apply, proceed to step 1 normally.

### 1. Claim the task

- `cams_query` the task id first. Then `Read` **that one task line** (not the whole tracker) to confirm `owner` is still `—` before touching it.
- Also check for a signal the owner field alone can't give you: an existing branch or PR for this task id — `git branch -a | grep <id>` and `gh pr list --head <slug> --state all` in the relevant repo. Two concurrent sessions of the *same* tool aren't disambiguated by the owner tag alone — a real branch is stronger evidence someone's already on it than an unclaimed owner field.
- Move the task's line to `In Progress`, set `owner`, bump `updated` to today. That edit *is* the claim.

### 2. Check the local checkout isn't mid-operation

Multiple tools — Claude Code, Cursor, Antigravity — can be pointed at the same on-disk clone of a repo, not isolated sandboxes each. Before doing anything else:
```bash
git status
```
Confirm the tree is clean and not mid-merge/mid-rebase (no `MERGE_HEAD`, no `.git/rebase-merge`). If it's dirty in a way you didn't cause, **stop and investigate before branching on top of it** — it may be another session's live work, or the aftermath of a prior interrupted operation.

### 3. Fetch and determine the branch origin

```bash
git fetch origin
git log --oneline -1 origin/{INTEGRATION_BRANCH}
```
- **Default:** the new branch cuts from `origin/{INTEGRATION_BRANCH}`'s current tip — never from a possibly-stale local copy, and never commit directly onto the local integration branch itself.
- **If the task has a `depends_on: {parent-id}` field:** branch from that parent task's branch tip instead of `{INTEGRATION_BRANCH}`. Your eventual PR targets the parent's branch until the parent merges — only then rebase onto `{INTEGRATION_BRANCH}` and retarget the PR base. Confirm the parent's branch actually exists and is current (fetch it) before branching from it.
- **If the task has a `blocks_on: {repo}#{id}` field:** that's a different repo's coordination gate, not something you branch from at all. Just don't merge your own PR until you've confirmed the named repo's work has merged *and deployed* — check a real deploy log or staging URL, not just the merge event.

### 4. Collision check — the actual anti-overlap step

Before running `git checkout -b`, `cams_query` which tasks are `In Progress` in this project and what files they touch. Then `Read` only those task lines if you need the exact text:
- **Different files** → proceed, branch independently, no dependency needed, merge order doesn't matter.
- **Same file or surface, no declared order** → do not proceed with two independent branches racing to reconcile later. Either add a `depends_on` if there's a natural build order, or stop and ask the user which goes first. Silently branching anyway and hoping the merge resolves itself is exactly the failure mode this check exists to prevent.

### 5. Migration-number check, if this task adds one

If this project uses sequentially-numbered migration files (Prisma, Rails, Django, Supabase, etc.), two branches built in parallel can independently grab the same next number since neither can see the other's uncommitted file. Before adding a migration:
- Check the highest number present on `origin/{INTEGRATION_BRANCH}`'s current tip.
- Grep open PRs for pending migration files (`gh pr list` + inspect diffs) to catch one that hasn't merged yet.
- If a collision surfaces later at merge/rebase time, renumber — never force-merge two migrations sharing a number.

### 6. Decide whether this needs a new branch at all

Per `docs/BRANCHING.md` → Branch granularity: if this task is a sequential subtask of the same initiative you (this agent, this session) just branched for — same repo, no other agent's work interleaved since, no independent-timeline reason to split — continue on that open branch/PR instead of stacking a new one. Otherwise, or if unsure, branch fresh; the default is still one task = one branch, bundling is the judgment call, not the baseline.

If continuing on the existing branch, skip to step 7. Otherwise, create the branch and tag it — do this even if the task looks like "just investigation":

```bash
git checkout -b feat/<task-slug>
```
Tag the task's `tasks.md` line with `branch: <name>` — and, if it's sprint work, carry over the `sprint: <slug>` tag from `sprint.md` too (both files should show the same tags for the same task). Keep the branch name short — dependency lineage lives in the `depends_on`/`blocks_on` field, not encoded into the branch name.

**Run this step as part of kickoff, before any investigation starts — don't defer it until you're sure you'll need to write code.** A task doesn't announce the moment it stops being "read-only" — diagnosis can turn into "let me try a fix" mid-flow, and by then the moment to branch has often already quietly passed. You don't know in advance whether a log-reading task will turn into a code change, so the only reliable fix is to never be sitting on `{INTEGRATION_BRANCH}` in the first place. If a task genuinely turns out to need no code, the unused branch is free to abandon — that's a far cheaper failure mode than an edit landing directly on the integration branch.

### 7. Build on the branch — never on local {INTEGRATION_BRANCH}/main

Commit as you go. If you pause mid-task, update the `tasks.md` line in place (don't leave it looking further along than it is) and write the actual narrative in the session log before switching away — the next session (possibly a different tool) needs to pick up from accurate state, not guess it.

## What this skill doesn't cover

- Scoping the sprint/initiative this task belongs to → use `sprint-planning`.
- Actually writing the implementation, reviewing it, or verifying it works → use normal implementation/review practice once code exists.
- Merging the finished branch, deploying, or cleaning up → use `sprint-close` if it's part of a sprint, or the normal `docs/BRANCHING.md` flow if it's a standalone task.
