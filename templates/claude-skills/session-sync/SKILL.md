---
name: session-sync
description: Run the "Every Session — End" checklist from AGENTS.md before wrapping up — update tasks.md to reflect exactly what happened, write the session log, prepend log.md, record any real decision in decision.md, then cams_ingest and cams_backfill so the next session (possibly a different tool) inherits accurate state instead of guessing it. Use this whenever the user says something like "wrap up," "that's it for now," "let's stop here," "done for today," "end the session," or when a natural stopping point is reached and no further work is planned this session — proactively, not only when explicitly asked, since this is the single most-repeated step in the whole system and the easiest one to skip under time pressure.
---

# Session sync ({PROJECT_NAME})

This is the checklist version of `AGENTS.md`'s **Every Session — End** section — the highest-frequency step in the whole CATMS workflow, since it runs at the close of *every* session, not just at sprint boundaries like `sprint-close`. It's also the easiest one to skip: nothing forces it the way `task-kickoff`'s collision check or `sprint-planning`'s WIP-limit check forces those. Skipping it is the specific failure mode that quietly degrades everything else — CAMS is only as good as what actually gets written to the trackers, and a session that ends without this leaves the next one (possibly a different tool, possibly a different day) reconstructing state from scratch instead of reading it.

**The same conservatism rule as `project-adoption` applies in reverse here: don't pad, and don't overstate.** A `tasks.md` line that says `In Progress` when the work is actually done, or `Done` when it's actually half-finished, is worse than an honest `Blocked` or a shorter session log — the next session trusts these files at face value.

## Steps

### 1. Take stock of what actually happened this session

Before writing anything, work out concretely: which `tasks.md` lines were touched (claimed, progressed, finished, blocked)? Was a branch created (per `task-kickoff`)? Was any real decision made or reversed? Was a bug found? Don't reconstruct this from memory alone if the session was long — scan back through what was actually done, not what was discussed or considered.

### 2. Update `tasks.md` to reflect real state

For every task touched this session:
- Still in progress → confirm `owner`, `updated`, and `branch:` are current. Don't leave it looking further along than it is if you're pausing mid-task.
- Finished → checkbox it `[x]` and move it to `Done`.
- Newly blocked → move to `Blocked` with a specific, one-line reason (what's blocking it, who unblocks it) — not a vague "stuck."
- A bug found but not fixed this session → add it to Backlog now, don't rely on remembering to do it later.

### 3. Write the session log

`sessions/YYYY-MM-DD.md` (or `sessions/YYYY-MM-DD-{tool}.md` if more than one tool worked today — see `CURSOR.md` for the Cursor suffix convention). This is the one place a fuller, narrative account belongs, since `tasks.md`/`decision.md` stay terse by design:
- What was actually done and why — not a restatement of the task description, the actual outcome.
- Anything unresolved or explicitly deferred, so the next session doesn't have to guess whether it was forgotten or deliberately set aside.
- Anything the next session specifically needs to know before continuing — a gotcha hit, a dead end tried, a follow-up question for the user.

### 4. Prepend one line to `log.md`

One line, newest at the top, pointing at the session log from step 3. This is what makes lazy context loading work — the next session reads this one line before deciding whether it needs anything else.

### 5. Record any real decision in `decision.md`

If a settled call was made this session that another agent would otherwise re-litigate (a tooling choice, a "we tried X and it doesn't work," a reversal of an earlier decision) — write it now as a `D-YYYYMMDD-slug` entry, even if it feels like the session conversation already covered it well enough. If it isn't written here, it doesn't exist for the next session or the other tool. If a decision was reversed, update the existing entry's `**Status:**` to `reversed` and add `**Superseded by:**` rather than leaving both versions standing.

### 6. `cams_ingest` anything not already covered by the trackers themselves

`tasks.md`/`sprint.md`/`decision.md`/`log.md`/the session log all get swept by the backfill in step 7 regardless — but a standalone fact or finding worth recalling on its own (not naturally anchored to one tracker line) should get an explicit `cams_ingest` call now, at the moment it's fresh, not deferred.

### 7. `cams_backfill`

Run it last, after steps 2-6 have actually been written to disk — this is what makes everything above queryable by the next session's `cams_query` calls. Don't skip it even if step 6 felt like enough; `cams_backfill` is what picks up the `tasks.md`/`decision.md`/`log.md` edits themselves, not just anything explicitly ingested.

## What this skill doesn't cover

- Sprint-level wrap-up (merging branches, release PRs, archiving a finished sprint) → `sprint-close`.
- Deciding whether to keep working or stop — that's the user's call; this skill runs once the decision to stop has already been made.
- Starting new work → `task-kickoff`.
