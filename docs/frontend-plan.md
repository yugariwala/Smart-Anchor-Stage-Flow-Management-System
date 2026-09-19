# Frontend inventory and implementation plan

Prepared before implementation. The master report supplies product context; actual Worker routes and domain models determine supported behavior. Backend code and its scheduling authority remain unchanged.

## Audit

React 19 / TypeScript / Vite, hash routing, Firebase anonymous identity, plain CSS, shared Zod validation, and Radix Themes already installed. Existing screens cover a narrow rehearsal path. Missing: persistent event discovery, complete draft editing, role-aware shell, history, event deletion, logout, accessible dialogs, public setup errors, comprehensive offline recovery and print layout. Existing setup drops all but the first speaker fact and overwrites event facts. Existing cache can stay marked cached after 204 and is not identity scoped. Unknown command outcomes require exact-payload replay. These are frontend issues to address.

All 14 repository-local SKILL.md files were inventoried for applicability. Design/redesign and complete-output guidance applies. Brand-board, image generation, mobile mockup, Stitch, GSAP landing-page, v1 compatibility, and industrial styles are not separate product requirements. This operational application uses existing React/CSS/Radix and restrained motion; no marketing image dependency or fictitious metrics. No dedicated testing skill exists locally; use the project's Vitest/Workerd checks plus frontend behavioral tests and browser verification.

## Page inventory and APIs

All paths below are hash routes; API paths are relative to `/v1`.

| Page | Route | Purpose and API |
| --- | --- | --- |
| Event workspace | `/` | Search/filter events opened in this browser; verify each using `GET /events/:id` (owner) or `/published` (anchor). No server event-list endpoint exists. Open by ID and join by invitation. |
| Create event dialog | workspace dialog | Name, IST start, duration, rehearsal/live; `PUT /events/:uuid`, blank seed. Stable UUID/key for retries. |
| Session | `/session` | Firebase anonymous sign-in, retry and explicit sign-out with loss-of-access explanation. No password, registration or reset APIs exist. |
| Setup | `/event/:id/setup` | Draft-only details, agenda add/remove/reorder, timing constraints, speaker and approved event facts; `GET /events/:id`, `PUT /events/:id/draft`. Explicit fictional fixture import in rehearsal only. |
| Organizer console | `/event/:id/console` | Current/up-next, schedule, health, completion, invitation and acknowledgment; owner GET, published polling, POST publish, cue start/complete, rehearsal-clock, invitations. |
| Recovery dialog | console dialog | Delay and speaker release updates, before/after, constraints, feasible/infeasible, expiry/stale conflict; POST repair-proposals and `/:pid/approve`. |
| Speakers | `/event/:id/speakers` | Real speaker facts, pronunciation and assigned cues from owner GET. Edit via draft setup only. |
| Scripts | `/event/:id/scripts` | Read real approved scripts, facts and provenance from owner GET. Clearly isolated unavailable generation/review controls pending script APIs. |
| Announcements | `/event/:id/announcements` | Read real active/history announcements from owner GET; clearly unavailable publishing/dismissal pending write APIs. |
| History | `/event/:id/history` | Paginated `GET /events/:id/revisions?before=&limit=20`; immutable revision detail via `/revisions/:rev`, no rollback. |
| Settings | `/event/:id/settings` | Identity/retention/event details from GET; accessible confirmation then `DELETE /events/:id` with expected revision and key, clear cached event. |
| Anchor runbook | `/anchor/:id` | Published polling, current/up-next, accurate display countdown, actual approved scripts/announcements, POST ack, read-only cache, print. Owners may preview but do not ack as an anchor. |
| Invitation | `/join/:id?code=…` | Consume secret from fragment, POST join, stable-key retry, expired/used/missing-code states. Secret never stored locally. |
| Help | `/help` | Working flow, limits, storage/identity explanation and actual capability status. |
| Recovery | unknown route / access / configuration | Not found, unauthorized or expired event, Firebase configuration, auth failure/retry, error boundary. Never substitute fabricated data. |

## User-flow map

Workspace → create event → setup details/facts/agenda → save → console → validate/publish → start/complete ordered cues → ended event → history/print/delete.

Console → delay/release update → calculate → feasible preview → approve → new published revision → anchor receives → acknowledges. Infeasible/stale/expired preview → quantified explanation → revise input and recalculate.

Console → invitation → separate browser/identity → join → waiting for publication or anchor runbook → revised cues/scripts/announcements → acknowledge → print.

All authenticated routes → session loss/error → retry/session screen. Network failure → dated read-only published cache → reconnect. Unknown mutation response → replay exact intent/key. Sign-out/deletion → clear local caches.

## State and responsive inventory

Every data page: loading skeleton, retryable transport error, denied/expired, no data, success. Forms: labels, constraints, validation summary, saving, exact retry for unknown outcome, confirmed success. Dialogs: focus trap, escape/close, accessible title/description, pending lock. Console: draft/running/ended, active/between cues, valid/needs repair, anchor current/behind/unacknowledged. Recovery: feasible/infeasible/pending/conflict/expired. Anchor: waiting/new revision/acknowledging/acknowledged/offline/cache revoked.

Desktop: collapsible navigation rail, broad agenda and utility panel. Tablet: reduced rail and stacked utility panels. Mobile: compact header/menu, stacked form sections and cue editors, horizontally contained read-only tables, large stage controls. Print: published runbook only, timestamps/revision/rehearsal labels retained, controls hidden. Reduced motion and visible focus throughout.

## Backend gaps (not implemented by this frontend)

- Script proposal/approval and announcement publish/dismiss routes in report §12 are absent. UI must not fake successful generation or publication.
- No authenticated event-list/membership endpoint or durable account upgrade. Workspace discovery is browser-local and identity scoped; server verifies access each time.
- Creation quota admission occurs before idempotency replay; a network retry can consume another quota slot. Invitation plaintext is not replayable reliably after a lost response. Deletion has no replay ledger and returns 404 after success. Document these actual constraints.
- Direct structural/fact editing is draft-only. Running event reorder/delete/edit requires future validated backend commands.
- No service worker or offline application-shell installation: cached snapshot works when the application can load; cold offline launch is not guaranteed.
- Baseline `npm run check` fails because `@cloudflare/vitest-pool-workers/types` is missing in the existing installation. Record final checks separately.
