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

## 2026-09-19 - break drills: the standard

A break must fail the test **for the reason the test claims to check**, verified by direct
observation of stored state, not by counting red tests.

1. **Blast radius is weak evidence.** The M2 atomicity break took down 22 tests, but only
   because most of them route through a publish helper. "Publish is broken" is not "the
   rollback is broken". A storage probe - read the rows back and print revision, pointer,
   `revisions` actions and ledger count - is what actually pins the invariant.
2. **Write the probe as a temporary test, run it broken and restored, then delete it.**
   Printing `2 = rolled back, 3 = leaked` next to the value makes the reading unambiguous.
3. **A drill that stays green is the most valuable outcome**, because it names a test that is
   worth nothing. Two happened:
   - M2's first atomicity attempt went red for a duplicate-insert `500`, not for the rollback
     assertion. Replaced with a proper `transactionSync` bypass.
   - M3's approve-recompute break passed **all 24** repair tests. With `base_revision`
     matching, `state` is byte-identical to preview time and the only free variable is the
     clock, so `validatePlan` caught every divergence the recompute would have. The recompute
     was genuinely undefended. Fixed by a test that tampers the stored preview into a plan
     that is **valid but suboptimal** - `validatePlan` accepts it, only a fresh solve rejects
     it - which is the one shape that discriminates.

## 2026-09-19 - Milestone 3 rulings

1. **`PROPOSAL_EXPIRED` is distinct from `PROPOSAL_STALE`.** They demand different organizer
   actions - "you took too long" vs "the event moved, preview again" - and the UI must say
   different things. §12's `status` CHECK allows only `proposed | accepted | stale`, so there
   is no `expired` value: expiry is **derived** from `expires_at` and the row stays
   `proposed`. The `proposals_expiry` index exists for exactly this.
2. **Step-10 comparison set** is `feasible`, `weightedShorteningCost`, `projectedFinishMin`
   and the full `schedule`. `constraintChecks` is excluded, consistent with M1 ruling #6
   which made it a containment contract that may legitimately gain entries.
3. **INFERRED: approval persists `activeForecastEndMin`** from the input. Without it the next
   repair solves from the stale forecast. Marked `INFERRED` in `transitions.ts`.
4. **INFERRED: approval persists `releaseUpdates`** into the cues' `notBeforeMin`. §12 only
   requires storing them in `input_json` for recomputation; a later re-solve that silently
   forgot a speaker's release time would be a correctness bug. Marked `INFERRED` in source.
5. **Actual times come from `scenarioNowAt` in rehearsal**, and the cue records
   `actualTimeSource: 'rehearsal_clock' | 'server_clock' | null`. This is an **extension to
   §12's `Cue` type**. The source is currently derivable from `EventState.mode`, but
   recording it per cue keeps a rehearsal timestamp self-describing wherever it travels, so
   the printable runbook and audit view can never present a scenario time as a real
   observation.
6. **`PROPOSAL_RESULT_DIVERGED` split out of `PLAN_TIME_STALE`.** When a fresh solve differs
   from the stored preview for a reason other than the clock, saying "time advanced" would be
   a lie. Both are `409` and both are fixed by previewing again, but the message differs.
7. **Staleness is marked eagerly and lazily.** Every publishing transaction runs
   `UPDATE proposals SET status='stale' WHERE status='proposed'`, so the table is honest for a
   future proposals list; approve re-checks and is the authority.

## 2026-09-19 - Milestone 3: the two clocks

`transitions.ts` and `EventRoom.approveRepair` carry this in a comment block because getting
it wrong is silent.

| Clock | Value | Job |
|---|---|---|
| **Real wall-clock** | `cmd.nowIso`, stamped once per request by the Worker | Proposal TTL: ten real minutes (§12, "irrespective of the rehearsal clock") |
| **Scenario minute** | `scenarioNowAt` in rehearsal, `cmd.nowIso` in live, minus `startsAt` | Plan reachability: the DP cursor, `validatePlan`, `PLAN_TIME_STALE` |

