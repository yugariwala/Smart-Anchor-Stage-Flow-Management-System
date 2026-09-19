# Decisions

Where `PS5-CuePilot-Master-Report.md` is silent, ambiguous, or underspecified, the ruling is
recorded here so a later session does not re-litigate it. Each entry names the date it was
settled. "Ours" means the contract is this team's invention, not the spec's.

## 2026-09-19 — Milestone 1 rulings

1. **`repairSchedule` signature.** `repairSchedule(state: EventState, input: RepairInput, nowMin: number): RepairResult`. §7A writes `repairSchedule(input)`, but `RepairInput` carries no cues, so the state must be passed. `nowMin` is minutes relative to `startsAt`, derived by the caller from `scenarioNowAt` in rehearsal or the server clock in live mode; negative values clamp to 0. The clock read belongs to the caller so the solver has zero clock dependency.
2. **Fixture IDs vs UUIDs.** Cue and speaker IDs validate as nonempty bounded strings, not `.uuid()`, mirroring what §12 already mandates for `FactId`. UUID *generation* stays an API-layer concern at creation time. This keeps `qa` / `community` / `sponsor` legal so one fixture serves tests, video and deck. Noted in `packages/domain/src/schemas.ts`.
3. **`validatePlan` signature.** `validatePlan(state, candidate: ScheduleInterval[], ctx: { activeForecastEndMin, nowMin }): ConstraintCheck[]`, plus `planIsValid(checks)`. Marked `// INVENTED: not specified in §12` in the source. It shares no code with `repair.ts` — duplicated arithmetic is the point, since a shared helper would let one bug pass both checks.
4. **Cursor past `hardEndMin` with pending cues.** The cursor is validated against the hard end only in the no-pending-cues branch. When every DP transition fails, the all-minimum pass reports the blocking rule.
5. **`failure.cueId` for `hard_end` is `null`.** The overrun belongs to the plan, not one cue. §12 already types the field `UUID | null`, so this is consistent, not an extension.
6. **`constraintChecks` containment.** `minimum_durations`, `fixed_start` (per cue that has one) and `hard_end` are **always** emitted on a feasible result, so §12's example payload stays a valid instance of real output. Beyond those three, `buffer`, `not_before` and `contiguous_order` are emitted where applicable, and tests assert containment rather than array equality.
7. **Interior tie-break is not pinned.** §7A fixes the DP's output deterministically (previous ends ascending, durations descending, replace only on strictly lower cost, final layer minimum cost then earliest finish) but names no rule to choose between two optima sharing both cost and finish minute. Brute-force asserts `(feasible, weightedShorteningCost, projectedFinishMin)` on every case and the full per-cue schedule only where the optimum is provably unique. All three fixture cases are unique optima, so their full schedules *are* asserted.
8. **`recoveredMin` baseline.** Summed published pending durations (`plannedEndMin - plannedStartMin`) minus summed new durations — not start-time shifts, not the entered delay. Gives exactly 12 on the +12 scenario. A **negative** value is *restored time* and must never be described as recovered delay; asserted by test.
9. **Dev-build rejection diagnostics.** `RejectionReason` is a union of `fixed_start_unreachable`, `hard_end_exceeded`, `not_strictly_lower_cost`. `repairScheduleWithDiagnostics` returns per-reason counts; `repairSchedule` delegates to it and drops them, so the §12 `RepairResult` shape is not polluted and the approved signature is unchanged.

## 2026-09-19 — incidental

- **`baseRevision` comes from `state.revision`**, not `input.expectedRevision`. The API compares the two and rejects a mismatch before calling the solver, so the result reports what was actually solved against.
- **`GET /v1/whoami` is not in §12's endpoint inventory.** It is an M0-only auth probe and is labelled as such rather than presented as part of the contract.
- **`lib: ["ES2022", "DOM"]`** in `tsconfig.base.json`, because the 128 KB state-body check needs `TextEncoder` for real UTF-8 byte length (`.length` would undercount Hindi and Gujarati). `@types/node` is deliberately *not* installed for `packages/domain` — the fixture is imported via `resolveJsonModule` so Node APIs cannot leak into a package that must also run on Workers and in the browser.
- **Brute-force corpus is generated relative to the schedule, not absolutely.** A naive generator (random absolute `hardEndMin` and `fixedStartMin`) produced 80 cases of which only 6 had a non-zero optimal cost, making the objective comparison nearly vacuous. The horizon is now drawn from `[allMinimumFinish - 2, allPreferredFinish + 2]` and rule offsets are relative to where each cue lands. Seed `0x5c0eb17a`: 80 cases, 36 feasible, 44 infeasible, 25 requiring real compression, 32 with a unique optimum. `bruteforce.test.ts` asserts these proportions so the corpus cannot silently degenerate again.
- **`renderOperationalCue` throws `not implemented: Milestone 2`**, not Milestone 1. M0's prompt labelled it Milestone 1, but M1's scope was explicitly the solver only.

