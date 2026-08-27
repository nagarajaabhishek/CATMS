# Branch discipline — {PROJECT_NAME} (single-stage: `main`)

Referenced from `AGENTS.md` → **Branch discipline**, and applied automatically by the `task-kickoff` skill in Claude Code. Read this doc directly if you want the steps without waiting for the skill, or if you're using a tool that doesn't have it.

All work follows: `feature/*` branches cut from `origin/main` → PR into `main`. Never commit directly to `main`.

## Standard lifecycle

```bash
# 1. Branch from updated origin/main
git fetch origin && git checkout main && git pull origin main
git checkout -b feat/{id}-short-description

# 2. Build + commit
git add <files>
git commit -m "feat: short description ({id})"

# 3. Push, open a PR into main
git push -u origin feat/{id}-short-description
# Open PR → main on GitHub. Never bypass branch protection.

# 4. Squash merge after review/CI, delete the branch
```

## Branch naming

| Prefix | Use for | Example |
|--------|---------|---------|
| `feat/` | New feature | `feat/APP-42-auth-flow` |
| `fix/` | Bug fix | `fix/APP-51-secret-rotation` |
| `chore/` | Tooling, deps | `chore/update-requirements` |
| `docs/` | Docs only | `docs/api-guide` |
| `park/` | Shelved/parked work | `park/apiV2-explore` |

Tie the branch name to the `tasks.md` task id. `park/` branches are for work deliberately set aside — time-box them, and revisit to either land or delete rather than letting them sit for months.

## Strict branch hygiene and tracking

- Any `In Progress` task in `tasks.md` MUST include a `branch: <name>` tag.
- A branch merged via a normal reviewed PR gets its local + remote copies deleted immediately after merge — that's the only path a branch should disappear through.
- **No agent (regardless of which tool) merges branches into `main` or deletes branches autonomously — always propose via PR or ask first.** Concurrent-branch, multi-tool workspaces have a real failure mode here: an unsupervised "clean up" or "recover unmerged work" pass can silently collide branches or mass-delete work nobody reviewed. Every merge is a proposed PR; every deletion happens only after a user-approved merge.

Never force-push or reset `main` unless explicitly asked. Never commit `.env` files or API keys.

## Branch origin & dependency rules

Written because concurrent work on different features can cause branches to overlap or collide with no declared order — this is the enforcement mechanism, not just a description of what to avoid.

**Default origin:** every task branch cuts from the current tip of `origin/main` — `git fetch origin` first, then verify with `git log --oneline -1 origin/main` that the branch point matches, not a stale local `main`. This is the only allowed base unless a dependency is declared below.

**Declaring a dependency:** only when a task literally cannot be built/compiled without another task's *unmerged* code — not "related to," not "same feature area," a real file/import dependency.
- Add `depends_on: {parent-id}` to the task's line in `tasks.md` (and `sprint.md` if it's sprint work), alongside `branch:` and, for sprint tasks, `sprint:`.
- The child branch is cut from the **parent branch's tip**, not from `main`. The branch name itself doesn't need to encode the lineage — `depends_on` in `tasks.md` is the source of truth.
- **Merge order follows the dependency, not convention alone:** the child's PR targets the parent branch until the parent merges into `main`. Only after the parent lands does the child rebase onto `main` and retarget its PR base. A child's PR must never merge into `main` while its declared parent is still unmerged.

**Collision check before branching (the actual anti-overlap rule):** before cutting any new branch, `cams_query` which tasks are `In Progress` in this project and what they touch. Then `Read` only those specific task lines (not the whole tracker) if you need the exact text.
- Different files → branch independently from `main`, no dependency needed, merge in either order.
- Same file/surface, no declared order → don't let both branch independently and race to reconcile later. Either sequence them with `depends_on`, or stop and ask which goes first. Silently proceeding and hoping the merge resolves itself is exactly the failure mode this check exists to prevent.

**Cross-repo dependencies need a different field.** `depends_on` is same-repo branch lineage. When a task depends on a *different repo's* unmerged work or deploy, use `blocks_on: {repo}#{id-or-PR}` instead. It's a coordination gate, not something you branch from — don't merge the gated task's PR until the named repo's PR has actually merged *and*, if relevant, actually deployed (merged ≠ live — verify with a real deploy check, not the merge event alone).

**Don't over-chain.** Most tasks are independent of each other — default to branching each from `main` with no dependency. Only add `depends_on` when a task genuinely can't exist without a sibling's code yet. Chaining every task in a sprint into one dependency line is just a slower version of "one branch per sprint," which this doc already rejects (see `docs/SPRINT-WORKFLOW.md` — one feature branch per task, not one per sprint).

## Migration-number collisions

If this project uses sequentially-numbered migration files (Prisma, Rails, Django, Supabase, etc.), two branches built in parallel can independently grab the same next number since neither can see the other's uncommitted file. Before adding a new migration:
- Check the highest number present on `origin/main`'s current tip.
- Grep open PRs for pending migration files to catch one that hasn't merged yet.
- If a collision surfaces at merge/rebase time, renumber — never force-merge two migrations sharing a number.

## Secrets

Agents don't read raw `.env`/credential files directly (`Read`/`cat` on them is off-limits by convention, same as committing them) — if this project uses a secret manager, prefer its scoped run/inject command (`<tool> run -- <cmd>` pattern) so values reach a child process without ever landing in agent context. Doppler, 1Password CLI (`op run`), and Vault all fit this pattern — CATMS doesn't mandate one, pick whatever this project already uses. Production credentials should stay off the local dev machine wherever the workflow allows it.

## Branch maintenance — edge cases

**Local ↔ GitHub state can silently diverge — always verify both, not just one:**
- `git fetch origin` before branching, merging, or judging a branch stale — never reason from local refs alone; a local `main` can be behind `origin/main` without any error telling you so.
- Before treating any branch as "safe to build on," check **both** places — a branch can exist locally and not on GitHub (unpushed WIP) or on GitHub and not locally (nobody's pulled it yet): `git branch -a` + `gh pr list --head <branch>`.
- A local branch whose `git branch -vv` upstream shows `gone` means the remote copy was deleted — usually already merged, sometimes deliberately abandoned. Check why first: `gh pr list --head <branch> --state all`.
- Never force-push a shared branch (`main`, or any branch a `depends_on` child was cut from) without explicit confirmation — it invalidates every other clone's tracking ref and silently orphans anything built on top of it.

**Concurrent sessions of the *same* tool aren't disambiguated by the `owner` tag alone.** Before claiming a Backlog task, also check for an existing branch/PR for that id (`git branch -a | grep <id>`, `gh pr list --head <slug>`) — a real branch is a more reliable "someone's already on this" signal than `owner: —` alone, especially across same-tool concurrent sessions.

**Multiple tools share the same on-disk checkout, not isolated sandboxes.** Claude Code, Cursor, and Antigravity can all be operating on the same local clone. Before branching, run `git status` and confirm the tree is clean and not mid-operation (no `MERGE_HEAD`, no `.git/rebase-merge`) — if it's dirty in a way you didn't cause, stop and investigate rather than branching on top of unknown state.

## Optional: branch protection on GitHub

Settings → Branches → Branch protection rules for `main`:
- Require pull request before merging
- Require status checks to pass
- Restrict direct pushes
