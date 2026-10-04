# Agent Decision Log — {PROJECT_NAME}

**Purpose:** keep every coding agent (Cursor, Claude Code, Antigravity, etc.) and every human on the same page about calls that have already been settled.

This file is the shared working set of decisions made or discovered while working this project. Before re-deciding something, contradicting another tool's call, or treating a one-session chat as forgotten — check here. A Cursor session's call should be visible to Claude Code (and the reverse) without reconstructing it from a session log.

It is **current truth, edited in place**. When a call is reversed, update the entry; don't leave both versions standing as if they were both current.

## What belongs here vs. elsewhere

**Write here:**
- Settled calls another agent would otherwise re-litigate (tooling, process, "we tried X and it doesn't work")
- Explicit product/engineering calls that aren't a formal ADR
- Cross-agent coordination decisions (CI policy, deploy-from-which-branch, which path is live)
- Reversals of any of the above

**Do not dump here:**

| That belongs in | Not in `decision.md` |
|---|---|
| `tasks.md` | work state (owner / status / branch) |
| `sprint.md` | initiative plans |
| `docs/design/decisions/` (formal ADRs) | a full architecture write-up |
| session logs | narrative of one session |
| CAMS (`cams_query` / `cams_ingest`) | keyword + semantic recall over all of the above, with history (`cams_history`) |

CAMS is the **search layer** — `cams_query` for recall; never `Read` this file (or `tasks.md` / `sprint.md`) whole once it grows past a page or two. This file is the **writeable working set** — open the entry you're editing, don't reload the whole thing. Formal architecture still gets an ADR; add a short pointer entry here so other agents don't reopen it by accident.

## How to write an entry

Group by topic. Update in place. Newest entries in a section go at the top.

```
### D-YYYYMMDD-short-slug
**Status:** current
**Decided:** YYYY-MM-DD
**By:** @cursor | @claude | @you | agent claim tag (e.g. @claude-an, @claude-jordan for multi-developer teams)
**Decision:** one self-contained sentence.
**Why:** one or two sentences. What was rejected, if anything.
**Refs:** task id, PR, ADR, session log — optional.
```

If reversed: set **Status** to `reversed`, add **Superseded by:** `D-...`, keep the old text so the history of the call is visible.

**When:** the same moment as `cams_ingest` — after a call is actually settled, not as a session-end afterthought. Write the entry here **and** ingest to CAMS. Don't do only one.

---

## Process

### D-{SETUP_DATE}-example
**Status:** current
**Decided:** {SETUP_DATE}
**By:** @you
**Decision:** Example entry — replace or delete once a real decision lands.
**Why:** Placeholder so the file's structure is visible on first read.
**Refs:** —
