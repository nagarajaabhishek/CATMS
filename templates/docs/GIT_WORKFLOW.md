# Git Workflow — {PROJECT_NAME}

## Principles

- **`main` is release-shaped** — it should always be in a deployable state
- **One Linear issue = one branch** — parallel features stay isolated
- **PRs to `main`** — review, CI, and history stay clean

## Branch naming

| Prefix | Use for | Example |
|--------|---------|---------|
| `feat/` | New feature | `feat/LOG-42-auth-flow` |
| `fix/` | Bug fix | `fix/LOG-51-secret-rotation` |
| `chore/` | Tooling, deps | `chore/update-requirements` |
| `docs/` | Docs only | `docs/api-guide` |

Tie branch name to Linear issue: `feat/LOG-XX-short-description`

## Standard lifecycle

```bash
# 1. Sync
git fetch origin && git checkout main && git pull origin main

# 2. Branch
git checkout -b feat/LOG-XX-short-description

# 3. Work + commit
git add <files>
git commit -m "feat: short description (LOG-XX)"

# 4. Push
git push -u origin feat/LOG-XX-short-description

# 5. Open PR on GitHub → main
# 6. Squash merge after review/CI
# 7. Delete remote branch
```

## Parallel work

- Check out `main`, pull, then branch **per** independent task
- Never combine unrelated areas (e.g. backend + mobile + infra) in one PR
- If you must combine, explain why in the PR description

## Red lines

- No `git push --force` to `main` without explicit human instruction
- No `.env` files, API keys, or secrets committed
- No machine-local IDE state (e.g. Xcode xcuserdata)

## Optional: branch protection on GitHub

Settings → Branches → Branch protection rules for `main`:
- Require pull request before merging
- Require status checks to pass
- Restrict direct pushes