A rehearsal parked at scenario minute 25 for an hour of real time must expire its proposals
while its plan stays reachable. Conflating the two either keeps dead previews alive forever or
expires live ones on a paused scenario.

## 2026-09-19 - `PLAN_TIME_STALE` has two routes, and route 2 is load-bearing

With an **active cue** the DP cursor is `input.activeForecastEndMin`, an absolute value from
the request. It does not depend on the clock at all, so advancing the scenario clock cannot
change the recomputed plan. A naive "advance the clock, then approve" test would get a clean
`200` and assert nothing.

- **Route 1 - no active cue.** The cursor becomes `max(latest completed end, current minute)`,
  so the clock genuinely moves the plan and the recompute differs.
- **Route 2 - clock past the active forecast end.** The DP output is byte-identical, and only
  the independent `validatePlan` notices, via `active_forecast_after_now`.

Without route 2 an active-cue event could never go stale, which would be silently wrong on the
fixture's own main path. Both are implemented and both have a test.

## 2026-09-19 - Milestone 0b

- **`apps/web` drops the Vite scaffold's own `typescript ~6.0.2` pin.** The monorepo keeps one
  compiler at the root, same one-instance reasoning as zod. The scaffold's `tsconfig.app.json`
  / `tsconfig.node.json` project-reference split was replaced by one tsconfig extending
  `tsconfig.base.json`.
- **The connectivity probe uses a 404 on a deliberately absent event** as its authenticated
  check. §12's endpoint inventory has no `whoami`, and a `404` proves the token verified and
  the caller simply is not a member, whereas a `401` would prove verification failed. That
  distinction is the whole point of the probe.
- **`VITE_FIREBASE_*` is public client configuration** and ships in the browser bundle by
  design. `apps/web/.env.local` is gitignored anyway (per-developer, and the credential rules
  above still apply to the file it came from).

## 2026-09-19 - Milestone 4 rulings

1. **The `no-computing-a-schedule` rule is mechanical, not a convention.** `apps/web` runs
   oxlint with `no-restricted-imports`: it may import types and `renderOperationalCue`, never
   `repairSchedule`, `previewRepair`, `applyRepair`, `validatePlan`, `computeInitialIntervals`,
   `materializeDraftCues`, the transitions, or `zod` directly. Demonstrated failing once and
   restored. `npm run lint` is part of `npm run check`.
2. **Acknowledgements get a separate 10 s console-only poll.** They are auxiliary records and
   never bump the revision (§12), so revision-driven polling can never surface them - yet §14
   requires the console to show them. The cheaper-looking alternative, putting an ack marker
   in the published snapshot, was rejected: every acknowledgement would then invalidate every
   anchor's cached snapshot, turning a private bookkeeping event into a fan-out.
3. **Hash routing, invite secret as a fragment query param.** `#/join/{id}?code=...`. The
   fragment never reaches the server or a log, and `history.replaceState` strips only `code`.
   Avoids Hosting rewrites entirely.
4. **The countdown is `aria-hidden`; a separate `aria-live="polite"` region announces only
   revision changes.** §20 wants a polite announcement on a new revision and explicitly not a
   per-second timer.
5. **The poll hook owns the clock.** `nowMs` is state advanced by a one-second ticker, so no
   component calls `Date.now()` during render. A component that did would be impure and could
   render a different countdown on every re-render.
6. **`useCommand` holds the idempotency key per INTENT.** A transport failure sets status
   `unknown`, distinct from `failed`, and KEEPS the key so a retry replays rather than
   double-applies (§17: never retry an uncertain publication with a new key).
7. **Two beats of §25 are unshootable and that is recorded, not worked around.** See
   `docs/demo-script.md`. A hardcoded "AI" response is explicitly not a substitute (§21).

## 2026-09-19 - Milestone 4: two bugs the live run found

Neither was visible from the test suite; both needed a real browser.

