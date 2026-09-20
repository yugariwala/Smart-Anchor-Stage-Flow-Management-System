# Feature inventory

Built on `main` at `42d3c5f`, 2026-09-19. **Status comes from the code**, not from a
completion report. Where the README and the source disagree, the source wins and the
disagreement is listed at the end.

## How this was verified

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | pass |
| `npm run build` | pass |
| `npm test` | **330 passed / 330**, 19 files — domain 151, api 139, web 40 |
| `npm run test:e2e` | **1 passed**, 52.5 s (recorded Playwright run against deployed Firebase + Cloudflare) |

The API suite runs inside **real `workerd`** via `@cloudflare/vitest-pool-workers`, with real
Durable Objects, real SQLite and a real `transactionSync`. Nothing about storage is mocked, so
an API test passing counts as "exercised on a running stack".

### Status definitions

- **Verified** — implemented, tested, and exercised on a running stack. Evidence names the test
  file or the run.
- **Implemented** — code exists and typechecks; no test, or never run live. The gap is stated.
- **Partial** — some paths work, others stubbed. The missing part is stated.
- **Stubbed** — signature exists, body throws `not implemented`.
- **Not built** — nothing exists.
- **Cut** — deliberately excluded, with the reason.

---

## Foundation & auth

| Feature | Layer | Status | Evidence | Tier | Notes |
|---|---|---|---|---|---|
| Anonymous Firebase sign-in | web | **Verified** | `apps/web/test/auth.test.ts`; e2e; live browser runs (M4, M5) | MUST | Persisted session reused across reloads after the M4 `authStateReady` fix |
| ID-token verification (RS256, Google JWKS, iss/aud/sub/exp/iat) | API | **Verified** | `tests/api/permissions.test.ts` (8 token tests); live `wrangler dev` with a real Firebase token | MUST | Pinned `alg`; key source is an injectable seam, never a bypass |
| Membership model, owner vs anchor | API | **Verified** | `tests/api/permissions.test.ts` | MUST | Anchor gets 403 on owner routes; non-member 404 |
| Non-member isolation, no revision leak | API | **Verified** | `permissions.test.ts`; live check with a third anonymous identity → 404 on both read routes | MUST | `currentRevision` attached only for members |
| `Idempotency-Key` ledger, ledger-before-revision | API | **Verified** | `tests/api/publication.test.ts`; break drill (M2) | MUST | Same key + different body → 409 |
| `expectedRevision` conflict handling | API | **Verified** | `publication.test.ts`, `repair.test.ts` | MUST | 409 + `currentRevision`, mutates nothing |
| Reserved `event:` / `speaker:` fact-id prefixes | domain + API | **Verified** | `permissions.test.ts` (4 tests); caught a real violation live in the browser | added-since | Security fix; ungated through M2–M4 |
| Identity-scoped browser workspace, shortcuts, sign-out | web | **Verified** | `apps/web/test/route-storage.test.ts`; e2e (`Sign out`, `Your workspace`) | added-since | No server event-list endpoint exists; the list is browser-local |
| 72-hour expiry (alarm + request-entry sweep) | API | **Verified** | `publication.test.ts` (alarm idempotent, delayed-alarm path) | MUST | Non-personal tombstone retained |
| Event deletion | API + web | **Verified** | `publication.test.ts`; e2e (`Delete permanently`) | MUST | Access denied immediately after |
| Daily quota caps (events/uid, events/project) | API | **Verified** | `publication.test.ts` | MUST | 2/uid/day, 100/project/day |
| CORS allowlist, request id, sanitised logs | API | **Verified** | `permissions.test.ts`; live | MUST | Origin allowlist is not authorization |

## Event and agenda setup

