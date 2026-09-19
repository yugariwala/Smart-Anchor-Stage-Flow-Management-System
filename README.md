# CuePilot

**Constraint-aware live-event schedule repair.** When a segment overruns, CuePilot calculates a
feasible plan that protects fixed commitments and the hard finish, explains it, and publishes one
approved revision to every screen at once — or refuses, with the shortage quantified.

This repository is the implementation for the *Smart Anchor / Stage Flow Management System*
problem statement.

## What it does

- **Repairs a running schedule.** Given an overrun, `repairSchedule` is a pure, deterministic
  bounded-DP solver that produces a feasible plan (or proves infeasibility and quantifies the
  shortfall) while protecting fixed cues and the hard finish.
- **Keeps the backend authoritative.** All scheduling rules live in `packages/domain`; the
  Cloudflare Worker is the final authority. The frontend only renders what the server published.
- **Publishes one immutable revision at a time.** Organizer and anchor screens converge on the
  same revision number via short-interval polling; every mutation is guarded by
  `expectedRevision` + `Idempotency-Key`.
- **Uses the LLM only for prose.** Gemini drafts scripts and announcements as structured output;
  it never produces timestamps and has no publish/delete/network tool. A deterministic template
  fallback is always available and labelled as such.
- **Records reality, flags the conflict.** A cue completion that violates the plan is still
  recorded, with `scheduleHealth: "needs_repair"`.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript + Vite, on Firebase Hosting |
| Styling | Plain CSS / known utility library, Radix Themes |
| Validation | Zod shared schemas in `packages/domain` |
| Backend | Cloudflare Worker, small explicit router |
| Database / concurrency | SQLite-backed Durable Objects (`EventRoom` per event, one shared `QuotaRoom`) |
| Auth | Firebase anonymous auth; ID tokens verified on the Worker via Google public JWKS |
| AI | Gemini 3.5 Flash-Lite via a server-side adapter, structured output |
| Testing | Vitest (domain on node, API in real `workerd`), Playwright for browser e2e |

## Repository layout

```
apps/
  api/      Cloudflare Worker: router, Durable Objects, auth, AI adapter
  web/      React + Vite frontend: organizer console, anchor view, setup
packages/
  domain/   Shared Zod schemas, types, and the deterministic repair solver
tests/
  api/      Worker integration tests (real workerd)
docs/       Decisions log, demo script, measurements, frontend plans
fixtures/   Seed scenarios used by tests and the rehearsal
```

`CLAUDE.md` records the non-negotiable invariants, the pinned `@cloudflare/vitest-pool-workers`
version, and the milestone status. `PS5-CuePilot-Master-Report.md` is the authoritative spec.

## Getting started

```bash
npm ci                 # install from the committed lockfile
npm run dev:api        # wrangler dev on http://127.0.0.1:8787
npm run dev:web        # vite on http://localhost:5173
```

`apps/api/.dev.vars` is required for `wrangler dev` and is gitignored. Copy
`apps/api/.dev.vars.example` and fill it in. `GEMINI_API_KEY` is a Worker secret, set with
`npx wrangler secret put GEMINI_API_KEY`, and must never be committed.

## Commands

```bash
npm run typecheck   # tsc --noEmit in every workspace
npm run lint        # oxlint; enforces that the frontend never computes a schedule
npm test            # vitest run: domain on node, API in real workerd
npm run test:e2e    # Playwright browser suite
npm run check       # typecheck + lint + test
npm run build       # every workspace
npm run deploy:api  # wrangler deploy
```

> Do **not** run `npm audit fix --force`. It downgrades `@cloudflare/vitest-pool-workers` and
> takes the test suite offline; see `CLAUDE.md` for the full rationale.

## Documentation

- `PS5-CuePilot-Master-Report.md` — authoritative specification
- `CLAUDE.md` — invariants, stack, milestone status, commands
- `docs/decisions.md` — decisions that extend or interpret the spec
- `docs/demo-script.md` — demo recording logistics and beat status
- `docs/measurements.md` — real provider evidence and measurements
