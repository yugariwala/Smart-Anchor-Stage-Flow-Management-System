# Measurements

**Nothing in this file is an estimate.** Every number is either a recorded measurement with
its method and sample count, or an explicit `NOT YET MEASURED` placeholder. A figure that
could be mistaken for a measurement must not appear here until it has been measured.

## Recorded

### Test suite (2026-09-19)

| What | Value | Method |
|---|---|---|
| Domain tests | 124 passing | `npm test`, node pool |
| API tests | 59 passing | `npm test`, `@cloudflare/vitest-pool-workers` in real workerd |
| Brute-force corpus | 80 cases, seed `0x5c0eb17a`: 36 feasible, 44 infeasible, 25 requiring compression, 32 with a unique optimum | `packages/domain/test/bruteforce.test.ts` |
| Solver candidate transitions, upper bound | 289,200 under the §7A caps (20 cues × 241 end minutes × 60 durations) | Arithmetic from the documented caps, not a timing measurement |

### Local `wrangler dev` round-trip (2026-09-19)

Verified against the real Firebase project with a genuine anonymous ID token, so Google's
live JWKS was actually fetched and the signature actually checked.

| Step | Result |
|---|---|
| `GET /v1/health` | `200 {ok:true, buildCommit:"dev"}` |
| Unauthenticated event read | `401 UNAUTHENTICATED` |
| Authenticated read of an absent event | `404` (token verified, event absent) |
| `PUT /v1/events/{uuid}` | `201`, revision 1, phase `draft`, no published pointer |
| `PUT /v1/events/{id}/draft` | `200`, revision 2, server-computed intervals `[0,5] [5,25] [25,35] [35,45] [45,55] [55,60]` |
| `POST /v1/events/{id}/publish` | `200`, revision 3 **and** publishedRevision 3 |
| `GET /published?afterRevision=2` | `200`, `X-Server-Now` present |
| `GET /published?afterRevision=3` | `204`, `X-Server-Now` present |
| Publish replayed with the same Idempotency-Key | `200`, identical body, applied once |
| Same key, different body | `409 IDEMPOTENCY_MISMATCH` |
| Revision list | `[(3, publish), (2, draft), (1, create)]` |

### AI script generation, real provider (2026-09-19)

Run with `node apps/api/scripts/smoke-gemini.mjs` against a local `wrangler dev` holding the
real `GEMINI_API_KEY`. It drives the deployed endpoint, so quota admission, the in-flight
lease, the §7B prompt, structured output, schema validation and fact-reference checking are
all exercised — not just the provider.

**Model substitution, recorded because §7B names a different one.** `gemini-2.5-flash-lite`
returned `404` with the provider's own explanation:

> "This model models/gemini-2.5-flash-lite is no longer available to new users. Please update
> your code to use models/gemini-3.5-flash-lite for the latest features and improvements."

`ListModels` on this key confirms `gemini-2.5-flash-lite` is listed but not callable, while
`gemini-3.5-flash-lite` is both. §7B anticipated this: *"Use Gemini 2.5 Flash-Lite if
available in the team's project at H1 ... Availability and quotas must be checked in the
actual project; do not spend hours switching models."* `GEMINI_MODEL` is now
`gemini-3.5-flash-lite`. **Any claim about the model must name 3.5-flash-lite, not 2.5.**

| Run | Date (UTC) | Model | Result |
|---|---|---|---|
| Production success | 2026-09-19T18:20:44Z | `gemini-3.5-flash-lite` | **4 of 4** drafts came from the deployed model, all schema-valid; opening approved |
| Success | 2026-09-19T12:17:11Z | `gemini-3.5-flash-lite` | **4 of 4** drafts came from the model, all schema-valid |
| Forced failure | 2026-09-19T12:15:08Z | `gemini-2.5-flash-lite` (404) | **0 of 4** from the model; 4 of 4 fell back to a labelled template, `fallbackReason: "provider returned 404"` |

#### Success run, all four required kinds

Every draft was schema-valid, and every `usedFactIds` entry resolved to a fact the server had
actually supplied — no fabricated references in this sample of four.

| Kind | HTTP | Source | usedFactIds |
|---|---|---|---|
| opening | 201 | `gemini` | `event:name`, `f-event-1` |
| introduction | 201 | `gemini` | `event:name`, `f-event-1`, `speaker:spk-mehta:name`, `f-mehta-1`, `f-mehta-2` |
| transition | 201 | `gemini` | `event:name`, `f-event-1`, `speaker:spk-mehta:name`, `f-mehta-1`, `f-mehta-2` |
| closing | 201 | `gemini` | `event:name`, `f-event-1` |