| Feature | Layer | Status | Evidence | Tier | Notes |
|---|---|---|---|---|---|
| Create event (name, start, hard finish, mode) | API + web | **Verified** | `publication.test.ts`; e2e (`Create your event`) | MUST | |
| Draft save, server-computed initial intervals | API + domain | **Verified** | `publication.test.ts`; `packages/domain/src/draft.ts`; e2e | MUST | Laid out from minute zero, independent of wall clock |
| Agenda builder: durations, minimums, penalty, buffer, not-before, fixed start | web | **Verified** | `apps/web/test/setup.test.tsx`; e2e | MUST | |
| Mass-assignment prevention on draft input | API + domain | **Verified** | `permissions.test.ts` (4 tests) | MUST | Strict schemas; `materializeDraftCues` is the only path to a `Cue` |
| Speakers, pronunciation hints, approved facts | API + web | **Verified** | `permissions.test.ts`; e2e; `/event/:id/speakers` | MUST | |
| Inline validation from the shared Zod schemas | web | **Verified** | `apps/web/test/setup.test.tsx`; e2e | MUST | Same schemas the server enforces |
| CSV agenda import | web | **Verified** | `apps/web/test/csv-agenda.test.ts`; hosted e2e imports, previews and applies a CSV cue | SHOULD | Exercised against the deployed Firebase frontend and production Worker |
| One-click fictional rehearsal (`college-demo-v1`) | API + web | **Verified** | `tests/api/demo-seed.test.ts`; `apps/web/test/load-rehearsal.test.ts`; e2e (`Load scenario`) | MUST | Guarded: rehearsal mode only, hard finish ≥ 60 |

## Scheduling & repair

| Feature | Layer | Status | Evidence | Tier | Notes |
|---|---|---|---|---|---|
| Bounded-DP repair solver (`repairSchedule`) | domain | **Verified** | `packages/domain/test/repair.test.ts`; `bruteforce.test.ts` (80 seeded cases vs exhaustive) | MUST | +12 cost 24, +8 cost 12, +19 infeasible — exact numbers asserted |
| Independent `validatePlan` second line of defence | domain | **Verified** | `repair.test.ts` (14 rejection tests) | MUST | Shares no code with the solver, deliberately |
| Quantified infeasibility (rule, cue, earliest, limit, shortage) | domain + web | **Verified** | `repair.test.ts`; live browser (+19 → sponsor short by 7 min, Publish disabled) | MUST | §14 sentence shape rendered verbatim |
| Repair proposal (preview mutates nothing) | API | **Verified** | `tests/api/repair.test.ts` | MUST | Infeasible returns `201`, not an error |
| Approval recomputes, never replays stored result | API | **Verified** | `repair.test.ts` incl. the tampered-preview test; break drill with storage probe | MUST | `PROPOSAL_RESULT_DIVERGED` split from `PLAN_TIME_STALE` |
| Proposal TTL (10 real minutes) and staleness | API | **Verified** | `repair.test.ts` | MUST | TTL on wall-clock, reachability on scenario minute |
| `PLAN_TIME_STALE`, both routes | API | **Verified** | `repair.test.ts` (route 1 no active cue, route 2 validator) | MUST | Route 2 is load-bearing; without it an active-cue event could never go stale |
| Speaker release (`notBeforeMin`) persisted on approval | domain + API | **Verified** | `repair.test.ts`; `transitions.test.ts` | MUST | Inferred requirement, recorded in decisions |
| Repair preview UI (before/after, cost, rule checks) | web | **Verified** | e2e (`Review the recovery plan`); live browser | MUST | Publish enabled only when the server says feasible |

## Revision, publication & audit

