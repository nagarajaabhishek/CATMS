---
name: pre-pr-review
description: Mandatory review-and-fix loop to run before opening ANY pull request in {PROJECT_NAME} (feature, docs, hotfix, release). Runs an exhaustive code review at the right effort level plus the project's own checklist (docs/PR-REVIEW-CHECKLIST.md), fixes every confirmed or plausible finding at its root cause in one round on the same PR, and re-reviews only when a fix touched risky code. Use it right before `gh pr create`, whenever a PR is about to be opened or marked ready, and after any fix that lands on a PR during review.
---

# Pre-PR review loop ({PROJECT_NAME})

No PR is opened until this loop has run. It sits **before** `pr-checks-loop`: CI proves the code builds and the tests pass; this proves it behaves. A green CI run says nothing about a server route that trusts a client-side guard, or a state field one writer forgot to reset — those pass every automated check and are exactly what a review exists to catch.

## Step 1 — Scope the diff
- Feature/fix/docs PR: `git diff <integration-branch>...HEAD`.
- Release PR (integration branch → `main`): `git diff main...<integration-branch>`. Count the commits and migrations first; if the release is too big to review properly in one pass (dozens of commits, several migrations), propose slicing it into smaller releases to the user before reviewing.

## Step 2 — Run the review at the right level
Use the `code-review` skill when your tool has it (multiple finder angles plus a verify pass). Without it, review the diff yourself from at least four angles — line-by-line correctness, removed behavior, callers of every changed function, and language/framework pitfalls — and write each finding with a concrete failure scenario.

| The PR touches | Level |
|---|---|
| Docs / markdown only | `medium` — no code to bug-hunt; still check accuracy, and that no secret or value is written |
| Ordinary code | `high` |
| Anything listed under **Max-level triggers** in `docs/PR-REVIEW-CHECKLIST.md`, or any release PR | `max` |

Prefer recall over precision: a plausible finding that turns out wrong costs a minute, a missed bug ships. Do not use a review tool's precision-tuned defaults (compile errors and definite logic errors only, confidence cut-offs) for this gate.

## Step 3 — Run the project checklist on the same diff
Open `docs/PR-REVIEW-CHECKLIST.md` and answer every item against the diff — each generic item and each project-specific item. Every "no" or "unsure" is a finding. If the file is missing, run `catms update` to create it. Items are added to that file whenever a review or an incident finds a class of bug the checklist did not cover — that is how this step gets better over time.

## Step 4 — Fix loop (one round, one PR)
1. **Fix on the PR's own branch.** Findings on an open PR are fixed as more commits on that branch — never in a new PR. When the review was of code already merged, or of a release PR, collect **all** findings from the round and fix them in **one** consolidated PR, not one PR per finding or per round.
2. **Severity decides what happens.** Confirmed correctness, security or data findings, and anything failing the checklist, are fixed now. Plausible-low and cosmetic findings are batched into the same round or become one `tasks.md` line; they never start another review round on their own.
3. **Re-review only when needed:** if a fix touched a max-level trigger area or resolved a high-severity finding, re-run Steps 2–3 on the fix diff once. Otherwise stop after the one fix round. **Cap: 2 rounds total**, then escalate to the user with what was tried.
4. Every finding ends with an outcome: `fixed`, `no_change_needed` (say why it is wrong), or `skipped` (real but deferred — it must become a `tasks.md` line and be named in the PR body).

## Step 5 — Record it in the PR
The PR body gets a **Review** section: level used, number of rounds, findings fixed/skipped (with task ids for skipped), and whether the checklist was run. A PR without it is not ready for `pr-checks-loop`.

## What this doesn't replace
- The human approving review your branch protection requires.
- `pr-checks-loop` (CI green) and `sprint-close` (merge choreography).
- Judgment: a clean pass means the reviewers found nothing, not that nothing is wrong.
