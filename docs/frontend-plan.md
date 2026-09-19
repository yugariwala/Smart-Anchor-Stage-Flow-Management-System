# Frontend inventory and implementation plan

Prepared before implementation and updated to reflect the delivered frontend. The master report and follow-up brief supply product context; actual Worker routes and domain models determine supported behavior. Backend code and its scheduling authority remain unchanged.

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
| Scripts | `/event/:id/scripts` | Generate via `POST /events/:id/script-proposals`; review/edit beside approved facts; explicit review acknowledgment; `POST /events/:id/script-proposals/:pid/approve`. Expired/missing-fact drafts cannot be approved. Read approved scripts and provenance from owner GET. |
| Announcements | `/event/:id/announcements` | Human-written messages, language and active/history filter; `POST /events/:id/announcements`, `POST /events/:id/announcements/:aid/dismiss`. Both update the published snapshot. |
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

Scripts → choose kind/cue/language → real generation or labeled template fallback → review/edit against source facts → explicit acknowledgment → approve → anchor receives copy. Announcements → compose → publish → anchor receives banner → dismiss → history retains message.

Published cue within five minutes → local readiness reminder → dismiss on this screen or organizer recovery controls → preview → explicit approval. Shared yes/no readiness and dedicated stall-copy behavior remain backend dependencies.

All authenticated routes → session loss/error → retry/session screen. Network failure → dated read-only published cache → reconnect. Unknown mutation response → replay exact intent/key. Sign-out/deletion → clear local caches.

## State and responsive inventory

Every data page: loading skeleton, retryable transport error, denied/expired, no data, success. Forms: labels, constraints, validation summary, saving, exact retry for unknown outcome, confirmed success. Dialogs: focus trap, escape/close, accessible title/description, pending lock. Console: draft/running/ended, active/between cues, valid/needs repair, anchor current/behind/unacknowledged. Recovery: feasible/infeasible/pending/conflict/expired. Anchor: waiting/new revision/acknowledging/acknowledged/offline/cache revoked.

Desktop: persistent navigation rail, broad agenda and utility panel, three-region speaker/activity/countdown stage. Tablet: menu navigation and stacked utility panels. Mobile: compact header/menu, stacked form sections, stage regions and cue editors, horizontally contained read-only tables, large stage controls. Print: published runbook only, timestamps/revision/rehearsal labels retained, controls hidden. Reduced motion and visible focus throughout. Countdown is hidden from screen readers; revision changes have a separate polite announcement. Dialogs return keyboard focus to their opener.

## Backend gaps (not implemented by this frontend)

- Script proposal/approval and announcement publish/dismiss routes were added by the backend maintainer during this work. The frontend now uses them; these are no longer gaps.
- No authenticated event-list/membership endpoint or durable account upgrade. Workspace discovery is browser-local and identity scoped; server verifies access each time.
- No shared cue-readiness state or dedicated stall-copy contract. The five-minute reminder is display-only and never claims another person is ready.
- Speaker records have no photo URL or role. Stage UI uses real names, pronunciation and initials; it is ready to display optional supported fields later.
- Creation quota admission occurs before idempotency replay; a network retry can consume another quota slot. Invitation plaintext is not replayable reliably after a lost response. Deletion has no replay ledger and returns 404 after success. Document these actual constraints.
- Direct structural/fact editing is draft-only. Running event reorder/delete/edit requires future validated backend commands.
- No service worker or offline application-shell installation: cached snapshot works when the application can load; cold offline launch is not guaranteed.
- The initial Worker test dependency mismatch was corrected by the backend maintainer. Final `npm run check` passes all 308 tests, type checks and lint. The real browser flow, production build and all 30 measured contrast pairs pass. See `frontend-handover.md` for run instructions and verification details.
