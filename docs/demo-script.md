# Demo recording logistics

Written before the recording, not during it. §25 fixes the 180-second script; this file
records the things that will otherwise be discovered at hour 24.

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

## Beats that currently cannot be shot

| §25 beat | Seconds | Status |
|---|---|---|
| 27–42 s — Gemini introduction draft beside approved facts, approved on camera | 15 | **Not implemented.** Script proposals and the Gemini adapter are M5. §21 is explicit that a hardcoded response is not a substitute, so this beat needs the real pipeline. |
| 120–138 s — announcement published, anchor banner | 18 | **Not implemented.** Announcements are M5. |
| 138–153 s — forced AI failure with the template label | 15 | Depends on the beat above. |
| 153–170 s — app diagnostics with actual results | 17 | No diagnostics screen, and none is planned. §25 permits an architecture/test-evidence slide instead; feed it from `docs/measurements.md`. |

The anchor view shows an **Approved script** section with a placeholder until M5 lands, so
the beat has a visible home rather than a missing panel.

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