1. **Anonymous sign-in minted a NEW identity on every page load**, orphaning the organizer's
   event on a plain refresh. Two causes, both fixed in `apps/web/src/lib/auth.ts`:
   - `auth.currentUser` is `null` immediately after `getAuth()` even when a session IS
     persisted, because Firebase restores it asynchronously. Finding `null` means "not
     restored yet", not "no user". The fix awaits `auth.authStateReady()` first.
   - React StrictMode double-invokes mount effects, so two concurrent callers both passed the
     check and both called `signInAnonymously`. The in-flight promise is now shared.

   Symptom that exposed it: the console displayed one uid while requests were being made by
   another, which briefly looked like an authorization bypass. It was not - a fresh third
   identity was verified to receive `404` on both `GET /events/{id}` and `GET /published`, so
   membership enforcement was correct throughout. Verified after the fix: the uid is now
   stable across reloads.

2. **The contrast script itself was wrong before the colours were.** The first run reported
   10 of 23 pairs failing, including a ratio of 23.10:1 - impossible, since 21:1 is the
   maximum. The blue channel was being fed raw 0-255 into the luminance sum instead of through
   the sRGB linearisation. After the fix all 23 pairs pass, and a hand-computed check
   (`#6b4708` on `#fdf0d5` = 7.35) matches the script. A measurement that cannot be sanity
   checked is not a measurement.

## 2026-09-19 - Milestone 4: measured contrast

`node apps/web/scripts/contrast.mjs` reads the custom properties straight out of
`src/styles.css` and computes WCAG 2.2 ratios. All 23 foreground/background pairs pass, with
the tightest margins being:

| Pair | Ratio | Needs |
|---|---|---|
| Control border on card (UI component) | 4.43:1 | 3:1 |
| Rehearsal banner text | 7.35:1 | 4.5:1 |
| Status chip: ok | 7.55:1 | 4.5:1 |
| Anchor muted text on surface | 9.04:1 | 4.5:1 |

Contrast is a measurement here, not a claim. No formal accessibility certification is implied
(§20 is explicit about that).

## 2026-09-19 - Milestone 4: local environment notes

- **Vite may not get port 5173.** Another project already held it, so Vite fell back to 5174
  and every API call would have failed CORS. `ALLOWED_ORIGINS` in `apps/api/.dev.vars` now
  lists 5173 and 5174 on both `localhost` and `127.0.0.1`. Check the Vite banner for the
  actual port before blaming the API.
- **Do not launch `wrangler dev` repeatedly in the background.** Each launch leaves a
  supervisor process that respawns `workerd` when its child is killed; six accumulated
  stacks fought over port 8787. To clean up, kill the supervisor PARENTS first (the
  `node --no-warnings .../apps/api/...` processes, which are the parents of the `workerd.exe`
  processes), then the children. Killing `workerd.exe` alone just triggers a respawn.

## 2026-09-19 - Milestone 5 rulings

1. **Reserved fact-id prefixes are enforced at the REQUEST boundary, not in storage.**
   `factSchema` still accepts `event:` / `speaker:` because stored state legitimately contains
   them; `organizerFactSchema` and `organizerSpeakerSchema` refuse them on draft input, and the
   server synthesises the records at generation time. Nothing enforced this through M2-M4 - the
   suite's own harness was posting `event:name`, which is how it survived four milestones.
   Four tests added, including that the rule anchors at the start so `my-event-note` is fine.
2. **No draft cache in M5.** A deliberate cut, not a gap. The key would be
   `sha256(model | promptVersion | language | sortedFactIds+texts | cueContextHash)` and it
   would have to invalidate on any of those changing. §12's schema has no cache table and
   altering it was not worth it: the per-event cap is ten drafts a day, so the saving is small,
   and a subtly wrong cache key is worse than no cache.
3. **Script kind and language live in `input_json`.** The `proposals` table's `kind` column is
   constrained to `'repair'|'script'`, so the script kind (opening/introduction/...) and the
   language ride in the JSON payload.
