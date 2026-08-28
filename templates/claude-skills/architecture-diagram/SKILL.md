---
name: architecture-diagram
description: Generate a Mermaid architecture diagram of this repo, grounded in actual code inspection — entry points, application layers, data stores, third-party integrations, async/background processing, and (when present) agent/RAG/LLM components including where untrusted content enters the context. Use whenever the user asks to see, draw, visualize, or explain "the architecture," "how this fits together," "the system design," "the RAG pipeline," "how requests flow," or similar — proactively when first orienting in an unfamiliar repo, not only when a diagram is explicitly requested by name.
---

# Architecture diagram ({PROJECT_NAME})

Produces a Mermaid diagram (or a small set of them) describing what's actually in this codebase, saved into the repo so it stays a real artifact rather than a one-off chat reply. Same conservatism rule as `project-adoption`: **draw only what's evidenced by the code.** A diagram with an invented box for a service that isn't there, or a missing box for one that is, is worse than a smaller, accurate diagram — it's the kind of artifact people stop trusting after the first wrong detail, then stop updating, then it actively misleads.

## Step 1 — Scope before drawing

One diagram cannot show everything at once without becoming unreadable. Decide the view *before* inspecting the repo, based on what was actually asked:

- **System/component overview** (default, when the ask is general — "show me the architecture") — every major component and what talks to what, one screen's worth of boxes.
- **Request/data-flow trace** — how one specific thing moves through the system end to end (a user request, a RAG query, a webhook). Better as a `sequenceDiagram` than a `flowchart` — see Step 4.
- **Module/dependency graph** — for a monorepo, which packages/apps depend on which. Only worth a separate diagram when the repo actually is a monorepo with real internal boundaries.
- **Schema view** — table relationships, as an `erDiagram`. Only when the ask is specifically about data modeling, not general architecture.

If the codebase is complex enough that the overview would need 25+ nodes to be honest, say so and produce **two diagrams** — a system-level overview plus one zoomed-in view of the densest part (often the agent/RAG pipeline, if present) — rather than one overloaded diagram nobody can read.

## Step 2 — Inspect real signal, bounded

Don't read the whole repo. In rough priority order (stop once the picture is clear enough for the scoped view from Step 1):

1. Any existing `README.md`, `ARCHITECTURE.md`, or `docs/design/` content — fastest real signal, read before inferring anything from code.
2. Dependency manifest (`package.json`/`requirements.txt`/`go.mod`/`Cargo.toml`/`pom.xml`, etc.) — reveals most third-party integrations, DB clients, cache clients, queue clients, and AI/agent SDKs in one read.
3. `.env.example`/`.env.sample`/config files — service names are usually legible straight from the variable names (`STRIPE_SECRET_KEY`, `REDIS_URL`, `OPENAI_API_KEY`, `PINECONE_INDEX`).
4. Infra-as-code or `docker-compose.yml`, if present — often gives the deployed topology directly instead of having to infer it.
5. `.mcp.json` — MCP tool servers this codebase runs or depends on.
6. API route definitions / CLI command definitions / queue consumer registrations — the real entry points.
7. Migration or schema files — real DB shape, not assumed.
8. `.github/workflows/` or equivalent CI/CD config — real deploy targets and environments.

