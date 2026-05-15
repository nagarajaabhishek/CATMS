# Linear Milestones — Phase Gates & Roadmap

## Overview

In CATMS, **milestones = phase completion gates**. A milestone is reached when all issues in that phase are `Deployed` or `Cancelled`. Milestones give you a clear roadmap across all projects.

---

## Setting Up Milestones in Linear

### Per project
Go to **Linear → Project → Milestones → Add milestone**

Create one milestone per phase:

| Milestone | Description | Gate condition |
|-----------|-------------|---------------|
| `Phase 1 — Foundation` | Infrastructure, secrets, migrations | All P1 issues `Deployed` |
| `Phase 2 — Core Features` | Main product working end-to-end | All P2 issues `Deployed` |
| `Phase 3 — Integrations` | Third-party services connected | All P3 issues `Deployed` |
| `Phase 4 — Polish` | Performance, advanced features | All P4 issues `Deployed` |

### Assign issues to milestones
When creating `[P1]` issues, assign them to the `Phase 1 — Foundation` milestone. Linear will track percentage complete automatically.

---

## Phase Gate Process

Before moving to the next phase, run this checklist:

```
Phase N complete when:
□ All [PN] issues are Deployed or Cancelled
□ No Blocked issues remain in that phase
□ Smoke test passed (create a [PN][You] smoke test issue)
□ Session log updated with phase completion note
□ active-projects.md updated to Phase N+1
□ Linear milestone marked complete
```

---

## Issue Hierarchy (Parent → Child)

For large features, use Linear's parent/child structure:

```
[P2] Voice Calling (parent)
  ├── [P2][Agent] Add Pipecat pipeline
  ├── [P2][Agent] Add TwiML webhook
  ├── [P2][You]   Buy Twilio number + set env vars
  └── [P2][You]   Test first call end-to-end
```

**Rules:**
- Parent issue = the feature (stays `In Development` until all children done)
- Children = concrete tasks (each gets its own branch `feat/LOG-XX-desc`)
- Parent moves to `Testing & QA` when all children are `Deployed`
- Never create child issues without a parent for features with 3+ tasks

---

## Roadmap View

Linear's roadmap shows milestones across projects on a timeline.

**Setup:**
1. Linear → Roadmap (left sidebar)
2. Add all your projects
3. Set target dates for each milestone
4. Milestones appear as markers on the timeline

**Recommended milestone dates:**
- Phase 1: Week 1-2 (infrastructure must be stable before anything else)
- Phase 2: Week 3-6 (core features)
- Phase 3: Week 7-10 (integrations)
- Phase 4: Week 11+ (polish, advanced features)

---

## Sprint / Cycle Planning

Linear has **Cycles** (sprints) for time-boxed work within a project.

**CATMS recommendation:** Use cycles within a phase, not across phases.

```
Phase 1 (4 weeks total)
  Cycle 1 (week 1-2): P1 infrastructure issues
  Cycle 2 (week 3-4): P1 verification + smoke tests
```

**Setup:** Linear → Project → Cycles → New cycle → set start/end date → add issues

---

## Multi-Project Roadmap Pattern

When you have multiple repos (e.g. thara-infra, thara-mobile, thara-web), coordinate milestones:

```
Week 1-2:  thara-infra Phase 1 ← must complete first (blocks everything)
Week 2-4:  thara-mobile Phase 1 + thara-web Phase 1 (parallel, both depend on infra)
Week 4-6:  thara-core Phase 2 + thara-mobile Phase 2 (parallel feature work)
Week 6-8:  All projects Phase 3 (integrations)
```

**Key rule:** Infrastructure milestones must complete before product milestones start. Block in Linear using the `Blocked` state and link the blocking issue in the comment.

---

## Milestone Completion Comment Template

When a milestone completes, post a comment on the parent issue or add to the Obsidian session log:

```
## Milestone Complete — Phase N ({project})

**Date:** YYYY-MM-DD
**Issues completed:** X/X
**Cancelled:** N (list with reason)
**Next milestone:** Phase N+1 — {description}
**Gate checklist:** ✅ all items passed
```

---

## Linear API — Querying Milestones

For agents using Linear MCP, query milestones by project:

```
# Get milestones for a project
linear_get_project_milestones(projectId: "{PROJECT_ID}")

# Create a milestone
linear_create_project_milestone(
  projectId: "{PROJECT_ID}",
  name: "Phase 1 — Foundation",
  targetDate: "YYYY-MM-DD"
)
```
