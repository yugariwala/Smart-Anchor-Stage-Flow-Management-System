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

## Non-goals

No telephony or phone-calling. No multi-stage or parallel tracks. No vector database or RAG
pipeline (retrieval is a lookup of explicit fact IDs). No queue. No Firestore, Cloud Functions,
Cloud Run or Pub/Sub. No fine-tuning. No sub-minute scheduling, no automatic reordering or
deletion, no live drag-and-drop.

## Milestones

| # | Scope | Status |
|---|---|---|
| M0a | Monorepo substrate: npm workspaces, strict TS, Vitest, `packages/domain` skeleton | **done** |
| M0b | `apps/web` anonymous sign-in page, Gemini adapter + smoke script, `.env.example`, hosting deploy | **partly blocked** — the Worker half landed in M2; the web page needs `VITE_FIREBASE_*`, the Gemini adapter needs `wrangler secret put GEMINI_API_KEY` (M4) |
| M1 | Deterministic repair solver, independent `validatePlan`, fixture, brute-force test suite | **done** |
| M2 | Worker router, `EventRoom`/`QuotaRoom` SQLite DOs, Firebase token verification, create/draft/publish/published-poll/invitations/join/ack/revisions/delete, 72h expiry | **done** |
| M3 | `renderOperationalCue`, repair proposals wired to the solver, approval, cue start/complete, rehearsal clock | not started |
| M4 | Gemini script proposals, structured validation, quota lease, template fallback | not started |
| M5 | Announcements and dismissal, the `college-demo-v1` draft seed, "Load rehearsal at keynote" | not started |
| M6 | Offline snapshot cache, countdown offset, printable runbook, accessibility and localisation pass | not started |

Invitations, the anchor role, acknowledgment, 72-hour expiry, deletion and sanitized logging
landed in M2 rather than M5/M6, because the publication path needed a second identity and a
retention story to be testable at all.

`renderOperationalCue` throws `not implemented: Milestone 2` — M1's scope was the solver
only, so it moved out of M0's original numbering. It is M3 work now.

## Commands

```bash
npm ci            # install from the committed lockfile
npm run typecheck # tsc --noEmit in every workspace
npm test          # vitest run: domain on the node pool, API in real workerd
npm run dev:api   # wrangler dev on http://127.0.0.1:8787
```

Scripts named in §24 but not yet created, because the workspaces they drive do not exist:
`dev`, `dev:web`, `test:e2e`, `build`, `deploy:web`.

`apps/api/.dev.vars` is required for `wrangler dev` and is gitignored; copy
`apps/api/.dev.vars.example` and fill it in. `GEMINI_API_KEY` is a Worker secret, set with
`npx wrangler secret put GEMINI_API_KEY`, and must never appear in a file.

To see a solver result by hand, the three fixture scenarios are asserted in
`packages/domain/test/repair.test.ts`: +12 (feasible, cost 24), +8 (feasible, cost 12),
+19 (infeasible, sponsor short by 7 minutes).
