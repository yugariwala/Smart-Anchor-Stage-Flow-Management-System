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
- **Not Hindi or Gujarati quality.** The four recorded drafts are English. Any hi/gu output
  must carry "generated; language quality unverified" until a qualified reviewer sees it
  (§18), and the templates already attach that warning automatically.
- **Not latency.** These runs were not timed. The §18 script-response target (12 s) remains
  NOT YET MEASURED.
- **Not a rate-limit measurement.** One run of four requests says nothing about quotas.

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

## NOT YET MEASURED

These are the §18 targets. They are targets, not results, and stay in this section until a
real sample exists.

| Metric | Target | Planned method | Status |
|---|---|---|---|
| Repair latency, p95 end-to-end on the six-cue fixture | < 500 ms | 30 deployed requests; record browser-to-response and server timing separately | **NOT YET MEASURED** (H19) |
| Worker CPU per request (JWT verify + routing) | must fit the 10 ms free-plan limit | Sample the deployed Worker; separate verify from routing | **NOT YET MEASURED** (H19) |
| Publication freshness, p95 | ≤ 3 s on healthy visible tabs | 20 publishes between two sessions, same event revision | **NOT YET MEASURED** |
| Script response time | valid draft or explicit fallback within 12 s | 20 attempts; report success and fallback counts separately | **NOT YET MEASURED** — two runs of four completed well inside the deadline but were not timed |
| Script faithfulness | zero unsupported claims in the reviewed sample | human review of ≥12 drafts; state reviewer language competence | **NOT YET MEASURED** — 4 English drafts reviewed so far, target is ≥12 across kinds and languages |
| Judge usability | first repair within five minutes | external testers; report the actual count, imply no study | **NOT YET MEASURED** |
| Cost | ₹0 during build and demo | billing configuration and usage dashboard check | **NOT YET MEASURED** |