| Feature | Layer | Status | Evidence | Tier | Notes |
|---|---|---|---|---|---|
| Atomic publication (state + revision row + pointer) | API | **Verified** | `publication.test.ts`; break drill proved rollback by direct storage probe | MUST | One `transactionSync`; a throw rolls back all three |
| Immutable revisions, append-only | API | **Verified** | `publication.test.ts` | MUST | Revision 1 byte-identical after later revisions |
| Published snapshot poll with `204` when unchanged | API + web | **Verified** | `publication.test.ts`; live | MUST | Server-time header on both |
| Revision history + single-revision read | API + web | **Verified** | `publication.test.ts`; e2e (history) | MUST | Cap 50, read-only, no rollback button |
| Cue start / complete with server-derived actuals | API + domain | **Verified** | `tests/api/repair.test.ts`; `transitions.test.ts`; e2e | MUST | |
| `actualTimeSource` provenance on recorded times | domain | **Verified** | `repair.test.ts`, `transitions.test.ts` | added-since | Extension to §12's `Cue`; stops a scenario time being shown as real |
| Reality recorded even when it breaks the plan | domain + API | **Verified** | `transitions.test.ts`, `repair.test.ts` | MUST | `needs_repair` flagged, later cues never silently shifted |
| Rehearsal scenario clock (monotonic, rehearsal-only) | API + domain | **Verified** | `transitions.test.ts`, `repair.test.ts`; e2e (`+5 min`, `+10 min`) | MUST | |

## Anchor delivery

| Feature | Layer | Status | Evidence | Tier | Notes |
|---|---|---|---|---|---|
| Anchor invitations (128-bit secret, hash stored, one use, 1 h) | API | **Verified** | `permissions.test.ts`; live | MUST | Plaintext returned once; secret rides the URL fragment |
| Join by invitation, atomic consume | API + web | **Verified** | `permissions.test.ts`; live incognito-equivalent second identity | MUST | |
| Anchor view: current / up next / operational line | web + domain | **Verified** | `packages/domain/test/transitions.test.ts` (`renderOperationalCue`); e2e; live | MUST | Never parses generated prose for times |
| Per-revision acknowledgment + behind tracking | API + web | **Verified** | `permissions.test.ts`; live (behind rev 9 → current rev 10) | MUST | Ack does not bump the revision, by design |
| 2 s visibility-aware polling, backoff, freshness | web | **Verified** | `apps/web/test/snapshot.test.tsx`; live | MUST | 204 counts as a successful sync |
| Offline snapshot cache + §11 stale label | web | **Verified** | `snapshot.test.tsx`; live worker-kill test | MUST | Recovered on restart |
| Local countdown from server-clock offset | web | **Verified** | `snapshot.test.tsx`; live | MUST | `aria-hidden`; no write per second |
| Live stage overview / readiness reminder | web | **Verified** | `apps/web/test/stage-readiness.test.tsx`; e2e (`Upcoming cue reminder`) | added-since | |
| Printable runbook | web | **Verified** | hosted + local e2e; 2-page A4 PDF rendered with Poppler and visually inspected | MUST | Agenda header contrast fixed; blank third page removed; controls hidden and print-only facts/copy present |

## AI script pipeline

