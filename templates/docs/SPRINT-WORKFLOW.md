# Sprint Workflow — {PROJECT_NAME}

Referenced from `AGENTS.md` → **Sprint Workflow**. In Claude Code, the four skills below (`sprint-planning`, `task-kickoff`, `pr-checks-loop`, `sprint-close`) encode the operational checklist — read this doc directly if you want the *why* or the steps without waiting for a skill to trigger, or if you're using a tool without skills.

A sprint is a cross-repo (or just cross-cutting) initiative that's bigger than one repo/area section of `tasks.md` but doesn't need its own product. `sprint.md` groups the constituent tasks by initiative; `tasks.md` stays the single state-of-record for owner/status/updated on each task id — don't track state twice. This reuses `docs/BRANCHING.md`'s branch-discipline and no-autonomous-merge rules; it doesn't add new ones, just says how they compose at sprint granularity.

## Sprint IDs

Every sprint has its own short slug — a separate namespace from the id prefix its *tasks* use, not the same thing. This distinction exists because a sprint's task-id prefix is often reused from an existing repo/area's `tasks.md` numbering, and that prefix can't also double as the sprint's own identifier without ambiguity: pre-existing tasks under that prefix may predate the sprint and never belong to it.

- Declared on the sprint's heading in `sprint.md`: `**Sprint ID:** \`{slug}\``.
- Tagged on every task line belonging to that sprint, alongside `branch:`/`depends_on:`: `` `sprint: {slug}` ``.
- Pick a new slug when scoping a new sprint (`sprint-planning`, step 4 below) — short, lowercase, and distinct from any existing repo/area task-id prefix to avoid the same ambiguity recurring.

**The prose below explains the *why*. For the operational checklist, use the matching skill (Claude Code) — don't re-derive the steps from memory each time.**

| Sprint phase | Skill to invoke (Claude Code) | What it's for |
|---|---|---|
| Scoping/planning a sprint, writing tasks + subtasks with real (verified) context | `sprint-planning` | Research real status via CAMS/code before writing, assign task ids, set `depends_on`/`blocks_on`, link `tasks.md` |
| Starting any task — including ones that begin as pure investigation, before it's clear whether code will change | `task-kickoff` | Claim + collision check + branch-origin rules + local/GitHub checkout hygiene + migration-number check + branch created immediately, not deferred until code is imminent |
| Writing the actual code | — (no skill; normal implementation) | — |
| Code review of a change | general code-review skill/practice | Not workflow-specific |
| Before merging ANY PR — sprint task, release PR, or a standalone one-off | `pr-checks-loop` | Root-causes and fixes every required check to a real green, never bypasses; the mandatory gate before any merge decision |
| Closing out a finished sprint | `sprint-close` | Per-task PR merge in dependency order (via `pr-checks-loop` first), one release PR for the sprint (if two-stage), branch deletion (with confirmation), archive `sprint.md`, full session-end sync |

The four skills live in `.claude/skills/{sprint-planning,task-kickoff,pr-checks-loop,sprint-close}/` and encode the rules below as literal checklists — read one directly if you want the steps without waiting for auto-triggering.

## Start of sprint — plan for execution