4. **`source` records the GENERATOR, never whether a human edited.** An edited Gemini draft is
   still `gemini`. Downgrading it to `manual` on edit would erase the AI evidence at the exact
   moment a human did the review §7B requires. The review panel shows the generator label and
   the edited/unedited status as two separate facts.
5. **Time detection warns, never blocks**, and covers ASCII, Devanagari `[०-९]` and
   Gujarati `[૦-૯]` digits plus am/pm, o'clock and duration phrases. A check that
   recognised only ASCII would pass silently for exactly the two languages §20 asks us to
   support, which is worse than having no check.
6. **`inputHash`** = SHA-256 of the canonical `{proposalId, body}` at approval, computed in the
   Worker before the transaction opens, like every other hash since M2.
7. **Draft-phase approval leaves the published pointer null** (§12). Both script approval and
   announcement publication pass the existing pointer through when `phase === 'draft'`.
8. **The §11 template label is used verbatim even when AI was never enabled.**
   "Template fallback - AI unavailable." reads slightly oddly for `AI_ENABLED=false`, but it is
   accurate and §11 fixes the wording. No variant was invented. `fallbackReason` carries the
   precise cause separately.
9. **Quota ordering: project cap first.** The Worker reserves the project-wide AI unit before
   the EventRoom takes its per-event day unit, so an event is never charged a unit only to be
   refused by a project-wide condition. **The trade:** concurrent requests can over-admit the
   project cap by at most (concurrent - 1). §12 permits this - "application caps are
   deliberately lower than provider quotas; they do not guarantee uninterrupted service".
10. **The AI in-flight slot is a 30-second expiring LEASE, not a lock.** A boolean flag would
    wedge an event permanently the first time an isolate is evicted mid-generation, and with
    ten drafts a day the organizer could not work around it. The `finally` clears it normally;
    a crash leaves an orphan that is simply ignored once `reset_at` passes. 30s = the 12s
    provider deadline plus margin, so a slow-but-alive generation is never double-run. Tested
    both ways: blocked while live, recovered once backdated.

## 2026-09-19 - Milestone 5: the model named in §7B is not callable

`gemini-2.5-flash-lite` returns `404` for this project. The provider's own words:

> "This model models/gemini-2.5-flash-lite is no longer available to new users. Please update
> your code to use models/gemini-3.5-flash-lite for the latest features and improvements."

`ListModels` confirms it is listed but not callable, while `gemini-3.5-flash-lite` is both.
§7B anticipated exactly this: *"Use Gemini 2.5 Flash-Lite **if available in the team's project
at H1**... Availability and quotas must be checked in the actual project; do not spend hours
switching models."*

`GEMINI_MODEL` is now `gemini-3.5-flash-lite` in `.dev.vars`, `.dev.vars.example`,
`wrangler.jsonc` and the test config. **Every claim about the model must say 3.5-flash-lite.**
The substitution and both evidence runs are recorded in `docs/measurements.md`.

## 2026-09-19 - Milestone 5: test structure note

Provider branches are tested by calling `generateScriptDraft` directly with a fake `env` and a
fake `fetch`, NOT through the Durable Object. The test Worker runs with `AI_ENABLED=false` so
no test can reach Google by accident - but that short-circuit also masks every provider branch,
which is why the first eight DO-driven attempts all failed identically with
`fallbackReason: "AI_ENABLED is false"`. The DO tests keep what only they can prove: the
reserved-record synthesis, the lease, the per-event cap, staleness and approval.

## 2026-09-19 - Milestone 5: one unreproduced test failure

A single run showed `294 passed | 1 failed` while `docs/measurements.md` was being written in
the same command. Six subsequent full runs were clean. It is recorded here rather than ignored,
because an intermittent failure that nobody wrote down is one that gets rediscovered at H20.
If it recurs, the shared `QuotaRoom` across parallel API test files is the first place to look.

## 2026-09-19 - CSV agenda import (§8 SHOULD-HAVE)

