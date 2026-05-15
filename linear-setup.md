# Linear Setup Guide for CATMS

## Step 1 — Create your team

1. Go to linear.app → Create workspace
2. Name your team (e.g. "My Team")
3. Note the team ID (visible in API settings)

## Step 2 — Set up workflow states

In **Settings → Team → Workflow → Issue statuses**, add these states:

| State | Type | Use for |
|-------|------|---------|
| `Backlog` | Backlog | Ideas, not started |
| `Design & Docs` | Unstarted | Writing specs/ADRs before coding |
| `In Development` | Started | Active coding |
| `Testing & QA` | Started | Verification, bug fixes |
| `In Review` | Started | Code review |
| `Ready to Deploy` | Started | Approved, waiting to ship |
| `Deployed` | Completed | Shipped ✅ |
| `Blocked` | Started | Stuck, needs input 🔴 |
| `Ongoing` | Unstarted | Standing/long-lived reference issues |
| `Cancelled` | Cancelled | Won't do |

## Step 3 — Create labels

In **Settings → Team → Labels**:

| Label | Colour | Use for |
|-------|--------|---------|
| `Feature` | Purple | New functionality |
| `Bug` | Red | Bug fixes |
| `Improvement` | Blue | Enhancements |

## Step 4 — Create one project per repo

For each codebase/repo in your project:

1. Linear → Projects → New Project
2. Name it after the repo (e.g. `my-app-backend`, `my-app-mobile`)
3. Add to the team

## Step 5 — Issue naming convention

All issues use prefix: `[P1][You]` or `[P1][Agent]`

- `P1` / `P2` / `P3` / `P4` = phase priority (P1 = must-do now)
- `[You]` = human action required (dashboard, SSH, device testing)
- `[Agent]` = Cursor or Claude Code handles it in the repo

**Examples:**
- `[P1][You] Add GitHub secrets to CI repo`
- `[P1][Agent] Remove legacy AWS references`
- `[P2][You] Smoke test after first deploy`

## Step 6 — Sub-issues for large features

For features with 3+ tasks:
1. Create a **parent issue** (the feature name)
2. Create **child issues** for each task (link to parent)
3. Mirror in Obsidian `tasks.md`

## Step 7 — MCP setup (optional but recommended)

Connect Linear MCP to Claude Code and Cursor so agents can read and update issues without leaving the editor.

- Claude Code: `claude mcp add -s user linear-mcp`
- Cursor: add to MCP settings with your Linear API token

## Team ID

After setup, note your team ID (Settings → API → Team) and add it to `setup.sh` or your `CLAUDE.md`.
