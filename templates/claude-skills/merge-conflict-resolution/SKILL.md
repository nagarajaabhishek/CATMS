---
name: merge-conflict-resolution
description: Merge method and merge-conflict SOP for {PROJECT_NAME}. Never squash-merge; merge commits only. Use whenever a PR is about to be merged, or shows CONFLICTING/DIRTY/BEHIND, or a merge/rebase hits conflicts. Coordinates with the other side's session or starts a conflict session, resolves first, proves nothing was dropped, then merges.
---

# Merge method and conflict resolution ({PROJECT_NAME})

**Never squash-merge.** Merge commits only (`gh pr merge <n> --merge`). `--rebase` only if GitHub accepts it and the branch has no merge commits. A squash collapses the branch into one commit, loses history for `blame`/`bisect`, and silently drops other sessions' work when the branch was cut from stale code.

**A PR with a merge conflict (`CONFLICTING`/`DIRTY`/`BEHIND`) is never merged through.** Resolve first, merge second:

1. **Stop.** Do not squash it away, force-push, or resolve blind from the merging session.
2. **Find the other side:** which recent merge touched the same files (`gh pr list --state merged -L 10`, `git log origin/<base>..`), and which session owns that task (tracker claim tag, `ListAgents`, `cams_query`).
3. **Talk before resolving.** If that session is live, message it (`SendMessage`): files in conflict, your hunks, ask its intent. If not live, or the merging session lacks context, **start a dedicated conflict session** on the PR branch in its own worktree. Brief it with: PR link, base branch, conflicting files, both tasks' intent, "merge the base into the branch, keep both sides' intent, drop neither, push, report".
4. **Resolve by merging the base into the feature branch** (`git fetch && git merge origin/<base>`). Never rebase a shared branch, never take `--ours`/`--theirs` wholesale. Renumber conflicting migrations; never share a number.
5. **Prove nothing was lost:** `git diff origin/<base>...HEAD --stat`, then per-file diffs against `origin/<base>`; confirm every hunk from the base's recent merges is still present. Re-run tests/typecheck. Record in the PR body: files, who resolved, how both sides were kept.
6. Re-run `pre-pr-review` if the resolution touched auth, data, deletes or migrations; then `pr-checks-loop` to a real green on the new head.
7. **Only then merge with a merge commit**, with the human's approval as usual.
8. If intents contradict or the conflict is large, stop and ask which side wins; log the call in `decision.md`.
