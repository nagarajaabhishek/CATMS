---
name: pr-checks-loop
description: Get every required CI check on a {PROJECT_NAME} PR to a real, verified-green state before it's merged — diagnoses failures from the actual job log (never guesses from pass/fail alone), fixes root causes, and loops until green or until a failure genuinely can't be closed in a quick iteration. Use this before merging ANY PR in this project — as the mandatory gate inside sprint-close before each task-branch merge and the final release PR, and equally for standalone merge decisions outside any sprint (dependabot PRs, branch-cleanup, a one-off fix). Also use when a PR's checks are currently failing or stuck pending and someone needs them resolved, not just reported.
---

# PR checks loop ({PROJECT_NAME})

No PR merges here — sprint-related or not — while a required check is red or unexplained. This skill is the loop that gets it green for real, by root-causing from the actual log — never by re-running blindly and hoping, never by excluding the failing thing.

## Step 1 — Get the real status, not a cached one

```bash
gh pr checks <pr-number>
```

If anything is failing, stale, or pending: pull the actual job log, not just the pass/fail summary — `gh run view <run-id> --log` (or `gh api` for the specific job). A status from before the PR's last push, or from before the integration branch moved, isn't trustworthy — re-run it (`gh run rerun <run-id>`) before diagnosing anything, per `docs/BRANCHING.md`'s branch-maintenance edge cases (local/GitHub state drifts silently). A "failure" from days ago may already be fixed by something else that landed since.

## Step 2 — Classify before touching anything

Not every red check needs a code fix, and not every green check needs no attention. Work out which of these it actually is:

- **Infra/transient** (rate limit, billing block, a runner hiccup, a flaky external service) — confirm by re-running and watching it pass on its own. If it does, that's the fix — note it as "confirmed transient," don't go looking for a code change that isn't needed.
- **A real bug in this PR's own diff** — root-cause it from the actual log, fix it, push, go back to Step 1.
- **A pre-existing failure the pipeline hits regardless of this PR** — check whether the same job fails identically against the integration branch's current tip before assuming it's this PR's fault. It usually still needs fixing to unblock the merge (a required check doesn't care whose fault it is), but say so explicitly — "fixed an unrelated pre-existing CI bug to unblock this PR" — so it doesn't read as unscoped surprise work.
- **A genuine breaking change needing real migration work** (a major dependency bump, a schema change with no clean fast-forward) — this is not a quick-loop fix. Stop looping on it. Report it and turn it into its own tracked `tasks.md`/sprint task instead of forcing an ad hoc patch under merge pressure.

## Step 3 — Fix root cause, never bypass

- No `--no-verify`, no excluding the failing test/file just to turn the check green, no force-skipping a step.
- No `--admin` merge past a red or pending required check without the user's explicit go-ahead — and if they do give it, say plainly that a bypass is happening and why, don't let it pass quietly. Declining an offered bypass is the default, not the exception.
- Push the fix, then go back to Step 1 and re-verify from a fresh run — don't assume a fix worked without seeing the actual green result.

## Step 4 — Know when to stop looping

If the same check fails 2-3 times across genuinely distinct fix attempts without converging, stop iterating blindly — that usually means the true root cause hasn't been found yet, or this was actually a Step-2 "real migration" case misclassified as a quick fix. Escalate to the user with what's been tried and what's still failing, rather than continuing to guess.

## The gate this produces

A PR is only "ready to merge" once every required check is genuinely green by this process — that's the precondition `sprint-close` checks before proposing or executing any merge (per-task branches and the final release PR alike), and the same bar applies to any standalone PR merge in this project, sprint or not.

## What this skill doesn't cover

- Deciding *whether* the PR's actual code change is correct — that's code review, not this.
- The merge/branch-deletion choreography itself once checks are green — that's `sprint-close` (for sprint work) or the normal `docs/BRANCHING.md` flow.