The `opening` draft was **approved through the real endpoint** and landed in the published
snapshot, so the full generate → review → approve → publish round trip is proven, not just the
provider call.

The production run used `https://cuepilot-api-production.cuepilot-api.workers.dev/v1`, a real
anonymous Firebase identity, Cloudflare Durable Objects and the Worker secret. The deployed
event was `67386070-1652-4640-bfce-c34c43f89da1`; no credential was printed by the runner.

Sample output (`introduction`, verbatim):

> "Welcome everyone to Gemini smoke test, the college technology festival inaugural session.
> We are thrilled to begin with our keynote speaker Dr. Ananya Mehta, who heads the Applied
> Systems Lab at a fictional institute, speaking on scheduling under real-world constraints."

No operational time appears in any of the four bodies, which is what §7B requires; the time
detector raised no warning on this sample.

#### Forced-failure run

The 404 run is a genuine failure test, not a simulation: the provider really refused. All four
requests still returned `201` with a deterministic template labelled
**"Template fallback — AI unavailable."**, and the `opening` was still approved and published.
Event operation was unaffected by the provider being unusable.

`fallbackReason` is carried on every proposal so the UI and this record can state *why* a
template was used. **A template is never reported as an AI success.**

#### What this evidence does NOT establish

- **Not faithfulness.** Schema validity and resolvable fact ids do not prove the words are
  true to the facts (§7B). Human review remains the gate; these four were read by one
  reviewer and are fictional content throughout.
- **Not Hindi or Gujarati quality.** The production timing sample exercised every required
  kind/language combination, but response success is not a language review. Any hi/gu output
  must carry "generated; language quality unverified" until a qualified reviewer sees it
  (§18), and the templates already attach that warning automatically.
- **Not a rate-limit measurement.** One run of four requests says nothing about quotas.

### Deployed release gates (2026-09-19 UTC)

`npm run measure:production` used real anonymous Firebase identities, disposable six-cue
rehearsal events, the deployed Worker and its production Gemini secret. It prints no token,
invite code or generated body. Percentiles use the nearest-rank method.

| Metric | Sample | Result | Target | Outcome |
|---|---:|---:|---:|---|
| Repair client round-trip | 30 previews | min 186 ms; p50 231 ms; **p95 377 ms**; max 433 ms | p95 < 500 ms | **Pass** |
| Worker CPU, top-level request | same 30 previews | p95 2 ms; max 2 ms | < 10 ms/invocation | **Pass** |
| `EventRoom` CPU, repair RPC | same 30 previews | p95 3 ms; max 3 ms | < 10 ms/invocation | **Pass** |
| Combined Worker + `EventRoom` CPU | paired same 30 previews | **p95 4 ms; max 5 ms** | < 10 ms/request | **Pass** |
| Publication freshness, send → visible | 20 updates, two identities, 2 s polling | min 389 ms; p50 1,221 ms; **p95 2,033 ms**; max 2,099 ms | p95 ≤ 3 s | **Pass** |
| Publication freshness, owner response → visible | same 20 updates | min 286 ms; p50 1,076 ms; **p95 1,929 ms**; max 1,985 ms | informational | — |
| Script response, all sources | 20 attempts | min 392 ms; p50 1,125 ms; **p95 2,064 ms**; max 2,102 ms | ≤ 12 s | **Pass** |
| Script response, Gemini only | 17 attempts | min 991 ms; p50 1,228 ms; p95/max 2,102 ms | ≤ 12 s | **Pass** |
| Script response, labelled fallback | 3 attempts | min 392 ms; p50 752 ms; p95/max 811 ms | ≤ 12 s | **Pass** |

The 20 script attempts covered all 12 combinations of opening, introduction, transition and
closing with `en`, `hi` and `gu`. Seventeen returned from `gemini-3.5-flash-lite`; three
returned the labelled deterministic template. This establishes availability and response
time, not language faithfulness.

Cloudflare live-tail telemetry supplied `cpuTime` separately for the top-level Worker and the
`EventRoom` Durable Object. Pairing the two invocations for each request gives the combined
figures above. JWT verification and routing both occur in the top-level figure; the platform
does not split them into independent timers.

The API does not emit `Server-Timing`, so server execution cannot be derived from HTTP headers.
Cloudflare CPU telemetry is the server-side measurement; client round-trip is recorded
separately as required.