For a multi-repo workspace (`.catms.json`'s `repos` field), do this per repo but keep it proportionate to Step 1's scope — a system overview needs the shape of each repo, not an exhaustive read of every one.

## Step 3 — What to look for (the checklist)

Include a category only if Step 2 actually surfaced it — this is a checklist of *what to look for*, not a template of boxes every diagram must have.

| Category | Look for | Common Mermaid treatment |
|---|---|---|
| **Entry points** | HTTP routes, CLI commands, cron/scheduled jobs, queue consumers, webhooks received | Nodes at the edge of the diagram, arrows pointing in |
| **Application layers** | Controllers/routes → services/business logic → data access — or a monolith with none of that separation, which is itself worth showing accurately | Subgraph per layer if the separation is real |
| **Data stores** | Primary DB, cache (Redis/Memcached), search index, object storage (S3/GCS), vector store (pgvector/Pinecone/Weaviate/a flat file like CATMS's own `memory.ndjson`) | Cylinder shape (`[(...)]`), one per real store — don't merge distinct stores into one box |
| **Third-party integrations** | Payments, auth providers, email/SMS, analytics, deploy platforms, secret managers | Grouped in their own subgraph, e.g. `subgraph third_party["Third-party services"]` |
| **Async/background processing** | Job queues, workers, event buses, scheduled tasks | Distinguish "enqueues" from "processes" as separate labeled edges, not one vague arrow |
| **Caching layers** | CDN, in-memory cache, Redis, HTTP cache headers, app-level memoization | Only diagram if it's real infrastructure, not a generic "cache" box for an in-memory `Map` |
| **Auth & secrets boundaries** | Where auth actually happens, where secrets are read from (env var vs. secret-manager `run` command per `docs/BRANCHING.md`'s Secrets section) | A boundary line/subgraph, not a node — this is about where trust changes, not a component |
| **AI/agent/RAG components, if present** | LLM API calls, agent orchestration, embedding generation, the ingest → chunk → embed → store → retrieve → prompt-assemble → generate pipeline, MCP servers/tools | Sequence diagram for the pipeline order is usually clearer than a flowchart for this one |
| **Untrusted-content boundary, if there's an agent/LLM component** | Where does content the system doesn't control enter the prompt/context — user input, RAG-retrieved chunks, tool output, fetched web pages, injected via MCP | Mark explicitly — a distinct style (dashed border, a `classDef untrusted` fill color) on whatever crosses this line. This is the one category worth drawing even when it adds a node that "does nothing" — the boundary itself is the point, same reasoning as this very CLAUDE.md's own instruction-source-boundary rule |
| **Deployment/infra** | Where each component actually runs (Vercel, Cloud Run, containers, serverless), environment separation | Only for a system-overview diagram — usually noise on a data-flow trace |
| **Observability** | Logging, error tracking, metrics | Usually omit unless specifically asked — rarely load-bearing for "how does this work" |

## Step 4 — Author the Mermaid, grounded and legible

- **Pick the diagram type for what's being shown**, not out of habit: `flowchart TD`/`graph TD` for component/system views, `sequenceDiagram` for tracing one request or the RAG pipeline in order, `erDiagram` for a schema view, C4 (`C4Context`/`C4Container`, Mermaid supports these natively) if the system is genuinely large enough to want that formality.
- **Depict the mechanism, not just the name.** A node labeled "CAMS" says less than showing the actual chunking → embed → NDJSON → cosine-scan path if that pipeline is what the user is trying to understand — draw the parts the question actually hinges on.
- **Label every edge with what really flows** — `writes rows`, `invalidates`, `embeds via Ollama`, `polls every 30s` — never an unlabeled arrow or a bare "uses."
- **Group by real boundary with subgraphs** — trust domain (your infra / third-party / untrusted content), deployment target, or repo, whichever the scoped view calls for. Don't nest subgraphs more than one level deep; it stops rendering legibly past that.
- **Quote any label with special characters** — `A["Postgres (primary)"]`, not `A[Postgres (primary)]`, which breaks Mermaid's parser.
- **Keep labels short** (a word or a few) — explanatory detail belongs in a caption/legend next to the diagram, not crammed into node text.
- **One `classDef` per meaningful category** (e.g. `classDef thirdParty fill:#...`, `classDef untrusted stroke-dasharray: 5 5`) applied consistently, rather than one-off inline styling per node — a repeated visual encoding is what makes a diagram readable at a glance instead of requiring a legend for every element.
- **Re-split rather than cram** if a diagram is approaching the density limit from Step 1 — a second, more detailed diagram of just the dense part is better than one diagram nobody can trace.

## Step 5 — Save it, don't just paste it in chat

Write the Mermaid source (inside a ```mermaid fence) to `docs/design/architecture.md` — create it if missing, update the relevant section in place if it exists and this is a refresh rather than a first pass. This renders natively on GitHub with no extra tooling. If the current session has an interactive diagram-preview tool available, use it too for immediate visual feedback, but the saved file is the actual deliverable — a diagram that only ever existed in one chat reply is exactly the kind of thing this system exists to stop losing.

If this diagram reveals or settles something about the architecture worth another session knowing without re-deriving it (a layering decision, a boundary that isn't obvious from the code alone), add a short pointer entry in `decision.md` linking to `docs/design/architecture.md`, and `cams_ingest` it.

## What this skill doesn't do

- Doesn't design new architecture or recommend changes — this is descriptive, not prescriptive. If the inspection surfaces something that looks wrong, say so in conversation, don't silently "fix" it in the diagram.
- Doesn't guarantee full coverage of a very large codebase — Step 2 is bounded on purpose; say explicitly what was and wasn't inspected rather than implying completeness.
- Doesn't replace a full ADR for a real design decision — that's `docs/design/changes/{change-name}/design.md`. This skill produces a description of what exists, not a proposal.