| Feature | Layer | Status | Evidence | Tier | Notes |
|---|---|---|---|---|---|
| Gemini adapter, structured output, §7B prompt verbatim | API | **Verified** | `tests/api/gemini-adapter.test.ts`; **real provider run 2026-09-19T12:17:11Z, 4/4 schema-valid** | MUST | Model is `gemini-3.5-flash-lite` (§7B's 2.5 is not callable) |
| Fabricated fact-id rejection | API | **Verified** | `gemini-adapter.test.ts` | MUST | A rejection, not a warning |
| One schema-repair retry inside a 12 s total budget | API | **Verified** | `gemini-adapter.test.ts` | MUST | Both attempts share one deadline |
| Template fallback, §11 label, `fallbackReason` | API | **Verified** | `gemini-adapter.test.ts`; **real 404 run: 4/4 labelled fallbacks, approval still worked** | MUST | Never reported as an AI success |
| Time-in-body detection (ASCII, Devanagari, Gujarati, am/pm, o'clock, durations) | API | **Verified** | `gemini-adapter.test.ts` | MUST | Warns, never blocks |
| Prompt-injection containment | API | **Verified** | `gemini-adapter.test.ts` | MUST | Hostile fact stays in `APPROVED_FACTS`, never the system instruction |
| AI quota: project/day, event/day, 30 s in-flight lease | API | **Verified** | `tests/api/scripts.test.ts` | MUST | Lease is expiring, so a crash self-heals |
| Script review UI (draft beside source facts, 3 statuses) | web | **Verified** | `apps/web/test/script-review.test.tsx`; e2e (`Review draft`, `Approve and publish copy`) | MUST | Never a confidence score |
| Approved copy in the published snapshot | API + web | **Verified** | `scripts.test.ts`; e2e (`All approved host copy`) | MUST | `source` records the generator, not whether a human edited |
| Multilingual drafts (en / hi / gu) | API | **Partial** | `gemini-adapter.test.ts`, `templates.ts` | MUST | Code paths and templates exist for all three; **only English has been generated against the real provider and reviewed.** hi/gu carry "generated; language quality unverified" |
| Draft cache by model/prompt/language/fact hash | API | **Cut** | `docs/decisions.md` M5 #2 | SHOULD | Deliberate: no cache table in §12's schema, 10 drafts/day makes the saving small |

## Announcements

| Feature | Layer | Status | Evidence | Tier | Notes |
|---|---|---|---|---|---|
| Publish announcement (500 char, explicit publish = approval) | API + web | **Verified** | `tests/api/announcements.test.ts`; live browser round trip | MUST | Organizer writes every word; no autonomous wording |
| Announcement in the same published snapshot | API | **Verified** | `announcements.test.ts`; live (banner at revision 4) | MUST | Never fetched separately |
| Dismiss (banner clears, record retained) | API + web | **Verified** | `announcements.test.ts`; live (revision 5); e2e (`Dismiss banner`) | MUST | |
| Ten-active cap, anchor cannot publish | API | **Verified** | `announcements.test.ts` | MUST | |

## Demo & rehearsal

| Feature | Layer | Status | Evidence | Tier | Notes |
|---|---|---|---|---|---|
| `college-demo-v1` six-cue fixture | domain | **Verified** | `fixtures/college-demo-v1.json`; `repair.test.ts` asserts §5's exact numbers | MUST | |
| Seeded rehearsal, one click | API + web | **Verified** | `tests/api/demo-seed.test.ts`; e2e | MUST | |
| Isolated per-judge scenario (personal event, no shared password) | API + web | **Verified** | `permissions.test.ts`; live | MUST | Anonymous identity per browser |
| Rehearsal labelling (§11 header, verbatim) | web | **Verified** | e2e; live on every screen | MUST | |
| Demo recording logistics + QA capture | docs | **Verified** | `docs/demo-script.md`; recorded organizer + portrait anchor hosted rehearsals | added-since | Silent verification takes exist locally; the edited/narrated 180 s submission remains a manual production task |

## Accessibility & localisation

| Feature | Layer | Status | Evidence | Tier | Notes |
|---|---|---|---|---|---|
| Measured contrast (23/23 pairs pass) | web | **Verified** | `apps/web/scripts/contrast.mjs`; `docs/measurements.md` | MUST | Measured, not asserted; Radix's own component palettes are **not** covered |
| Keyboard reachability, visible focus, focus return | web | **Verified** | e2e Tab traversal to skip link, Enter to main, Escape + opener focus restoration | MUST | Exercised in Chrome; not a formal screen-reader audit |
| Non-colour status (text + shape on every chip) | web | **Verified** | `styles.css`; e2e reads chips by text | MUST | |
| Polite live region on new revision, `aria-hidden` countdown | web | **Verified** | `snapshot.test.tsx`; `AnchorView.tsx` | MUST | Not a per-second announcement |
| Reduced-motion respected | web | **Verified** | e2e emulates `reduce` and asserts computed animation, transition and scroll behavior | MUST | Native media emulation against the running app |
| Mobile-portrait anchor, desktop console | web | **Verified** | e2e captures `anchor-mobile.png` at mobile viewport | MUST | |
| Script language selection (en / hi / gu) | web | **Verified** | `script-review.test.tsx`; e2e (`Kind`, language select) | MUST | |
| Localised **interface and page copy** | web | **Verified** | `i18n.test.ts`; local full-rehearsal e2e checks Hindi persistence, Hindi/Gujarati page copy, navigation and document `lang` | SHOULD | English, Hindi and Gujarati across workspace, setup, console, anchor, content, history, settings and help; exact mandated compliance labels remain English; translations are not native-reviewed |
| Native-speaker-reviewed hi/gu sample packs | — | **Not built** | — | SHOULD | §18 forbids claiming hi/gu quality without a qualified reviewer |

## Deployment & ops

| Feature | Layer | Status | Evidence | Tier | Notes |
|---|---|---|---|---|---|
| **Worker deployed to Cloudflare** | ops | **Verified** | `https://cuepilot-api-production.cuepilot-api.workers.dev/v1/health` → 200, commit `7a1457a` | **MUST** | SQLite Durable Objects deployed with migration `v1` |
| **Frontend deployed to Firebase Hosting** | ops | **Verified** | `https://smart-anchor-stage-flow-system.web.app`; live anonymous sign-in | **MUST** | `firebase.json` and `deploy:web` are committed deployment inputs |
| **`GEMINI_API_KEY` as a Worker secret** | ops | **Verified** | `wrangler secret list` + production smoke run, 4/4 Gemini | **MUST** | Secret value is unreadable and absent from the repository |
| Production `ALLOWED_ORIGINS` / Authorized Domains | ops | **Verified** | hosted-origin request returned the exact CORS origin and authenticated UI loaded | **MUST** | Both Firebase Hosting domains are allowlisted |
| `deploy:api` script | ops | **Verified** | deployed `cuepilot-api-production`, version `bb56becc-bab7-434f-9f6c-fe91a5c4439b` | MUST | |
| Deployed measurements (repair latency, freshness, script time, Worker CPU) | ops | **Verified** | `docs/measurements.md`; 30 repair requests, 20 publication updates, 20 script attempts, live-tail CPU | **MUST** | All four pass; first repair batch was noisy and is retained as a repeatability warning |
| Cloudflare auth | ops | **Verified** | `wrangler whoami` → logged in, one account | MUST | |
| Firebase CLI | ops | **Verified** | Firebase CLI 15.30.2; Hosting release completed | MUST | Invoked through a pinned `npx` deploy command, not a repository dependency |
| Secret hygiene (full-history scan before every push) | ops | **Verified** | scan run before each of ~12 pushes; 189 blobs, all refs, clean | added-since | `.dev.vars`, `.env.local`, `firebase-config.txt` absent from all history |
| Local measurements recorded | docs | **Verified** | `docs/measurements.md` | added-since | Labelled as localhost, not passed off as deployed |
| CI pipeline | ops | **Verified** | `.github/workflows/ci.yml`; GitHub Actions run `35479175873` | added-since | Current Node 24 action versions passed install, check and production build in 54 s |

---

## Count by status

| Status | Count |
|---|---|
| **Verified** | 83 |
| **Implemented** | 0 |
| **Partial** | 1 |
| **Stubbed** | 0 |
| **Not built** | 1 |
| **Cut** | 1 |
| **Total** | 86 |

### MUST-tier completion

Of the **74 MUST-tier rows**: 73 Verified, 0 Implemented, 1 Partial, 0 Not built.

- **Product MUSTs: 66 of 66 are Verified, Implemented or Partial — none missing.**
- **Deployment MUSTs: 8 of 8 are Verified.**

So: **99% of MUST rows are Verified (73/74)**. §8's acceptance condition — *"Hosted frontend
reaches authenticated Worker, durable storage and one real Gemini response"* — is now proven
in production, and the deployed §18 performance sample is recorded.

---

## README issues found in the initial audit

Checked every row of the README's feature tables against the source.

1. **Resolved 2026-09-20: printable runbook verification.** The initial audit found only a
   `@media print` block. The e2e now produces a real A4 PDF; all two rendered pages were
   visually inspected after fixing header contrast and an otherwise blank third page.
2. **"Quality | … Playwright browser e2e | Complete"** — the e2e is real and it passes (I ran
   it: 1 test, 44.9 s). But it is **not part of `npm test`**, has **no `webServer` config**, and
   its default `baseURL` is `localhost:5173` while Vite falls back to `5174` whenever 5173 is
   taken. It passes only when someone has already started both servers on the right ports.
   "Complete" is defensible; "runs in CI" would not be.
3. The old **"Roughly 90–95%"** claim omitted deployment. It has been removed now that the
   production deployment is verified.
4. The milestone table originally omitted deployment. It now records the Firebase Hosting,
   Cloudflare Worker and production Gemini deployment.

No README row was found to be entirely fictional — every claimed feature exists in some form.
The mismatches are all **overstatement of completeness**, not invention.

## Code with no README coverage

These exist and work but a judge reading only the README would miss them:

1. **The break-drill methodology.** Atomicity and idempotency were each deliberately broken,
   observed failing *for the stated reason* via direct storage probes, then restored. One drill
   found a test that passed against a broken implementation. This is strong evidence of test
   quality and appears nowhere in the README.
2. **Reserved fact-id prefix enforcement.** A security fix; an organizer fact could previously
   impersonate a server-created record the model trusts. The README mentions it in passing
   inside a Setup row rather than as a security property.
3. **`actualTimeSource` provenance.** Recorded times carry which clock produced them, so a
   rehearsal timestamp can never be presented as a real observation.
4. **The mechanical "frontend never computes a schedule" guard.** An oxlint
   `no-restricted-imports` rule fails the build if `apps/web` imports the solver.
5. **Secret-scanning discipline.** Every push is preceded by a full-history scan across all
   refs. One real leak was caught and reported.
6. **`docs/measurements.md` and `docs/decisions.md`.** Real provider evidence in both
   directions, measured contrast, and ~60 recorded rulings with reasons. The README links to
   docs generally but does not surface that the AI claim rests on a dated, recorded run.
7. **The model substitution.** §7B's `gemini-2.5-flash-lite` is not callable; the deployed
   adapter uses `gemini-3.5-flash-lite`. The README's Stack table should say which model
   actually runs.

## Deployment status

**Production is live.**

- Frontend: `https://smart-anchor-stage-flow-system.web.app`
- API: `https://cuepilot-api-production.cuepilot-api.workers.dev`
- Health: 200 with build commit `7a1457a`
- Firebase anonymous sign-in: verified in the hosted app
- Hosted-origin CORS: verified against the Worker
- Gemini: 4/4 production drafts returned from `gemini-3.5-flash-lite`; one was approved

## The three biggest risks to the submission

1. **Repair latency has a cold/noisy-run warning.** The CPU-correlated 30-request batch passed
   at 377 ms p95, and three other repeat batches passed, but the first batch measured 2,335 ms
   p95. The raw fact is recorded rather than hidden; a larger geographically distributed run
   would be needed before claiming universally stable sub-500 ms latency.
2. **A formal screen-reader audit is still absent.** Keyboard traversal, focus restoration,
   reduced motion, non-colour status and live-region behavior now have automated evidence, but
   that is not equivalent to testing with VoiceOver, NVDA or another assistive reader.
3. **The README's roadmap contradicts §5 and §8 in a way a judge can catch.** Its two
   highest-priority roadmap items are an **AI voice anchor assistant** (speech-to-text) and an
   **AI speaker reminder agent** contacting speakers by *"WhatsApp / SMS / email, optional voice
   call"*. §8 lists speech-to-text voice commands, telephony check-in and automatic overrun
   detection under **"STRETCH / ROADMAP — do not build now"**, and §5 records an explicit
   decision: *"Phone-calling decision: NO for this 28-hour build"*, with reasons. Presenting
   telephony as a high-priority next step directly reverses a documented decision. Either
   re-frame those entries as the deliberate non-goals §5 says they are, or expect to defend the
   reversal in Q&A.
