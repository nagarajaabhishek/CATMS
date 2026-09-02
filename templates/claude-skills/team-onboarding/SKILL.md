---
name: team-onboarding
description: Onboard a new developer joining a CATMS project — verifying repo access, secrets manager access, setting up local Ollama + CAMS, installing git hooks, claiming their first task, and reading the branch discipline. Use this when welcoming a new teammate, whether they're a fellow AI agent like @claude or a real human developer. Triggers on "onboard", "new developer", "welcome to the team", "set up your environment", or similar.
---

# Team onboarding ({PROJECT_NAME})

New developer joining {PROJECT_NAME}? Use this skill to verify access, set up local tooling, install git hooks, and confirm they're ready to start claiming tasks.

**Important:** Steps 1–4 are human-only actions — the new developer (or their manager) must execute these; no agent can do them. Step 5 onward is the local environment setup and first-task claiming that this skill can walk through.

## Steps

### 1. Grant repository and service access — Human action required

Before the developer can push code or read secrets, they need access to:

- **GitHub:** Write access to all repos in this workspace (or at minimum, the coordination repo if this is a multi-repo workspace)
- **Secrets manager (Doppler / 1Password / Vault / similar):** Read at minimum, write if they'll manage secrets themselves. Same project scope.
- **Deploy targets (Vercel, Cloud Run, GCP, etc.):** As appropriate for their role. Staging environment minimum, production after proven.

This is a manual, one-time action — no agent can grant GitHub org/team membership or access secrets manager tokens.

**Confirm with the developer (or their manager / team lead):** "Does {name} have write access to all repos in this workspace and read access to the secrets manager?"

If yes, proceed. If no, **stop here** and wait for access to be granted before continuing.

### 2. Clone the coordination repository locally — Developer does this

The coordination repo holds the shared tracking and tooling this workspace runs on (tasks.md, sprint.md, decision.md, docs/, .claude/skills/, tools/cams/).

For a **single-repo workspace**, this is the project's own repo:
```bash
git clone <project-repo-url>
cd {PROJECT_NAME}
```

For a **multi-repo workspace**, this is a dedicated coordination repo (not the individual feature repos):
```bash
git clone <coordination-repo-url>
cd {WORKSPACE_NAME}
```

**After cloning:** they will have a clean checkout of the main integration branch ({INTEGRATION_BRANCH}). Verify:
```bash
git branch
# Should show: * {INTEGRATION_BRANCH}
```

### 3. Install Ollama and pull the embedding model (if CAMS uses local embeddings)

Check `.catms.json`'s `cams_provider` field. If it's `ollama`:

- Download and install Ollama from https://ollama.ai/download
- Pull the embedding model (one-time, takes ~1-2 minutes):
  ```bash
  ollama pull mxbai-embed-large
  ```
- Start Ollama (runs as a local service; usually auto-starts):
  ```bash
  ollama serve
  ```

If `cams_provider` is `openai` or `voyage`, skip this step — the API keys are configured in `tools/cams/.env`.

### 4. Install CAMS dependencies and run backfill

```bash
cd tools/cams
npm install
npm run backfill
```

This seeds the local semantic memory with all project history (session logs, tasks.md, decision.md, docs/). First backfill takes 1–2 minutes; after that, it's a few seconds.

### 5. Install the post-merge git hook (critical — NOT cloned automatically)

Git hooks are NOT included when you clone a repository. The post-merge hook runs CAMS backfill automatically whenever pulling new changes, keeping two developers' local CAMS instances in sync via git pull cadence (typically a few minutes apart).

```bash
cp tools/cams/hooks/post-merge .git/hooks/
chmod +x .git/hooks/post-merge
```

Verify:
```bash
ls -la .git/hooks/post-merge
# Should show: -rwxr-xr-x
```

**If this isn't done:** pulling changes from teammates won't automatically re-index the project memory, and CAMS queries will be stale relative to the git state.

### 6. [Optional] Set up continuous pull for near-live freshness

By default, memory freshness is bounded by how often developers `git pull`. For more aggressive freshness (memory reflects git state within a few minutes, not just at pull time), a developer can run the watch-sync script in a spare terminal/tmux pane:

```bash
./tools/cams/watch-sync.sh
```

This runs `git pull --quiet` every 5 minutes in the background. It's optional and can be stopped any time (`Ctrl+C`).

### 7. Confirm their claim tag in .catms.json

Every agent/developer on the team has a unique `claim_tag` — used when claiming tasks in `tasks.md`. Read the project's `.catms.json` and find this developer's entry in the `team` array:

```json
{
  "team": [
    {
      "name": "You",
      "github_user": "your-github-handle",
      "claim_tag": "@you-or-your-tag"
    }
  ]
}
```

**Confirm with the developer:** "Your claim tag is `{claim_tag}`. When you claim a task, set `owner:` to this tag."

### 8. Read the branch discipline and sprint workflow

Two critical docs:

- **`docs/BRANCHING.md`** — Branch naming, lifecycle, collision checks, dependency rules, edge cases. This project uses {BRANCH_STRATEGY} (feature branches into `{INTEGRATION_BRANCH}`). Read the full doc once; then refer back to it whenever about to branch.
- **`docs/SPRINT-WORKFLOW.md`** — How sprints work, the single-active-sprint WIP limit, sprint ordering, merge strategy. Only if this project uses sprints (check `sprint.md`).

### 9. Start your first task using task-kickoff

In Claude Code, when the developer (if they're an agent like @claude) is ready to pick up their first task:

```
/task-kickoff
```

This skill will walk through:
- Claiming the task (setting owner, updating updated date)
- Collision checks (what else is in flight that might conflict)
- Branch origin rules (main vs. a depends_on parent)
- Migration-number checks
- Creating the branch

For a human developer, they can do these steps manually following `docs/BRANCHING.md`, or ask Claude Code in their session to run `task-kickoff` if they're working in Claude Code's chat.

## What this skill doesn't cover

- Setting up GitHub org/repo access — that's a human, one-time action for admins
- Secrets manager enrollment — same, usually handled by ops/security
- Managing who has write access to which repos / which deploy environments — organizational / access-control policy, not this workflow's scope
- Actual onboarding for a specific codebase (tech stack, architecture, conventions) — covered in your project's own onboarding docs, not a CATMS-universal skill