## 2026-09-19 - Milestone 2 rulings

1. **`NOT_PUBLISHED` is `409`, `retryable: true`**, with its own code distinct from every other conflict, so the M4 anchor view can render "waiting for the organizer to publish" rather than a failure. An anchor who joined before the first publish is in a legitimate waiting state.
2. **Tombstone.** `state_json = '{"tombstone":true}'`, `deleted_at` set, `revisions` / `members` / `invitations` / `proposals` / `acknowledgments` emptied. Cleanup checks `deleted_at` first, so repeated alarms are no-ops. `event_state.state_json` is `NOT NULL`, which is why the tombstone carries a non-personal placeholder rather than an empty value.
3. **`GET /events/{id}` gives an anchor `403`, a non-member `404`.** An anchor is a member and has `/published`; a non-member must not even learn the event exists. `currentRevision` is attached only for callers who are already members, so a revision can never leak across events. Asserted by test.
4. **`PUT /events/{uuid}` is the one mutation without `expectedRevision`** - there is no prior revision. It still requires `Idempotency-Key`, and the ledger row is written inside the creating transaction, so a same-UUID/same-key retry replays instead of conflicting.
5. **Draft seeding deferred.** `seed: "blank"` only; `"college-demo-v1"` returns `422 NOT_IMPLEMENTED` with the message `not implemented: Milestone 5`. The committed fixture is a *published running* state at revision 7, and §12 requires the demo scenario to be reached through normal publish/start/clock/complete commands. A draft-shaped variant built now would be a second fixture to keep in sync for three milestones before anything used it.
6. **Worker CPU is a placeholder, not an estimate.** `docs/measurements.md` records it as `NOT YET MEASURED` with the planned method. No figure that could be mistaken for a measurement appears anywhere.

## 2026-09-19 - Milestone 2 incidental

