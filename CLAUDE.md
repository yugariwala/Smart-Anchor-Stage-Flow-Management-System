# CuePilot

**Constraint-aware live-event schedule repair: when a segment overruns, CuePilot calculates a
feasible plan that protects fixed commitments and the hard finish, explains it, and publishes
one approved revision to every screen at once — or refuses, with the shortage quantified.**

Authoritative spec: `PS5-CuePilot-Master-Report.md` at repo root. Sections 7A (solver),
9 (architecture), 10 (stack), 12 (data models, API contract, SQL schema) and 24 (repo shape,
env contract) govern the build. Decisions that extend or interpret the spec are recorded in
`docs/decisions.md`.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite, on Firebase Hosting (Spark) |
| Styling | Plain CSS or an already-known utility library |
| Validation | Zod shared schemas in `packages/domain` |
| Backend | Cloudflare Worker, small explicit router (no framework) |
| Database / concurrency | SQLite-backed Durable Object per event (`EventRoom`), one shared `QuotaRoom` |
| Authentication | Firebase anonymous auth; ID tokens verified on the Worker via Google's public JWKS (no Admin SDK, no service-account key) |
| AI | Gemini 2.5 Flash-Lite through a server-side adapter, structured output |
| Testing | Vitest for domain/API; a small browser end-to-end suite |

Package versions are whatever `npm install` resolved; the lockfile is committed. Never
hand-write a version string into a `package.json`.

## Non-negotiable invariants

1. **The backend is the only schedule authority.** All scheduling rules live in
   `packages/domain`; the Worker is the final authority. The frontend never writes a schedule.
2. **The LLM never produces timestamps.** `repairSchedule` is a pure deterministic function.
   Operational times and "current / up next" are rendered by deterministic templates from the
   published snapshot, outside generated prose. Gemini has no `publish`, `delete` or network tool.
3. **Published revisions are immutable.** To correct a bad publication, create another
   validated revision. A past snapshot is an audit record, never a live rollback button.
4. **Every mutation requires `expectedRevision` + `Idempotency-Key`.** The command ledger is
   checked *before* the current revision, so a network retry gets its original response.
   Reuse of a key with different content returns `409 IDEMPOTENCY_MISMATCH`.
5. **Rehearsal, AI-draft and fallback labels are mandatory in the UI**, verbatim per §11:
   - `REHEARSAL · fictional event and speakers · scenario clock.`
   - `Calculated from this scenario by the scheduling engine.`
   - `AI-generated draft — human review required.`
   - `Template fallback — AI unavailable.`
   - `Offline snapshot · revision N · last synced HH:MM:SS. Updates paused.`
6. **Record reality, flag the conflict.** A cue completion that violates the plan is still
   recorded, with `scheduleHealth: "needs_repair"`. Never reject reality, never manufacture a
   valid schedule.
7. **Anything unimplemented throws** `new Error("not implemented: Milestone N")` — never a fake
   return value that looks like it works.

## Pinned dependencies — do not "fix" these

**`@cloudflare/vitest-pool-workers` is pinned to `^0.22.0`. Do not run `npm audit fix --force`.**
It reports a `sharp`/libheif advisory reached only through `miniflare`, which is the local
emulator and is never deployed; the Worker decodes no images. The "fix" downgrades the pool to
0.8.30, which peer-requires vitest 2–3.1 against our vitest 4, removes the `cloudflareTest`
export the API config uses, and takes the entire test suite offline — typecheck fails and zero
tests run. This has already happened once. The advisory is a recorded, deliberate accept.

## Frontend rules

1. **The frontend never computes a schedule.** It renders what the server published. Only
   types and `renderOperationalCue` may be imported from `packages/domain`; oxlint enforces
   it, so this is a build failure rather than a review note.
2. **No optimistic success.** A publish shows pending until the server confirms. A transport
   failure is reported as *unknown*, never as failure or success, and the idempotency key is
   kept so a retry replays.
3. **Polling**: 2 s, visible views only, stopped on hidden tabs, immediate refresh on focus,
   backoff to 30 s on errors. A `204` is a successful sync.
4. **Freshness**: live under 5 s, amber to 15 s, stale beyond. Never colour-only.
5. **Six conflict codes, six sentences.** `REVISION_CONFLICT`, `PROPOSAL_EXPIRED`,
   `PROPOSAL_STALE`, `PLAN_TIME_STALE`, `PROPOSAL_RESULT_DIVERGED`, `PROPOSAL_INFEASIBLE` each
   demand a different action, so each gets its own copy. `NOT_PUBLISHED` is a waiting state,
   not an error.

## Non-goals

No telephony or phone-calling. No multi-stage or parallel tracks. No vector database or RAG
pipeline (retrieval is a lookup of explicit fact IDs). No queue. No Firestore, Cloud Functions,
Cloud Run or Pub/Sub. No fine-tuning. No sub-minute scheduling, no automatic reordering or
deletion, no live drag-and-drop.

## Milestones

| # | Scope | Status |
|---|---|---|
| M0a | Monorepo substrate: npm workspaces, strict TS, Vitest, `packages/domain` skeleton | **done** |
| M0b | `apps/web` scaffold: anonymous sign-in + connectivity probe | **done**, verified live in a browser |
| M1 | Deterministic repair solver, independent `validatePlan`, fixture, brute-force test suite | **done** |
| M2 | Worker router, `EventRoom`/`QuotaRoom` SQLite DOs, Firebase token verification, create/draft/publish/published-poll/invitations/join/ack/revisions/delete, 72h expiry | **done** |
| M3 | `renderOperationalCue`, repair proposals + approval, cue start/complete, rehearsal clock | **done** |
| M4 | Organizer console, anchor view, setup screen, repair preview | **done**, verified live against `wrangler dev` |
| M5 | Gemini script proposals + approval, template fallback, announcements and dismissal, the `college-demo-v1` draft seed | not started — needs `wrangler secret put GEMINI_API_KEY`. **Do not cut the script pipeline**: §25's AI beat cannot be faked (§21). |
| M6 | Offline snapshot cache, countdown offset, printable runbook, accessibility and localisation pass | not started |

Invitations, the anchor role, acknowledgment, 72-hour expiry, deletion and sanitized logging
landed in M2 rather than M5/M6, because the publication path needed a second identity and a
retention story to be testable at all.

**The backend and the three screens are demo-complete for §25** except the Gemini script
beat and announcements, both M5. `docs/demo-script.md` records exactly which beats cannot be
shot yet and the recording logistics (two pre-seeded events, second browser profile).

## Commands

```bash
npm ci            # install from the committed lockfile
npm run typecheck # tsc --noEmit in every workspace
npm test          # vitest run: domain on the node pool, API in real workerd
npm run dev:api   # wrangler dev on http://127.0.0.1:8787
npm run dev:web   # vite on http://localhost:5173
npm run build     # every workspace
npm run lint      # oxlint; enforces that the frontend never computes a schedule
npm run check     # typecheck + lint + test
```

Scripts named in §24 but not yet created: `dev` (both at once), `test:e2e`, `deploy:web`.

`apps/api/.dev.vars` is required for `wrangler dev` and is gitignored; copy
`apps/api/.dev.vars.example` and fill it in. `GEMINI_API_KEY` is a Worker secret, set with
`npx wrangler secret put GEMINI_API_KEY`, and must never appear in a file.

To see a solver result by hand, the three fixture scenarios are asserted in
`packages/domain/test/repair.test.ts`: +12 (feasible, cost 24), +8 (feasible, cost 12),
+19 (infeasible, sponsor short by 7 minutes).
