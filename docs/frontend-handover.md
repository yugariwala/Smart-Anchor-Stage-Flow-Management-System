# CuePilot frontend handover

The complete page/API inventory and flow map are in [frontend-plan.md](frontend-plan.md). This work is frontend-only, with shared test/build configuration. The master report and follow-up brief were treated as product references, not instructions to fabricate unsupported server capabilities.

## Delivered

- Identity-scoped event workspace with real access checks, search/filter, IST dates, phase, published revision, start countdown, creation, invitation and open-by-ID flows. Event discovery is explicitly limited to this browser; there are no invented event cards.
- Draft setup preserves all approved facts and IDs, supports agenda ordering and constraints, validates before save, and protects unsaved edits. Fictional rehearsal data requires an explicit action.
- Organizer console with real publish/start/complete commands, rehearsal clock, recovery previews, feasibility explanation, expiry handling, explicit approval, anchor invitations and acknowledgments.
- Three-region stage overview: current person/pronunciation, current and next activity, large local countdown, actual/planned timing, finish constraints, published revision and freshness. Initials are used when no supported photo exists.
- Five-minute cue reminder on organizer and anchor views. Dismissal stays on the screen; recovery remains an organizer proposal followed by human approval. It performs no readiness write or schedule mutation.
- Scripts generate from the real service, show AI/template provenance and source facts, allow editing, require a human review acknowledgment, reject expired/missing-source approval in the UI, then publish through the approval API. Languages: English, Hindi, Gujarati, with unverified-language labeling.
- Human-written announcements publish and dismiss through the backend. Speakers/facts, immutable revision history/detail, settings and event deletion are complete pages.
- Firebase anonymous session, owner/anchor authorization boundaries, logout and cache cleanup; loading/empty/error/not-found states; stable request/key retries for unknown mutation outcomes; stale read-only published snapshots and reconnect handling.
- Responsive desktop/tablet/mobile layouts, accessible Radix dialogs, focus restoration, labels, keyboard navigation, restrained typography/color, reduced-motion support, and printable published runbook.

## Backend dependencies for the backend maintainer

The shapes below are proposals for coordination, **not implemented or called endpoints**. Existing API contracts remain unchanged.

### 1. Server event discovery

Suggested `GET /v1/events?cursor=<opaque>&limit=20`, Firebase bearer token. Response:

```ts
type EventListResponse = {
  items: Array<{
    id: string;
    name: string;
    startsAt: string;
    phase: "draft" | "running" | "ended";
    mode: "live" | "rehearsal";
    role: "owner" | "anchor";
    publishedRevision: number | null;
    expiresAt: string;
  }>;
  nextCursor: string | null;
  serverNow: string;
};
```

Only return memberships for the authenticated identity, omit expired/deleted events, and paginate deterministically. Without this, a cleared browser cannot rediscover events automatically. Current local shortcuts are genuine remembered events and individually access-checked. A list endpoint alone does not solve anonymous-account recovery.

### 2. Shared readiness

Suggested `POST /v1/events/:id/cues/:cueId/readiness`, bearer token plus `Idempotency-Key`, body `{ expectedRevision, readiness: "ready" | "not_ready" }`. Agree explicitly whether owner, anchor or both may respond. Return `{ cueId, readiness, actorUid, recordedAt, publishedRevision }`; expose the current response with the next published snapshot so existing polling can deliver it. The backend must define conflict/version semantics, whether a changed planned start resets readiness, and which reply wins when two people answer.

Without this contract, yes/no controls would falsely imply a shared operational state. The shipped local reminder does not do that. A readiness response must never publish a repair or generated copy automatically.

### 3. Dedicated stall-copy contract

Current script kinds are opening/introduction/transition/closing/announcement. There is no stall kind, safe duration bound, or readiness-to-script linkage. Decide whether an explicit stall kind or a documented existing-kind mapping is intended. Reuse script proposals and approval once that contract exists; any extension should carry cue linkage, approved fact IDs, language, expiry and provenance. Do not produce timestamps or automatically approve copy. Existing transition drafts can still be created manually in Scripts.

### 4. Speaker presentation metadata

Suggested optional `photoUrl?: string` and `role?: string` in the typed speaker contract and draft validation/publication. Define supported URL/storage rules and alt-text expectations. No photo upload service currently exists. The stage presentation adapter supports these optional values but the existing schema does not supply them; initials and actual pronunciation are the shipped behavior.

### Existing limitations

- Anonymous ownership has no permanent account/recovery API; signing out warns that access may be lost.
- Creation quota precedes idempotency replay, invitation plaintext is not reliably replayable after a lost response, and deletion has no replay ledger. The UI retains original mutation intent and explains unknown outcomes; fixing these semantics belongs in the backend.
- Structural/fact edits are draft-only. No live reorder, automatic deletion, rollback, SMS or calling.
- Snapshot caching works after the app loads. There is no installed offline application shell, so cold offline launch is not guaranteed.

## Run and verify

Install using `npm ci`. Configure `apps/web/.env.local` from `.env.example` and `apps/api/.dev.vars` from `.dev.vars.example`. Firebase anonymous authentication must be enabled. Keep provider secrets only in the backend configuration; never add them to Vite environment variables.

Run these in separate terminals:

```sh
npm run dev:api
npm run dev:web
```

The default UI is `http://localhost:5173`; the Worker uses `http://127.0.0.1:8787`. Backend allowed origins must include the actual frontend origin.

```sh
npm run check       # all workspace type checks, lint, domain/API/UI tests
npm run test:ui     # focused frontend behavioral tests
npm run test:e2e    # real Firebase + running local Worker + installed Chrome
npm run build      # production build for all configured workspaces
node apps/web/scripts/contrast.mjs
```

Browser tests create and delete a fictional event using separate organizer/anchor identities. They use actual APIs, including script generation (which may use the explicitly labeled template fallback), and consume normal development quotas. No production API response is mocked. Unit tests isolate transport behavior to verify retry, cache and error cases.

Verification on 19 September 2026: 308 tests pass via `npm run check` (including 25 frontend tests), with type checks and lint passing. The production build passes. All 30 measured contrast pairs pass. The real browser integration flow passes in 43.7 seconds, covering creation, setup, publication, invitation into a second identity, stage commands, readiness reminder dismissal, infeasible/feasible recovery, acknowledgment, script generation/review/approval, announcement delivery/dismissal, history, responsive overflow, keyboard dialog focus, offline/reconnect, print content, deletion/revoked access, mobile logout and cache cleanup. Desktop, tablet and mobile screenshots were visually inspected; screenshots are written to ignored `apps/web/test-results/`.
