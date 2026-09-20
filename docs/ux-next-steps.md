# What we'd do next

Recorded during the 2026-09-20 UI polish pass. Everything here was **found by walking the
product as four personas**, not guessed at. Each item was deliberately not built because it
needs a layout change, a new component or a new control — and the freeze was for copy and
feedback states only. They are ordered by how much confusion they cause.

The audit that produced them is `docs/ux-audit.md`; before/after screenshots are in
`docs/ux-screens/` and `docs/ux-screens-after/`.

## High — a first-time organizer hits these in the first five minutes

**1. Two agenda fields are still raw minute offsets.**
`Speaker not available until` and `Must start exactly at` take "minutes after the event
starts". The event's own finish time was converted to a clock picker in this pass, and the
same helpers (`offsetToClock` / `clockToOffset`) are already in `SetupScreen.tsx` ready to
reuse. What stops it being a one-line change is the null state: both fields mean "not set",
and an HTML `<time>` input has no clear affordance for that, so it needs a small
set/unset control. *Mitigated now:* the resulting clock time is shown beside the field
whenever a value is present, and both live under `Advanced timing rules`.

**2. Rehearsal vs live is a sentence fragment, not a control.**
The mode decides whether the clock is yours to move or the server's, and it currently reads
as `Mode: rehearsal.` at the tail of a helper line. It wants a labelled two-option control
with a one-line explanation of each. New control, so deferred.

**3. The sidebar offers eight event links before there is anything to see.**
`Stage console`, `Host scripts`, `Announcements`, `Revision history` and `Anchor view` are
all dead ends until the runbook is published. They should be grouped under something like
*After you publish*, or disabled with the reason stated. Navigation restructure.

## Medium — costs an anchor or a judge time, not correctness

**4. The anchor's first screen is still half chrome.**
Hamburger, breadcrumb, language select, help, the rehearsal banner, `ANCHOR RUNBOOK`, the
event title and three unlabelled icon buttons all precede the first piece of content. The
countdown was rescued in this pass by reordering the stack; the chrome above it still wants
collapsing, and the three icon buttons (refresh / runbook / fullscreen) want visible labels
or a move into the menu.

**5. "Is this current?" takes longer than half a second.**
The freshness chip sits at the top of the anchor view while the eye is on the countdown
lower down. A second chip *was* rendered next to the countdown, but it was an accidental
duplicate of the same words and was removed. Putting a deliberate freshness cue inside the
countdown block — a subdued "as of 10:42" under the digits — is a layout decision worth
making on purpose rather than by accident.

**6. Acknowledgement is reassurance delivered as a list row.**
The organizer learns the anchor has the update by reading `version 9 at 10:42` in a card.
The moment deserves to arrive, not to be looked up: a transient "Your anchor has version 9"
line, the same shape as the new publish confirmation. Needs the ack poll to diff against the
previous response, which is state, not copy.

**7. One success pattern instead of two.**
Publishing and approving a recovery plan now show an explicit confirmation banner.
Announcements and script approval still rely on the item appearing in a list — a real
outcome, but a different one. A single `CommandNotice` success variant would make all four
behave the same.

**8. The console wastes its bottom-left quadrant.**
On a wide desktop the agenda table ends well above the right rail, leaving a large empty
area. Nothing is broken; it simply looks unfinished next to the rest of the screen.

**9. `Planned / shortest` may not belong on the console at all.**
It now carries its unit, but during a live event the organizer is not making compression
decisions — the recovery dialog is where those numbers matter. Worth testing with the column
removed.

## Lower — real, but nobody is blocked

**10. No formal screen-reader audit.**
Keyboard traversal, focus restoration, reduced motion and non-colour status all have
automated evidence, and no interactive target on the anchor phone is under 44×44. None of
that is the same as sitting down with NVDA or VoiceOver.