- **`transactionSync`'s callback must be synchronous**, so `crypto.subtle.digest` (async) cannot run inside it. Every request hash and invite-token hash is therefore computed *before* the transaction opens. This is load-bearing, not incidental: it makes "no external network call inside a transaction" structurally impossible rather than a convention a future contributor has to remember.
- **Durable Object RPC cannot carry a custom `Error` subclass.** `ApiError` is encoded into the thrown message with a `CUEPILOT_API_ERROR:` prefix and rebuilt on the Worker side. Throwing (rather than returning an error value) is required inside `transactionSync`, since the throw *is* the rollback.
- **workerd logs these expected rejections as "uncaught exception"** at the RPC boundary even though the Worker catches them. Behaviour is correct - the transaction rolls back and the client gets the right status - but it is log noise. Restructuring to return error values instead of throwing would forfeit rollback-on-throw, so the noise is accepted.
- **One zod instance for the monorepo.** npm installed a second nested zod (4.4.3 alongside the domain's 4.6.5) into `apps/api`, and the two minors' branded internals are mutually incompatible. `@cuepilot/domain` now re-exports `z`, and no app depends on `zod` directly.
- **`throwApi` is declared as a variable with an annotated function type**, not an arrow with a `: never` return annotation. TypeScript only narrows control flow through a never-returning call in the former form.
- **`compatibility_date` is `2026-08-22`, not today.** The installed workerd binary supports no date later than that and refuses to start otherwise. Bump it when wrangler ships a newer runtime.
- **`@cloudflare/vitest-pool-workers@0.22.0` requires `vitest ^4.1`** and replaced `defineWorkersConfig` from `/config` with a `cloudflareTest()` Vite plugin exported from the package root. Vitest was moved from 5.0.1 down to 4.1.11 to satisfy that peer range; the domain tests use only `describe`/`it`/`expect` and were unaffected.
- **`npm audit` reports 4 high-severity findings**, all one transitive `sharp` -> libheif chain inside `miniflare`, which is local emulation only and never deployed. `npm audit fix --force` would downgrade the test pool from 0.22 to 0.8.30, a breaking change, to avoid an image-decoder bug the Worker never reaches. Not taken; revisit when miniflare updates its `sharp`.
- **`apps/api/.dev.vars` overrides miniflare test bindings.** The test harness therefore reads `env.FIREBASE_PROJECT_ID` and mints tokens for whatever value is actually bound, rather than assuming `test-project`.
- **Tests reset the shared `QuotaRoom` counters in `beforeAll`.** The §12 caps (100 events/project/day, 2/uid/day) are real production limits, not test knobs, so they are unchanged - but one QuotaRoom is shared across suites and the project cap would eventually make an unrelated test fail with `429` as the suite grows. Resetting keeps a `429` in a test meaningful.
- **`lib` includes `DOM` and the domain package has no `@types/node`.** The fixture is loaded through `resolveJsonModule` so Node APIs cannot leak into a package that must also run on Workers and in the browser.

## 2026-09-19 - credential handling

These exist because a Gemini API key was leaked into a session transcript. The key was
revoked and rotated. Both rules are absolute, not best-effort.

1. **Treat every value in a credential file as secret by default.** Do not pattern-match
   known key formats. The leak happened because a redaction pass matched `AIza...` (Firebase
   web keys) and `key: <long-string>`, and the Gemini key was neither - it was `AQ.<short>`,
   which fell under the minimum-length guard. Redaction by recognised format fails on the
   first unfamiliar format, which is exactly the one worth protecting. Redact structurally:
   print field NAMES and never field VALUES.
2. **Do not read a credential file into context again.** Not for the Gemini key, not for the
   Firebase web config, not to "check" a value. `GEMINI_API_KEY` reaches the Worker only via
   `npx wrangler secret put GEMINI_API_KEY`, run by the user. If a value is needed for a
   config file, ask the user to paste it or to write the file themselves.
3. **`firebase-config.txt` is gitignored** (`.gitignore:15`) and was never committed.
   Verified with `git check-ignore`.
4. **Publicness is not the test.** A Firebase web `apiKey` is public client configuration and
   needs no rotation, but it is still not echoed. The rule is about the class of file, not a
   per-value judgement about how sensitive it is.

## 2026-09-19 - Milestone 2 deviations, itemised

Recorded individually because each one is a version or environment constraint a future
session will otherwise rediscover the hard way.

| Deviation | Reason |
|---|---|
| **vitest 5.0.1 -> 4.1.11** | `@cloudflare/vitest-pool-workers@0.22.0` (the latest) peer-requires `vitest ^4.1.0`. It also replaced `defineWorkersConfig` from the `/config` subpath with a `cloudflareTest()` Vite plugin exported from the package root. The domain tests use only `describe`/`it`/`expect` and were unaffected. Revisit when the pool supports vitest 5. |
| **`compatibility_date` = `2026-08-22`, not today** | The installed workerd binary refuses to start against a later date: *"This Worker requires compatibility date 2026-09-19, but the newest date supported by this server binary is 2026-08-22."* Pinned to the binary's ceiling. Bump when wrangler ships a newer runtime. |
| **zod 4 only, one instance** | npm installed a second nested copy (4.4.3 in `apps/api` alongside the domain's 4.6.5). Zod 4 brands its internals with `_zod.version`, so two minors produce schemas whose types are not mutually assignable across a package boundary - it surfaced as *"The types of `_zod.version.minor` are incompatible... Type '6' is not assignable to type '4'"*. Rather than pin two copies to the same version and rely on hoisting, `apps/api` declares no `zod` dependency at all and imports `z` re-exported from `@cuepilot/domain`. One instance by construction, which is a stronger guarantee than a matching version range. |
| **`npm audit`: 4 high left unfixed** | All one transitive chain: `@cloudflare/vitest-pool-workers` -> `miniflare` -> `sharp` (< 0.35.4) -> libheif image decoding. `miniflare` is the local emulator and is never deployed; the Worker never decodes an image. `npm audit fix --force` would downgrade the pool from 0.22 to 0.8.30, a breaking change that also loses the vitest 4 support we need. Revisit when miniflare bumps `sharp`. |