1. Write the sprint into `sprint.md`: goal, current real status (verify against code/CAMS, don't assume from an old label), and a checklist of concrete tasks. Assign the sprint its own short `sprint:` slug (see **Sprint IDs** above) and tag every task line with it. For task ids themselves: reuse an existing repo/area-prefixed sequence when the work belongs to something already tracked in `tasks.md`; mint a new short prefix only for a genuinely new cross-cutting initiative.
2. Larger sprint tasks (3+ steps, real design decision) still get a full OpenSpec change folder (`docs/design/changes/{change-name}/`) per `AGENTS.md`'s Planning section — `sprint.md`'s line for that task is one linking line, same convention as `tasks.md`.
3. **Branching — one feature branch per task, not one per sprint.** Cut `feat/{task-slug}` off the integration branch for each `sprint.md` task individually (standard branch discipline still applies, including the **Branch origin & dependency rules** in `docs/BRANCHING.md` — run the same-file collision check before branching, and declare `depends_on` when a task genuinely can't be built without a sibling task's code). A single branch for an entire sprint defeats reviewability and breaks the "unrelated changes never share a branch" rule.
4. Claim by moving the task's line in `tasks.md` to `In Progress`, setting `owner`, and tagging `branch: <name>` (and `sprint: <slug>`, carried over from `sprint.md`) — same claim mechanics as any other task. Individual tasks in `sprint.md` don't get their own owner/status fields (that's `tasks.md`'s job) — but the *sprint itself* does, see **Single active sprint** below.

## Single active sprint (WIP limit)

Only one sprint may be `**Status:** Active` at a time — every other sprint stays `Planned` (scoped, tasks written, no branches yet), `Paused` (was Active, deliberately set aside), or `Completed`. This is a deliberate constraint, not a side effect: with multiple tools (Claude Code, Cursor, Antigravity) and repos potentially in play, building more than one cross-cutting initiative at once is exactly the condition that produces silent branch collisions — more concurrent branches across more files means more chances for an undeclared conflict, even with the collision-check and `depends_on`/`blocks_on` machinery in `docs/BRANCHING.md`. One active sprint keeps the surface area small enough to actually reason about.

**What's exempt from the limit (always allowed, regardless of which sprint is Active):**
- Scoping or writing a *new* sprint into `sprint.md` (`sprint-planning`) — ideation and planning aren't building. A sprint can sit `Planned` indefinitely.
- Adjusting an existing sprint's scope, priority, or task list — adding/removing/reprioritizing tasks, editing descriptions, writing an OpenSpec design doc.
- Any `tasks.md` item that **isn't** part of a sprint — a standalone one-off backlog item. The WIP limit is about sprints specifically; it doesn't freeze the whole project.
- Genuine emergencies (a live production bug) — use judgment, but say explicitly that you're stepping outside the WIP limit and why, don't just quietly do it.

**What's gated:** creating a branch or writing code for a task that belongs to a `Planned` or `Paused` sprint while a *different* sprint is `Active`.

**Enforcement — this is a real stop, not a reminder.** In Claude Code, `task-kickoff` checks `sprint.md` before branching. If the task belongs to a sprint other than the current `Active` one, it stops and asks rather than proceeding — the options are: (a) finish or explicitly pause the `Active` sprint first, or (b) explicitly override the WIP limit for just this one task, acknowledging it's being broken on purpose. Don't silently pick one.

**Activating a sprint:** the first time someone actually starts building a task from a `Planned` sprint (i.e. runs `task-kickoff` on it) and no sprint is currently `Active`, flip that sprint's `sprint.md` status to `Active` as part of the claim — this is the moment planning becomes building, and it should be visible in the file, not just implied.

**Closing:** `sprint-close` flips a sprint's status to `Completed` (and archives it) once every task is Done and the release process (if applicable) has landed.

## Sprint ordering — agent-determined, not asked-about each time

When the active slot is free and more than one sprint is `Planned`, the agent picks which one activates next — same spirit as `AGENTS.md`'s Autonomous Task Ownership already does for individual tasks ("pick the highest-value task you can execute"), just applied one level up. Rank by, in order:

1. **Active decay / standing risk first, regardless of everything else.** Something that gets *worse* the longer it sits — uncommitted work on a shared branch another push could clobber, an exposed credential, a live security gap — outranks a merely important sprint. This is not the same as urgency in general; it's specifically "will this be harder or more dangerous to fix tomorrow than today."
2. **Highest task priority present in the sprint.** A sprint containing any `P0` task outranks one whose ceiling is `P1`, which outranks `P2`-only — same `P0`→`P2` order `tasks.md` already uses.
3. **Agent-actionability of the very next step.** A sprint whose next task can actually be executed right now — no missing credential, no pending decision from a human, no third-party/vendor blocker — outranks one whose first task is itself stuck waiting on something outside the agent's control. Holding the one active slot on a sprint that can't move yet defeats the point of the limit.
4. **Incident-surface caution is a caveat, not a demotion.** A sprint touching a file/surface with real incident history isn't ranked lower for that alone — flag the caution prominently when it activates, don't dodge it by picking something else instead.
5. **Staleness as the tiebreaker.** Among sprints that rank equally on 1-4, the one that's been `Planned` longest goes first, so nothing quietly rots at the bottom of the list forever.

Maintain the resulting order as a **Sprint queue** list at the top of `sprint.md` (same pattern as `tasks.md`'s own Priority queue), one line per sprint with a short reason. Re-rank it whenever a new sprint is added (`sprint-planning`) or the active slot frees up (`sprint-close`) — new sprints get inserted at their actual rank, not appended to the bottom by default. Planning/design work inside a lower-ranked sprint can still happen anytime regardless of queue position, per the WIP-limit exemptions above — only *building* waits for its turn.

**During sprint:** normal `tasks.md` + session-log discipline (see `AGENTS.md`'s "During Work" table). Tick a `sprint.md` checkbox only once the matching `tasks.md` line reaches `Done` — `sprint.md` reflects `tasks.md`, never the other way around.

## End of sprint — branch merging strategy

1. Each task branch merges into the local integration branch first (unpushed), tested locally — same as any feature branch.
2. Push and PR into the integration branch **per task branch**, not one mega-PR for the whole sprint — keeps review scoped and bisectable.
3. Once every task branch for the sprint has merged and staging QA passes (if this project has a staging environment): **two-stage projects** cut **one** release PR from the integration branch (`dev`) to `main` covering the sprint as a whole (the normal release-PR flow, not a special path). **Single-stage projects** have nothing further here — each task's PR already merged straight to `main`.
4. Delete merged branches immediately, local + remote, per the strict branch hygiene rule in `docs/BRANCHING.md`. No agent merges or deletes branches autonomously here either — same rule as always, no sprint-shaped exception.
5. Move the finished sprint's section in `sprint.md` to a trailing "Completed sprints" section, boxes checked — don't delete it, same as `tasks.md`'s `Done`.
6. Standard session-end sync (`tasks.md`, `log.md`, `cams_ingest` + `cams_backfill`) still applies — finishing a sprint doesn't replace it.
