# Demo recording logistics

Written before the recording, not during it. §25 fixes the 180-second script; this file
records the things that will otherwise be discovered at hour 24.

## Automated rehearsal capture (2026-09-20)

The hosted Playwright rehearsal can record both views by setting
`CUEPILOT_E2E_VIDEO=1`. The verified run completed without browser or console errors and
produced:

- `artifacts/cuepilot-organizer-rehearsal.webm` — 53.2 s, 800×554, 2.7 MB.
- `artifacts/cuepilot-anchor-rehearsal.webm` — 43.16 s, 390×844, 957 KB.

Playwright's FFmpeg read both files and extracted representative frames; the repair-preview
and portrait anchor frames were visually inspected. These are silent QA walkthroughs of the
real hosted workflow, not substitutes for the edited and narrated 180-second §25 submission.
The `artifacts/` directory is intentionally gitignored so binary takes do not bloat the source
repository.

```sh
CUEPILOT_E2E_VIDEO=1 \
CUEPILOT_E2E_URL=https://smart-anchor-stage-flow-system.web.app \
npm run test:e2e
```

## Two pre-seeded events, not a raised cap

§25 needs two scenarios: **+12** (feasible, beat 55–75 s) and **+19** (infeasible, beat
100–120 s). They cannot be the same event, because the +12 has already been approved by then
and the rehearsal clock only moves forward — there is no way to rewind to a clean state.

The per-identity cap is **two new events per UTC day** (§12). That is exactly enough, and it
is why the cap stays where it is:

- Raising it for the recording would make the demo's capacity limits something other than
  what the deployed system enforces, and that is hard to describe honestly afterwards.
- §12 treats the cap as a demo-integrity feature, not an inconvenience.

**Therefore: seed both events before recording starts, on the same identity, and do not
create anything else with that identity that day.**

```
Event A  "+12 feasible"    -> drive to active keynote, stop. Record beats 42-100 s here.
Event B  "+19 infeasible"  -> drive to active keynote, stop. Record beats 100-120 s here.
```

Driving each to "keynote active at scenario minute 25" takes: publish, start opening,
clock +5, complete opening, start keynote, clock +20. Six commands, all from the console.

If a third event is genuinely needed, use a **different browser profile** (a different
anonymous identity), not a raised cap. The project-wide cap of 100/day leaves room.

## The second identity needs a separate browser profile

Beat 42–55 s is a split view of organizer and anchor. Two tabs in the **same** profile share
one anonymous Firebase identity, so the "anchor" tab would actually be the owner and would
prove nothing.

Use one of:

- an **incognito window** (separate storage, therefore a separate anonymous uid), or
- a **second Chrome profile**, or
- a second physical device.

The organizer's console has an **Invite an anchor** action. It shows the single-use link
exactly once; the secret rides in the URL fragment and never reaches the server. Open that
link in the other profile.

Verified on 2026-09-19: a genuinely separate anonymous identity
(`QFmg8rYf…`, distinct from the owner `dNNOX03x…`) joined via the invitation, read the
published snapshot, acknowledged revision 9, then acknowledged revision 10 after the +12 was
approved. The console showed it first as **behind revision 9**, then as **current
revision 10**.

## Beat status after Milestone 5

| §25 beat | Seconds | Status |
|---|---|---|
| 0–12 s — agenda with the fixed sponsor slot | 12 | **shootable** |
| 12–27 s — setup: six cues, facts, minimums, fixed start | 15 | **shootable** (Setup page, "Load scenario") |
| 27–42 s — Gemini draft beside approved facts, approved on camera | 15 | **shootable** — real drafts verified 2026-09-19, model `gemini-3.5-flash-lite` |
| 42–55 s — organizer and anchor side by side, keynote active | 13 | **shootable**, needs a second browser profile |
| 55–75 s — enter +12, repair preview with before/after | 20 | **shootable** |
| 75–100 s — **money shot**: approve, anchor updates and acknowledges | 25 | **shootable**, verified live in M4 |
| 100–120 s — +19, Publish disabled, seven-minute shortage | 20 | **shootable**, needs the second seeded event |
| 120–138 s — announcement published, anchor banner | 18 | **shootable** — verified end to end in a browser 2026-09-19 |
| 138–153 s — forced AI failure with the template label | 15 | **shootable** — a real provider 404 produced four labelled template fallbacks; set `AI_ENABLED=false` for a deterministic take |
| 153–170 s — architecture / test-evidence slide | 17 | **shootable as a slide**, fed by `docs/measurements.md`. There is no diagnostics screen and none is planned. |
| 170–180 s — name, links, closing | 10 | **shootable** |

**All eleven beats are now implementable.** Two carry conditions rather than code gaps: the
split view needs a second browser profile, and the +19 beat needs the second pre-seeded event.

### Labelling the AI beat honestly

- The model is **`gemini-3.5-flash-lite`**, not the 2.5 named in §7B. Say the real one.
  §7B's own instruction was to check availability in the actual project.
- The draft shown on camera must be a **real** one. If the provider is down on the day, show a
  previously captured real request with its date and disclose the limitation (§25). Do not
  substitute a hardcoded response.
- If a failure is injected for the 138–153 s beat, label it **"Failure test."** on screen.
- A template is **not** an AI success. The UI already says which pipeline produced the words,
  and the narration must match it.

## Recording order that minimises risk

1. Seed Event A and Event B **before** opening the recorder.
2. Open the anchor in the second profile and join Event A. Confirm it shows revision N.
3. Record 0–27 s (agenda, setup) from Event A's setup screen.
4. Record 42–100 s: split view, enter +12, preview, approve, anchor updates and acknowledges.
5. Switch to Event B for 100–120 s: enter the delay that puts the forecast at minute 44 and
   show the refusal with Publish disabled.
6. Record the offline state last: stop the Worker, show the
   `Offline snapshot · revision N · last synced HH:MM:SS. Updates paused.` label, restart.

## Things to keep visible

- The `REHEARSAL · fictional event and speakers · scenario clock.` header, at all times.
- `Calculated from this scenario by the scheduling engine.` on the repair panel.
- The revision number on both screens during the publication beat, so the viewer can see the
  same number appear in two places.

## Things never to imply

- That a cut between actions is a latency measurement. §25 allows cuts; it does not allow
  presenting one as a timing result.
- That an acknowledgement means the anchor spoke the words. It confirms receipt only, and the
  anchor view says so on screen.
- That the scenario clock is a real clock. Recorded actual times carry
  `actualTimeSource: "rehearsal_clock"` precisely so this cannot be blurred.