§8 lists "CSV import with a provided template" first among the SHOULD-HAVEs, and every MUST
acceptance condition is green, so it is built. The feature is deliberately frontend-only:
it edits the draft, and the server remains the schedule authority.

- **Template**: generated from `FIXTURE_CUES` / `FIXTURE_SPEAKERS` in
  `apps/web/src/lib/csvAgenda.ts`, so the template, the setup "Load scenario" data and the
  demo share one source. It is downloadable from the import modal.
- **Columns**: `title, speaker, preferred_duration_min, min_duration_min,
  compression_penalty, buffer_before_min, available_from_min, fixed_start_min`. Header
  matching is trimmed and case-insensitive; unknown columns warn; missing required columns
  and duplicate columns are refused.
- **Behaviour**: rows are APPENDED to the current agenda. A same-name speaker is matched
  case-insensitively; an unknown name creates a speaker with NO facts, because inventing
  facts would violate the approved-facts rule - the warning says to add them before scripts.
  The 20-cue §12 limit is enforced before the file is applied.
- **Authority**: the importer only builds `draftCueInputSchema`-valid cue INPUT and hands it
  to the existing `PUT /draft`; intervals stay server-computed and nothing is scheduled or
  published. One bad row fails the whole import with its row number and reason, so a partial
  agenda is never silently applied.

## 2026-09-19 - audit fixes and the seeded rehearsal

An audit pass fixed four defects and implemented the one endpoint the code still refused.

1. **`purge` now deletes `command_results`.** The old comment in `destroy` already claimed the
   tombstone wiped the ledger; it did not. `command_results.response_json` stores full event
   state, so personal content outlived the 72-hour promise - and because `replayOrReject`
   runs before any deletion check, a replayed key returned a stale `201`/`200` after deletion
   or expiry. The deletion and expiry tests now assert a zero ledger row count.
2. **Revision pagination is validated in the Worker.** `Number('abc')` is `NaN`; binding it
   to SQLite raised `SQLITE_MISMATCH` and answered `500 INTERNAL`. Non-integer or
   non-positive `before`/`limit` now return `422 VALIDATION_FAILED`; the DO clamp remains as
   the second line.
3. **A replayed invitation request is refused, not re-minted.** The invite plaintext is
   deliberately never stored, so the ledger cannot replay it; the Worker previously generated
   a fresh secret on replay and returned a link whose hash had never been inserted. A same-key
   retry now returns `409 INVITATION_INVALID` with "its code cannot be shown again", which is
   what "returned exactly once" actually means.
4. **Gujarati template fallback copy was corrupted** (`સ્વાદેવું`, `સે કોી`). Replaced with
   standard Gujarati. The `generated; language quality unverified` label still applies per
   §18 - see `tests/api/gemini-adapter.test.ts`.

### `seed: "college-demo-v1"` is implemented

This supersedes the M2 ruling that deferred it. The seed builds a **draft** from the committed
`fixtures/college-demo-v1.json`: speakers and cue inputs run through `computeInitialIntervals` +
`materializeDraftCues`, so runtime fields are never taken from the fixture. The request config
supplies name/startsAt/hardEndMin; because the scenario occupies minutes 0-60 on the scenario
clock, `mode: "rehearsal"` and `hardEndMin >= 60` are **required** - a live or too-short
configuration is refused with `422`, never silently relaxed. The resulting state passes the same
`eventStateSchema` and 128 KB checks as every other write.

The provenance of a seeded event lives in a new server-owned `EventState.demoSeed` field
(`"college-demo-v1" | null`, defaulted to null by `eventStateSchema` so pre-extension records
still parse). It is deliberately NOT an organizer fact: `PUT /draft` cannot set it, and because
`saveDraft` spreads the existing state it survives later agenda edits. This is what the labeled
action keys off, so an organizer cannot fake a seeded scenario and a real one cannot be erased
by editing the agenda.

