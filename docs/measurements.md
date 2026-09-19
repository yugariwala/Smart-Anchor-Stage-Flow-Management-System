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

## NOT YET MEASURED

These are the §18 targets. They are targets, not results, and stay in this section until a
real sample exists.

| Metric | Target | Planned method | Status |
|---|---|---|---|
| Repair latency, p95 end-to-end on the six-cue fixture | < 500 ms | 30 deployed requests; record browser-to-response and server timing separately | **NOT YET MEASURED** (H19) |
| Worker CPU per request (JWT verify + routing) | must fit the 10 ms free-plan limit | Sample the deployed Worker; separate verify from routing | **NOT YET MEASURED** (H19) |
| Publication freshness, p95 | ≤ 3 s on healthy visible tabs | 20 publishes between two sessions, same event revision | **NOT YET MEASURED** |
| Script response time | valid draft or explicit fallback within 12 s | 20 attempts; report success and fallback counts separately | **NOT YET MEASURED** (M4) |
| Script faithfulness | zero unsupported claims in the reviewed sample | human review of ≥12 drafts; state reviewer language competence | **NOT YET MEASURED** (M4) |
| Judge usability | first repair within five minutes | external testers; report the actual count, imply no study | **NOT YET MEASURED** |
| Cost | ₹0 during build and demo | billing configuration and usage dashboard check | **NOT YET MEASURED** |
