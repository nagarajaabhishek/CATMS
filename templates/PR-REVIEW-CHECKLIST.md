# PR review checklist — {PROJECT_NAME}

Used by the `pre-pr-review` skill (Step 3) on every PR. `catms update` never overwrites this file — it is yours. Keep the generic items; add project-specific ones at the bottom whenever a review or an incident finds a class of bug this list did not catch (write the incident date next to it).

## Max-level triggers
A PR touching any of these is reviewed at `max`. Edit this list for your stack.
- Authentication, authorization, sessions, permissions
- Queries or calls that run with elevated privileges (admin / service credentials, row-level-security bypass)
- Scheduled jobs, admin or internal endpoints
- Anything that calls a paid or rate-limited API (LLMs, payments, SMS, email)
- Database migrations; anything that deletes or rewrites data
- Release PRs (integration branch → `main`)

## Generic checks
1. **Client guard, server enforcement.** A rule enforced only in the UI or a client hook ("only generate when none exists") must also be enforced by the endpoint it calls. Every mutating endpoint is safe when called directly.
2. **Ownership on every privileged query.** Code that bypasses per-user access rules (admin client, raw SQL, background job) filters on the caller's user/org explicitly on every read, update and delete.
3. **Every writer resets every state field.** When a record has a state machine (`status`, `verified`, `review_state`, …), each create/update/upsert path sets all of the related fields consistently.
4. **Cost and abuse.** Any endpoint that calls a paid or slow external service has a per-user rate limit and an in-flight guard.
5. **Destructive order and idempotence.** Dependents are removed before the source row; a retry neither loses data nor writes twice.
6. **Fail-open side effects.** If an index, notification or log step may fail silently, the missing or stale result must not be harmful (stale search index of edited text, for example).
7. **Environment gates.** Environment-conditional behavior (`NODE_ENV`, feature flags) fails closed; a missing secret never silently weakens a check; migrations and config the change needs exist in the target environment.
8. **Removed behavior.** For every deleted route, guard or check: name the invariant it enforced and where it now lives; grep for callers and tests still pointing at it.
9. **No fabricated data on user surfaces.** No demo events, hardcoded figures or placeholder numbers rendered as if real.
10. **Input validation.** Types, emptiness and format are checked before use; bad input returns a 4xx, not a 500.
11. **No new clutter.** No new root-level one-off scripts, status or "COMPLETE" docs, committed binaries, logs, generated reports or `*.backup` files; anything over ~1 MB that is not a served asset is justified in the PR body.
12. **No secrets.** No key, token, password or connection string in code, config, docs, logs or the PR text.

## Project-specific checks
<!-- Add items here, e.g. "13. Every new table has row-level-security policies (incident 2026-03-02)". -->