**11. `npm run test:e2e` does not run from a clean checkout.**
`playwright.config.ts` has no `webServer` block, so the suite needs two servers already
running or `CUEPILOT_E2E_URL` pointing at a deployed build. It passes in both of those
cases; a judge cloning the repo and running the script gets a failure.

**12. Hindi and Gujarati interface copy is not native-reviewed.**
The chrome is translated and the language switch is verified end to end, but §18 forbids
claiming quality without a qualified reviewer, so it stays labelled as generated.


---

## Status — implemented 2026-09-20

Ten of the twelve are now built. The two that remain need a person, not a commit.

| # | Item | Outcome |
|:--:|---|---|
| 1 | Raw minute offsets | **Done.** `Speaker not available until` and `Must start exactly at` are clock pickers with an explicit `Clear`, since "not set" is a real answer. An inline warning appears if the time lands after the event must finish. |
| 2 | Rehearsal vs live control | **Done, differently.** §12 restricts `config` to name/start/finish, so mode genuinely cannot change after creation — a control there would have been a lie. The setup screen now states the mode, explains what it means, and says it is fixed. The creation dialog already offered the choice. |
| 3 | Sidebar dead ends | **Done.** Eight flat links became three groups: *Prepare*, *Run the show*, *Afterwards*. Ordering, not disabling — the Shell has no publication state to disable against. |
| 4 | Anchor icon buttons | **Done.** `Refresh`, `Print` and `Full screen` now carry visible labels, and the accessible name matches what is on screen. |
| 5 | "Is this current?" | **Done.** An `Updated 10:42:06` line sits under the countdown, in words rather than a colour, fed by the poll's own `lastSyncAt`. |
| 6 | Acknowledgement as a list row | **Done.** A newly arrived acknowledgement announces itself: *"Your anchor has version 9."* |
| 7 | Two success patterns | **Done.** `CommandNotice` gained an `okMessage`, so announcements and script publishing confirm exactly like the console. |
| 8 | Console's empty quadrant | **Attempted, backed out, then solved differently.** Stretching the agenda card to the rail's height produced ~640px of empty space inside a bordered card — more conspicuous than the plain gap. Reverted. The gap is now smaller because the rail is shorter: the scenario-clock explanation, read once and then never again, moved behind a `What is this?` disclosure. |
| 9 | `Planned / shortest` on the console | **Done.** Dropped; those numbers live in the recovery dialog where decisions about them are made. |
| 10 | Screen-reader audit | **Not done — needs a person.** Automated evidence exists for keyboard, focus, reduced motion and target size. None of it substitutes for NVDA or VoiceOver. |
| 11 | `test:e2e` from a clean checkout | **Done.** `playwright.config.ts` starts both servers when `CUEPILOT_E2E_URL` is unset, and reuses them when they are already up. Verified by killing both servers and running `npm run test:e2e` — one test, passed. Still needs `apps/api/.dev.vars`, because the Worker verifies a real Firebase token. |
| 12 | Native hi/gu review | **Not done — needs a reviewer.** Copy stays labelled as generated, per §18. |

### Bugs found while building these

- **The first acknowledgement was swallowed.** The new arrival notice treated "no baseline yet" as "already seen", so the very first acknowledgement — the one that matters most — announced nothing. It now records the on-open state as the baseline, including when that state is *nothing*.
- **Numeric bounds were described as text.** Zod reuses the `Too big` / `Too small` shape for strings and numbers, so a clock field past the 240-minute horizon would have been reported as *"that text is too long — keep it under 240 characters"*. Split by type, with tests for both.
- **A stretched card looked worse than the gap it filled.** Not a defect in the usual sense, but it only showed up in an after-screenshot of a real six-session event. Recorded here because the fix that looked obvious on paper was the wrong one.
- **The script screen would have claimed a publish on every draft.** Generation and approval share one command, so a blanket success message would have said "Script published" after merely generating a draft. Gated on the draft being closed.