#### Repeatability note

Four additional 30-request repair batches produced p95 values of 2,335 ms, 342 ms, 288 ms and
137 ms. The initial cold/noisy batch failed the 500 ms target; all four immediate repeats
passed. The release-gate row uses the final batch correlated with CPU telemetry, but the first
batch is retained here because a single warm result must not be presented as universal latency.

### Contrast, re-measured against the shipped palette (2026-09-19)

`node apps/web/scripts/contrast.mjs` reads the custom properties out of
`apps/web/src/styles.css` and computes WCAG 2.2 ratios, so the numbers track whatever is
actually shipping. The palette changed to teal/sage in the frontend rebuild, so the M4 figures
are superseded — for example the primary fill moved from `#103d66` to `#176b55`.

**All 23 pairs pass.** Tightest margins:

| Pair | Colours | Ratio | Needs |
|---|---|---|---|
| Control border on card (UI component) | `#85958e` on `#ffffff` | **3.14:1** | 3:1 |
| Focus ring on page (UI component) | `#087458` on `#f7f9f8` | 5.44:1 | 3:1 |
| Console muted text / table header | `#5b6d64` on `#ffffff` | 5.50:1 | 4.5:1 |
| Primary button label, status chip info | `#176b55` on `#e5f2eb` | 5.57:1 | 4.5:1 |
| Status chip: bad | `#a62b37` on `#fde9ec` | 5.97:1 | 4.5:1 |
| Rehearsal banner, status chip warn | `#795110` on `#fff3d9` | 6.36:1 | 4.5:1 |

The anchor view's dark palette is comfortable throughout: body text 13.17:1 on its surface and
15.96:1 on the page background.

**Scope of this measurement.** It covers the tokens in our stylesheet, which is what our own
markup uses. It does **not** cover Radix Themes' built-in component palettes
(`accentColor="teal"`, `grayColor="sage"`), which ship their own colours; those have not been
measured here. As §20 says, none of this amounts to a formal accessibility certification.

### Browser accessibility and print verification (2026-09-20)

The complete organizer-and-anchor Playwright rehearsal passed against the hosted app and again
against the local build containing the final print fixes.

| Check | Evidence |
|---|---|
| Reduced motion | Chromium emulated `prefers-reduced-motion: reduce`; computed values were `animation-name: none`, `transition-duration: 0s`, `scroll-behavior: auto` |
| Interface language | Hosted UI checked Hindi and Gujarati `lang` + navigation copy, preserved Hindi across reload, then restored English |
| Keyboard skip path | Repeated Tab traversal reached `Skip to content`; Enter moved focus to `#main-content` |
| Dialog focus | Escape closed the mobile navigation dialog and restored focus to its opener |
| Print visibility | Interactive controls were hidden; complete agenda, approved host copy, pronunciation and facts were visible |
| PDF output | Playwright generated a 2-page A4 PDF; Poppler rendered both pages for visual inspection |

The visual pass found and fixed an unreadable agenda header and a footer that created an
otherwise blank third page. The final two-page rendering has no clipped text, overlap or stray
background region. This is browser and visual evidence, not a formal screen-reader audit.

### Full-interface localisation verification (2026-09-20)

The English/Hindi/Gujarati selector now applies to page content and controls across the workspace,
setup, organizer console, anchor runbook, speaker/script/announcement/history/settings pages and
Help—not only the global navigation. A local full-rehearsal Playwright run passed in Chrome in
41.6 seconds, including Hindi reload persistence and Hindi/Gujarati workspace heading and
description assertions. The full Vitest suite passed 332 tests, including interpolation, fallback
and representative page-copy checks in `apps/web/test/i18n.test.ts`.

This verifies application behavior and translation coverage, not linguistic quality. Hindi and
Gujarati translations have not been reviewed by qualified native speakers, and no such quality
claim is made. Exact English compliance labels required by the product specification remain
unchanged deliberately.

## NOT YET MEASURED

These §18 targets still require evidence.

| Metric | Target | Planned method | Status |
|---|---|---|---|
| Script faithfulness | zero unsupported claims in the reviewed sample | human review of ≥12 drafts; state reviewer language competence | **NOT YET MEASURED** — 4 English drafts reviewed so far, target is ≥12 across kinds and languages |
| Judge usability | first repair within five minutes | external testers; report the actual count, imply no study | **NOT YET MEASURED** |
| Cost | ₹0 during build and demo | billing configuration and usage dashboard check | **NOT YET MEASURED** |