Driving that draft with the six ordinary commands - publish, start opening, clock to minute 5,
complete opening, start keynote, clock to minute 25 - reproduces the committed fixture exactly
at revision 7. `tests/api/demo-seed.test.ts` asserts the full cue list, statuses and actual
times equal the fixture, so the seed and the fixture cannot drift.

The web side is deliberately orchestration, not a bypass: `apps/web/src/lib/loadRehearsal.ts`
plans the normal commands, and the console offers a labeled **"Load rehearsal at keynote"**
implemented by those same commands, gated on `demoSeed`. Landing offers one-click **"Try
fictional rehearsal"** creation. Both labels follow §11/§12; the planner also resumes correctly
if a reply was lost mid-sequence.

## 2026-09-19 - the master report's model references are superseded

The report is the authoritative spec and is not edited. These two places name a model that
is no longer callable, and anything derived from them must be corrected before it is presented:

- **§7B** ("Use Gemini 2.5 Flash-Lite ... through a server-side adapter") and the **§10 stack
  table** ("AI | Gemini 2.5 Flash-Lite through an adapter"). Superseded: the deployed adapter
  calls **`gemini-3.5-flash-lite`**. §7B's own condition - *"if available in the team's project
  at H1"* - is what authorises the swap.
- **§16's cost model** computes "$2/month" for 5,000 drafts from "the listed Flash-Lite paid
  text rates of $0.10/million input and $0.40/million output". **Those are 2.5-flash-lite's
  published rates.** We now call a different model, so that figure is for a model we do not
  use. **Do not present it as current pricing.** It must be recomputed against
  3.5-flash-lite's published rates, with the check date recorded, before it appears in a
  README, deck or answer. §16 already frames it as "an engineering allowance, not a provider
  quote"; it is now also a *stale* one.

Sweep result on 2026-09-19: no source file, config file, test or committed artifact names 2.5
as the model in use. The only remaining mentions are the deliberate historical records in
`docs/decisions.md` and `docs/measurements.md` that quote the provider's 404 and §7B itself.

## 2026-09-20 - roadmap voice assistant is read-only

The master report correctly excludes speech recognition and autonomous stage control from the
MVP. Post-MVP roadmap work was explicitly requested after the MVP was completed, but that does
not relax the permission or authority model. The first voice increment is therefore a read-only
anchor aid:

- Browser-provided speech recognition maps a small English, Hindi or Gujarati phrase set to one
  of four deterministic intents: current cue, next cue, remaining time or help.
- Answers come only from `renderOperationalCue` fields in the latest live published snapshot.
  Generated host copy is never parsed for timing.
- The assistant pauses on cached or stale data, and it degrades to the existing visual runbook
  when browser speech recognition is unavailable.
- Speech synthesis uses the selected interface locale when the browser/OS supplies a matching
  voice. No telephony, third-party speech dependency, LLM call or backend route was added.
- An anchor voice phrase cannot start, complete, repair or publish anything. Adding mutating
  speech commands would require a separate authorized organizer design and server-authoritative
  command path.

## 2026-09-20 - speaker reminder agent starts as an owner-approved one-way call

The roadmap's broad “AI speaker reminder / check-in agent” combines several materially different
risks. The first increment is therefore a fixed, one-way Twilio reminder rather than an autonomous
conversation:

- Only the owner of a running live event can open a preview and explicitly place the call.
- The message is deterministic, cannot alter the schedule and tells the speaker to contact the
  organizer. It does not record audio or collect a response.
- The optional E.164 contact stays in owner event state and is removed from every published anchor
  snapshot. It expires with the event under the existing 72-hour retention rule.
- The idempotency reservation is persisted before contacting Twilio. An ambiguous retry returns
  the reservation/final response and does not dial again.
- Provider calls use inline TwiML and the standard-library `fetch`; no dependency or public webhook
  was added. The feature is disabled by default, and credentials must be Worker secrets.
- Two-way speech/DTMF, proactive scheduling and other channels remain separate roadmap work. They
  require a consent/status data model and validated Twilio webhook signatures before receiving any
  response from a speaker.
