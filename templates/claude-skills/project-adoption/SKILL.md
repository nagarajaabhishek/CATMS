---
name: project-adoption
description: Seed tasks.md/decision.md/log.md with real context from an existing codebase, the first time CATMS is set up on a project that already has commits — reads git history, README, stack files, and directory structure to write an honest first snapshot instead of leaving the trackers empty. Use this once, right after catms init, whenever tasks.md/decision.md/log.md are still at their template-stub content but the repo has real commit history, or whenever the user says something like "catch CATMS up on this project," "seed context from the existing code," or "this isn't a fresh project." Do not use it on a genuinely greenfield repo with no prior history — there's nothing to adopt.
---

# Project adoption ({PROJECT_NAME})

`catms init` scaffolds empty trackers regardless of whether the project has 2 days or 2 years of history behind it — it's a plain Node script with no model access, so it can't read and summarize a codebase itself. This skill is that missing first pass, run once by an agent that *can* reason about the code, so `cams_query` has something real to say from session one instead of nothing.

**The one rule that matters more than anything else in this skill: be conservative.** A wrong or overconfident first snapshot is worse than an honestly empty tracker — every session after this one inherits what gets written here. Write only what's actually evidenced by the repo. Mark inferences as inferences. Never invent a roadmap, grade code quality, or assert team intent that isn't visible in the commits/docs themselves.

## When to run this

Check before doing anything else: `tasks.md`'s repo sections, `decision.md`'s Process section, and `log.md` should all still be their unedited `catms init` template content (obvious tells: `decision.md` still has only the `D-{date}-example` placeholder entry, `tasks.md`'s sections still say `{repo-or-area-name}`/`{id}`). If any of them already have real entries, this project has already been adopted or was set up fresh and worked on since — stop and ask before overwriting anything, don't assume it's safe to run again.

Then confirm there's actually something to adopt: `git log --oneline | wc -l` on the target repo (or each repo, if multi-repo). A handful of commits or fewer is closer to greenfield than an existing project — use judgment, but don't manufacture an adoption narrative for a repo that's barely started.

## Steps

### 1. Read real signal — bounded, not exhaustive

Don't read every file. Gather:
- `git log --oneline -30` (or per-repo, for a multi-repo workspace) — recent work, cadence, contributor names/handles if visible.
- `git log --reverse --oneline | head -5` — how the project actually started, often more informative than assuming from the current state.
- `README.md` (or each repo's) — stated purpose, setup instructions.
- Stack signal: `package.json`/`pyproject.toml`/`Cargo.toml`/`go.mod`/etc. — real dependencies, not guessed ones.
- Top-level directory structure (one level, maybe two) — where the actual code lives, test setup, existing docs folders.
- Any existing `CHANGELOG.md`, `ARCHITECTURE.md`, or design docs already in the repo — these are gold if present, read them before inferring anything from code alone.
- `git log --oneline | grep -iE "TODO|FIXME|WIP|revert|rollback" ` and a `Grep` for `TODO`/`FIXME` comments in source — real, findable unfinished work, not speculation.

If this is a multi-repo workspace (`.catms.json`'s `repos` field is non-empty), do this per repo, but keep each pass proportionate — don't let a 10-repo workspace turn into reading every README twice.

### 2. Write the first `decision.md` entry — describe, don't judge

One entry, dated today, explicitly framed as a first-pass snapshot:

```
### D-{today}-project-adoption
**Status:** current
**Decided:** {today}
**By:** @claude (or whichever agent ran this)
**Decision:** Adopted CATMS on an existing codebase — first-pass snapshot from git history and repo inspection, not exhaustively verified.
**Why:** [stack, structure, and notable existing conventions actually observed — e.g. "Next.js + Prisma + Postgres, monorepo with apps/ and packages/, tests under __tests__ colocated with source, CI via GitHub Actions (.github/workflows/ci.yml)"]
**Refs:** —
```

If something is genuinely uncertain (e.g. you can see a pattern but can't confirm it's deliberate), say so inline — "apps/ vs packages/ split appears intentional but no doc confirms the boundary rule" is more useful than silently picking one reading.

### 3. Seed `tasks.md`'s Backlog — only from real signal

Add Backlog entries only for things actually found: an unresolved `TODO`/`FIXME` tied to real code, a dependency flagged outdated by an actual check, a test file that's empty/skipped, a README instruction that no longer matches the code. Use the project's real directory/module names for the repo-section headers, not the placeholder `{repo-or-area-name}`.

**If nothing concrete surfaces, leave the Backlog empty.** Padding it with invented "improve test coverage" or "add documentation" busywork is worse than an honest empty list — it looks like real signal to the next session when it isn't.

### 4. Write the first `log.md` entry and session narrative

Prepend one line to `log.md` pointing at a full `sessions/{today}.md` (or `sessions/{today}-{tool}.md`) entry. The session log should narrate what was actually read (which commands, which files) and what it concluded — this is the one place a fuller, more hedged account belongs, even though `decision.md` and `tasks.md` stay terse.

### 5. Backfill CAMS

Run `cams_backfill` once steps 2-4 are written, so this adoption pass is immediately queryable. This is the step that actually makes the next session's `cams_query` calls useful — don't skip it or defer it.

## What this skill doesn't do

- Doesn't touch `sprint.md` — sprints are deliberately scoped by a human/agent conversation (`sprint-planning`), not inferred from git history.
- Doesn't set up branch strategy or `docs/BRANCHING.md` — that's a `catms init`-time choice, already made.
- Doesn't grade the existing code, propose a rewrite, or recommend a roadmap — this is a factual snapshot, not a review.
- Doesn't run more than once without being asked — see the "already adopted" check in **When to run this**.
