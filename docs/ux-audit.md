# UX audit by real usage

**Date:** 2026-09-20 · **Target:** `https://smart-anchor-stage-flow-system.web.app` (production,
commit `b651db1`) · **Method:** scripted Playwright walkthrough, real anonymous Firebase
identity, real Cloudflare Worker, real Durable Object storage. No mocks.

Screenshots: `docs/ux-screens/`. Raw measurements: `docs/ux-notes.json`, `docs/ux-coldload.json`.

This is a usability report, not a code review. **Nothing here proposes removing a feature.**
Every finding is about naming, ordering, grouping or defaults.

## What this audit is not allowed to touch

§11 compliance text stays verbatim and is excluded from every recommendation below:

- `REHEARSAL · fictional event and speakers · scenario clock.`
- `Calculated from this scenario by the scheduling engine.`
- `AI-generated draft — human review required.`
- `Template fallback — AI unavailable.`
- `Offline snapshot · revision N · last synced HH:MM:SS. Updates paused.`

All five render correctly in the live app and are cited as *passing* in the tables, not as
findings.

## Headline

The product is in much better shape than a jargon audit usually finds. The empty states are
written, the landing page explains itself, the refusal path is honest, and the anchor view is a
genuinely good dark, large-type, backstage screen. **Four of the ten top fixes are one-word or
one-sentence swaps.**

The three things that actually cost a naive user time are:

1. **A 3.7-second blank skeleton on every cold load**, showing `Restoring your secure session…`
   to someone who has never had a session.
2. **Eight fields per agenda item**, six of them solver constraints, all at equal visual weight
   with no "Advanced" grouping — even though four of them are already pre-filled with workable
   defaults that nothing tells the user they can leave alone.
3. **Status chips that contradict each other** — `Live` next to `draft`, and `revision 8` next
   to `Live · revision 8`, on the same row.

---

## Task 1 — Four walkthroughs, in character

Confusion score: **1** = noticed nothing, **5** = stopped, could not proceed without asking
someone.

### Persona A — first-time organizer, 20 minutes before her event

Screens: `A01`–`A10`.

| # | Step | What she sees | What she'd expect | What actually happens | 😖 | Suggested fix |
|---|---|---|---|---|:--:|---|
| A1 | Opens the URL | A blank page, then `Restoring your secure session…` and three grey boxes for **3.7 s** | Something about the product | Nothing readable for almost four seconds | **4** | Render the landing copy immediately; auth is only needed for the event list. Failing that, change the words to `Setting up your workspace…` — she has no session to restore |
| A2 | Landing loads | `Your events` · `Join an event` · `Try fictional rehearsal` · `Create event` | One obvious start | Three side-by-side actions, only one filled. She guesses right, but guesses | 2 | Keep all three; make `Create event` the only filled button on this row and demote `Join an event` to a text link |
| A3 | Clicks `Create event` | Dialog, one field: `Event name` | Exactly this | Works perfectly | **1** | — |
| A4 | Lands on `Event setup` | Chip reads `Draft · revision 1` | Nothing, she just made it | "Revision 1 of what? I haven't changed anything" | 3 | `Not published yet`. Drop the revision number until there is a second one |
| A5 | Fills `Hard finish (minutes after start)` | A number box containing `60` | To type `11:00 PM` | She must mentally subtract her start time and enter an offset | **5** | `Must finish by` + a time input. Convert to an offset behind the scenes. This is the single worst field in the app |
| A6 | Reads the helper line | `The hard finish is a protected commitment, not a suggested duration. Mode: rehearsal.` | — | The mode is the most consequential setting on the screen and it is the tail of a sentence, with no control next to it | 3 | Promote rehearsal/live to a labelled two-option control |
| A7 | Opens `Agenda · 0` | `Build your running order` + one line of guidance | Guidance | **Genuinely good empty state** | **1** | — (keep) |
| A8 | Clicks `Add cue` | A card headed `CUE 01` with **8 fields** | Name, who, how long | Title, Speaker, Preferred duration, Minimum duration, Shortening priority, Buffer before cue, Available from minute, Fixed start minute — all identical weight | **5** | Show 4 (title, speaker, preferred, minimum). Collapse the other 4 under `Advanced timing rules`. They already default to 1 / 0 / unset / unset |
| A9 | Reads `Shortening priority` | A box containing `1`, range 1–100 | — | No idea what the number means or what "1" implies | **4** | `If we run late, how protected is this?` as a three-option control: `Can be trimmed` / `Normal` / `Keep full length` |
| A10 | Reads `Available from minute` / `Fixed start minute` | `Not set` | — | "Minute of what?" Both are offsets from event start | **4** | Inside Advanced: `Speaker not available until` / `Must start exactly at`, both as clock times |
| A11 | Sees the scenario card | `Try the fictional TechFest scenario · Load scenario` | — | Excellent escape hatch; she uses it and skips A8–A10 entirely | **1** | — (keep, and see fix #4) |
| A12 | Clicks `Save & review` | Footer said `Draft loaded · Saving does not publish` | Confirmation it saved | The reassurance is there but reads as status noise, and `Draft loaded` is stale wording after she has typed | 2 | `Saved · not published yet` / `Unsaved changes` only |
| A13 | Review screen | Chips: `Live` `revision 2` `Schedule valid` `draft` | — | **`Live` and `draft` sit side by side.** She cannot tell whether her anchor can already see this | **5** | Never show freshness (`Live`) and phase (`draft`) as sibling chips. One status: `Draft — not visible to your anchor yet` |
| A14 | Anchor panel | `Published revision **not published**` | — | Reads as a rendering bug | **4** | `Not published yet` |
| A15 | Agenda table | Column `PREF / MIN`, values `20/20`, `10/4` | — | Opaque abbreviation | 3 | `Planned / shortest`, or drop the column from this view |
| A16 | `Validate and publish` | Confirm dialog explaining it does not start the first cue | — | **Clear, correct, well written** | **1** | — (keep) |
| A17 | After publishing | `Start Opening remarks` | — | Obvious and correct | **1** | — |

Console errors captured during the whole run: **none**.

### Persona B — the anchor, on a phone, backstage, dim light

Screens: `B01`–`B06`. Viewport 390×844, DPR 3, touch.

| # | Step | What he sees | What he'd expect | What actually happens | 😖 | Suggested fix |
|---|---|---|---|---|:--:|---|
| B1 | Opens the invite link | Goes straight into the runbook, no sign-in | Exactly this | Works. No account, no code re-entry, URL cleaned of `code=` | **1** | — (keep) |
| B2 | Dark screen, big type | Dark green, very large headings | Readable at arm's length | **Correct call for backstage.** No horizontal scroll at 390 px | **1** | — (keep) |
| B3 | Looks for what's next | Above the fold: hamburger, breadcrumb, language box, help, rehearsal banner, `ANCHOR RUNBOOK`, event title, three icon buttons, a revision chip, then `ON STAGE` | The current item and the clock | Roughly half the first screen is chrome before any content | **4** | Move the three icon buttons and the revision chip below the current-activity card |
| B4 | Idle state | `ON STAGE: Stage standby`, `CURRENT ACTIVITY: Between cues`, chip `STANDBY` | One idle message | **Three different phrasings of "nothing is happening" stacked vertically** | **4** | One: `Nothing on stage yet`. Drop the chip and the duplicate |
| B5 | Biggest text on screen when idle | `Between cues` | Something he can act on | The largest element on the phone is jargon and tells him nothing | **4** | `Waiting to start` / `Nothing on stage yet` |
| B6 | Running state | `ON STAGE: Event host` and directly beneath it `No speaker assigned` | — | **Self-contradiction on adjacent lines** | **4** | When no speaker is assigned, show the cue's owner label only, and suppress the second line |
| B7 | Timing lines | `10:00–10:05 IST · actual start / forecast end` then `Planned window: 10:00–10:05 IST` | One set of times | Two lines, identical values, different labels | 3 | Show the planned window only when it differs from actual, and label the difference |
| B8 | `TIME REMAINING` | `05:00`, very large | The thing he checks most | **Clipped at the bottom edge of the fold on a 390×844 phone** — he must scroll | **5** | Put the countdown in the first card, above `UP NEXT` |
| B9 | Three icon buttons | Refresh / document / fullscreen, no labels | — | He will not guess the middle one. Tap size is fine (~100 px) | 3 | Add visible text labels, or move to the menu |
| B10 | Freshness chip | `Live · revision 3` | "Is this current?" | "Live" answers it; "revision 3" is noise to him | 3 | `Up to date · just now`. Keep the number in the acknowledgement button only |
| B11 | Acknowledge | `Acknowledge revision 8` | "Got it" | The verb is right, the noun is ours | 2 | `I've got the update` |
| B12 | Offline | §11 line verbatim, acknowledge disabled | — | **Correct and well handled** | **1** | — (keep) |
| B13 | Print view | Controls hidden, full agenda, approved copy, pronunciation | — | **Correct** | **1** | — (keep) |
| B14 | Reads the rehearsal banner and the agenda table | Measured **9 px** computed font size for the §11 banner and for the `Cue` / `Time (IST)` / `Speaker` / `Status` column headers, and 9 px for every `IST` suffix | Readable at arm's length in dim light | Unreadable without bringing the phone close. §11 fixes the *wording*, not the size | **4** | Raise to ≥ 13 px on viewports under 480 px. Wording unchanged |

**Measured, no finding:** **0** interactive targets below 44×44 on the anchor phone, and no
horizontal scroll at 390 px. The accessibility constraint holds as claimed.

### Persona C — organizer mid-event, keynote running long, slightly panicking

Screens: `C01`–`C04`.

**Steps from noticing the problem to the anchor having the new plan: 3 interactions** — type the
delay, `Preview recovery plan`, `Approve and publish`. That is genuinely fast. The friction is
finding the field and trusting the result, not the number of clicks.

| # | Step | What she sees | What she'd expect | What actually happens | 😖 | Suggested fix |
|---|---|---|---|---|:--:|---|
| C1 | Scans for "fix it" | Right rail: `Run the stage` (with `Complete Keynote` and the `+1/+5/+10 min` rehearsal clock) **above** `Report an overrun` | The recovery control first | The panic action is the second card down, under rehearsal-only controls | **4** | Move `Report an overrun` to the top of the rail during a running event |
| C2 | Reads the overrun panel | `Keynote currently forecasts 10:25. Entering a delay sends a new absolute forecast end, so re-previewing never stacks the delay.` | How to report being late | Three pieces of implementation vocabulary in two sentences | **5** | `Keynote was due to end at 10:25. Tell us the new finish time — entering it again replaces the last estimate, it doesn't add to it.` |
| C3 | Types `12` | `New forecast end 10:37 (+12 min)` | — | Clear and immediately useful | **1** | — (keep) |
| C4 | Clicks `Preview recovery plan` | Dialog titled **`Review the recovery plan`**, containing a card headed **`Repair preview`** | One name | **Two names for the same object on the same screen** | **4** | Pick one — `Recovery plan` — and use it in both places |
| C5 | Reads the summary | `Recovered +12 minutes` · `Weighted shortening cost 24` · `Projected finish 11:00` | What changed and whether it's OK | `Recovered` and `Projected finish` land. **`Weighted shortening cost 24` is meaningless without the solver model** | **5** | Remove from the headline row. Replace with `2 items shortened` and keep the cost behind a `Why this plan?` disclosure |
| C6 | Reads the table | `CUE / NOW / PROPOSED / MINUTES`, changed rows highlighted, `-6 min` | — | **Good.** The diff is the strongest part of the screen | **1** | Rename the column to `Item`/`Session` |
| C7 | Reads `Hard-rule checks` | Seven `pass` chips: `Minimum durations respected`, `No overlapping cues`, `Fixed start protected`, `Hard finish protected` | Reassurance | Reassuring in tone, but she doesn't recognise these as the rules *she* set | 3 | Head it `What this plan protects` and phrase as outcomes: `Sponsor still starts at 10:45`, `Still finishes by 11:00` |
| C8 | Expiry line | `This preview expires at 7:24:17 AM (ten real minutes). The published plan has not changed.` | — | The second sentence is excellent. `(ten real minutes)` is confusing next to a scenario clock | 2 | `Expires at 7:24 (10 minutes from now).` |
| C9 | The infeasible case | `No feasible plan` chip + `Sponsor address fixed at 10:45; earliest feasible arrival 10:52; short by 7 minutes. Change a rule or make an organizer decision.` | To know what to do | **This is the product's centrepiece sentence.** The numbers are right; the phrasing is a solver report, and the instruction names no concrete action | **5** | `This won't fit. The sponsor slot is locked to 10:45, but the earliest you could reach it is 10:52 — 7 minutes short. To publish, shorten an item, drop one, or move the sponsor slot.` Chip → `This won't fit` |
| C10 | Disabled publish | `Publishing is disabled because no plan satisfies every rule. CuePilot will not relax a rule on its own.` | — | **Excellent** in intent; "satisfies every rule" is the only stiff phrase | 2 | `…because nothing fits all your fixed commitments. CuePilot won't quietly break one for you.` |
| C11 | After approving | Anchor screen updates within the polling window | — | **Works** | **1** | — |
| C12 | Pending state | `Waiting for the server to confirm this action…` | — | Correct behaviour (no optimistic success), implementation noun | 2 | `Saving your change…` |

### Persona D — a judge with five minutes

Screens: `D01`–`D04`.

| # | Step | What they see | What they'd expect | What actually happens | 😖 | Suggested fix |
|---|---|---|---|---|:--:|---|
| D1 | Opens the link | `Restoring your secure session…` for **3.7 s** | Instant | Measured: 3,722 ms to `/`, 3,913 ms to `/#/help`. A deep link inside that window is a grey skeleton | **5** | Highest-value fix in the document. See #1 |
| D2 | Page loads | `Keep the show moving together.` + `01 Prepare / 02 Publish / 03 Perform` + three actions | To understand the product | **Strong.** Explains itself without documentation | **1** | — (keep) |
| D3 | Wants proof it works | `Try fictional rehearsal` sits in the header row | A demo button | **The single best thing on the page for this persona**, but it's the middle of three and the least visually weighted | 3 | For a workspace with zero events, make `Try fictional rehearsal` the filled primary |
| D4 | Footer | `Browser-local workspace · Anonymous identity · Events expire after 72 hours` | — | Honest; `Browser-local workspace` is ours | 2 | `Saved in this browser · no account needed · events expire after 72 hours` |
| D5 | Any console | Bottom of every event screen: `Signed in as pIoizkGbLFZel0SNXZRae2anXIk2.` | — | A raw 28-character Firebase UID. Looks like a debug leak | 3 | `Signed in anonymously · this browser only`, UID behind a `Details` toggle |
| D6 | Top-right chrome | `Single-stage event control` | — | Marketing phrase in the app chrome, does nothing, competes with the help icon | 2 | Remove or move to the landing page |
| D7 | Bottom-left | `Human-led. Stage-ready.` | — | Same | 1 | Same |
| D8 | Looks for something broken | — | — | **Nothing looked broken or fake.** Rehearsal labelling is honest and everywhere | **1** | — |

---

## Task 2 — Language pass

Frequency in the frontend source: `cue` 384, `revision` 253, `snapshot` 83, `proposal` 44,
`runbook` 29, `buffer` 26, `preview` 26, `repair` 25, `notBefore` 21, `acknowledge` 21,
`penalty` 19, `compress` 17.

### Buttons — no jargon, say what happens

| Now | Proposed | Why |
|---|---|---|
| `Add cue` | `Add session` | Jargon in a button |
| `Approve and publish` | `Publish this plan` | Says what happens |
| `Approve and publish copy` | `Publish this script` | — |
| `Validate and publish` | `Check and publish` | "Validate" is ours |
| `Preview recovery plan` | keep | Already plain |
| `Acknowledge revision 8` | `I've got the update` | — |
| `Discard preview` | `Cancel` | — |
| `Dismiss on this screen` | `Hide this` | — |
| `Load scenario` | `Load the demo event` | — |

### Labels and nouns

| Now | Proposed |
|---|---|
| `Cue` / `Cue title` / `CUE 01` | `Session` / `Session name` / `ITEM 01` |
| `Hard finish (minutes after start)` | `Must finish by` (time input) |
| `Compression penalty` / `Shortening priority` | `If we run late` → `Can be trimmed` / `Normal` / `Keep full length` |
| `Buffer before cue` | `Gap before this` |
| `Available from minute` | `Speaker not available until` |
| `Fixed start minute` | `Must start exactly at` |
| `Preferred duration` / `Minimum duration` | `Planned length` / `Shortest acceptable` |
| `PREF / MIN` (column) | `Planned / shortest` |
| `revision 9` | `Version 9`, or `Updated just now` |
| `Published revision not published` | `Not published yet` |
| `Awaiting ack` | `Anchor hasn't confirmed yet` |
| `Repair preview` / `Review the recovery plan` | **Pick one:** `Recovery plan` |
| `Weighted shortening cost 24` | `2 items shortened` (cost behind `Why this plan?`) |
| `Hard-rule checks` | `What this plan protects` |
| `No feasible plan` | `This won't fit` |
| `Between cues` | `Nothing on stage yet` |
| `Stage standby` | `Not started` |
| `actual start / forecast end` | `started / expected to end` |
| `Scenario clock · advances manually` | `Practice clock — you move it` |
| `Browser-local workspace` | `Saved in this browser` |
| `Single-stage event control` | (remove) |

### Errors — say what to do next

| Code | Now | Proposed |
|---|---|---|
| `REVISION_CONFLICT` | `The event changed (now revision 7). Refresh and preview again.` | `Someone else changed this event. Refresh to see the latest, then try again.` |
| `PROPOSAL_EXPIRED` | `This preview expired after ten minutes. Generate a new one.` | `This plan is more than 10 minutes old. Preview again for current times.` |
| `PROPOSAL_STALE` | `The event moved on since this preview. Generate a new one.` | `The event has moved on since you previewed. Preview again.` |
| `PLAN_TIME_STALE` | `Time advanced and this plan is no longer reachable. Generate a new preview.` | `Too much time has passed — this plan can't be reached any more. Preview again.` |
| `PROPOSAL_RESULT_DIVERGED` | `The plan changed since this preview. Generate a new one.` | `Something changed, so this is no longer the best plan. Preview again.` |
| `PROPOSAL_INFEASIBLE` | `This plan is not feasible and cannot be published.` | `This won't fit, so there's nothing to publish.` |
| `NOT_PUBLISHED` | `Waiting for publication` | `Your organizer hasn't published the runbook yet.` |

### Sentences to rewrite wholesale

1. `Keynote currently forecasts 10:25. Entering a delay sends a new absolute forecast end, so re-previewing never stacks the delay.`
2. `Sponsor address fixed at 10:45; earliest feasible arrival 10:52; short by 7 minutes. Change a rule or make an organizer decision.`
3. `Times are whole-minute offsets from the event start. The server calculates the schedule when you save.`
4. `Publication success and acknowledgement are separate: the anchor may not have seen this revision yet.`
5. `The scenario clock advances only forward. Actual times recorded while it is in use are labelled as rehearsal-clock times.`
6. `Keep names and context accurate. These facts are retained with their original IDs.`

---

## Task 3 — Layout and hierarchy

### Landing / `Your events`

- **One thing:** start an event. **Prominent?** Yes, once loaded — but 3.7 s of skeleton first.
- **Excess:** `Single-stage event control` in the chrome. Sidebar is correctly minimal here.
- **Primary position:** top-right, consistent with the rest of the app. ✔
- **Empty state:** `Your next event starts here` + `Create event`. **Good.**
- For a zero-event workspace, promote `Try fictional rehearsal` to primary.

### `Event setup`

- **One thing:** get the agenda in. **Prominent?** Partly — `Save & review` is correctly the
  filled bottom-right primary, but the agenda card is a wall of 8 equal fields.
- **Field count (measured):** Event details **3** (name, start, hard finish) — already lean.
  Agenda **8 per item**. After `Load scenario`, the page carries **49 inputs**.
- **Collapse behind `Advanced timing rules`:** `Shortening priority`, `Buffer before cue`,
  `Available from minute`, `Fixed start minute`. All four already have working defaults
  (1 / 0 / unset / unset), so a first-timer would fill **4 fields per item instead of 8** and
  never see a constraint she doesn't have.
- **Empty state:** `Build your running order` — **good, keep**.
- **Sidebar:** 8 event links appear before publication, of which `Stage console`, `Host scripts`,
  `Announcements`, `Revision history` and `Anchor view` are dead ends until then. Either disable
  them with a reason or group them under `After you publish`.

### `Stage console`

- **One thing:** *depends on state* — before publish it's "publish"; while running it's "fix the
  timing". The layout is the same in both. That is the core structural issue.
- **Excess:** four status chips including two contradictory pairs; the `Anchor` card could be a
  single line until an anchor exists.
- **Primary position:** inconsistent — `Validate and publish` is in a right-rail card, while
  `Complete <cue>` is in a *different* right-rail card, below which sits `Report an overrun`.
  During a running event the recovery control should be first in the rail.
- Large empty area below the agenda table on desktop; the rail could occupy it.

### `Anchor view`

- **One thing:** what to say next, and how long is left. **Prominent?** The cue title yes; the
  countdown **no — clipped at the fold on a 390-wide phone.**
- **Excess above the fold:** three unlabelled icon buttons, the revision chip, and a redundant
  `ON STAGE` card duplicating `CURRENT ACTIVITY`.
- Dark theme, type scale and touch targets are right. No horizontal scroll at 390 px.

### Repair dialog

- **One thing:** decide whether to publish. **Prominent?** Yes — `Publish` is the filled button,
  correctly disabled when infeasible, with the reason stated.
- **Excess:** `Weighted shortening cost`; seven pass-chips could collapse to one summary line
  with a disclosure.
- Two names for the object (`Review the recovery plan` / `Repair preview`) in one dialog.

---

## Task 4 — The ten highest-impact fixes, ranked by confusion ÷ effort

| # | Fix | Confusion | Effort | Where |
|:--:|---|:--:|---|---|
| 1 | **Render the landing page before auth resolves** (or at minimum change `Restoring your secure session…` → `Setting up your workspace…`). 3.7 s of grey is the first thing every judge sees | 5 | Copy swap: minutes. Real fix: ~1 h in `auth.ts` + `App.tsx` | `App.tsx`, `lib/auth.ts` |
| 2 | **Never show `Live` next to `draft`.** One status, one meaning: `Draft — not visible to your anchor yet` / `Published · updated just now`. Also removes the duplicate `revision 8` chip | 5 | ~30 min | `OrganizerConsole.tsx` |
| 3 | **Rewrite the infeasibility sentence** — the product's centrepiece line — into plain English naming the three concrete options | 5 | ~20 min, one function | `components/RepairPreview.tsx:31` |
| 4 | **Collapse 4 of 8 per-item fields under `Advanced timing rules`** with the existing defaults | 5 | ~1 h, `<details>` around the second grid row | `SetupScreen.tsx:601` |
| 5 | **`Hard finish (minutes after start)` → `Must finish by` with a time input** | 5 | ~45 min incl. offset conversion both ways | `SetupScreen.tsx:417` |
| 6 | **Delete `Weighted shortening cost` from the headline row**; replace with `N items shortened`, cost behind `Why this plan?` | 5 | ~15 min | `RepairPreview.tsx:96` |
| 7 | **Move the countdown above `UP NEXT`** so it is not clipped at the fold on a phone | 5 | ~20 min, reorder two blocks | `AnchorView.tsx` |
| 8 | **One idle message on the anchor screen** — `Nothing on stage yet` — instead of three, and suppress `No speaker assigned` when a cue owner is already shown | 4 | ~20 min | `AnchorView.tsx` |
| 9 | **One name for the recovery object** (`Recovery plan`) in both the dialog title and the card heading | 4 | ~5 min | `RepairPreview.tsx:78`, `OrganizerConsole.tsx` |
| 10 | **`Published revision not published` → `Not published yet`**, and `Awaiting ack` → `Anchor hasn't confirmed yet` | 4 | ~10 min | `OrganizerConsole.tsx` |
| 11 | **Raise 9 px text to ≥ 13 px under 480 px wide** — the §11 banner and the anchor agenda headers. Wording untouched | 4 | ~5 min, one media query | `styles.css` |

Row 11 is listed last only because I found it after ranking; by confusion ÷ effort it belongs
around #3.

**Just below the line**, same character, slightly lower reach: `Add cue` → `Add session`;
`Report an overrun` moved above `Run the stage` while running; hide the raw Firebase UID; drop
`Single-stage event control`; promote `Try fictional rehearsal` for empty workspaces.

### If you only have twenty minutes

**#3, #6, #9, #10** are pure string edits in two files, worth 4–5 confusion points each, and
touch no layout. **#2** is one more file. That is five of the top ten.

### Test impact

Fixes 1, 3, 6, 9, 10 touch no selector the e2e or unit suites assert on. Fixes 2, 4, 5, 7, 8
change text or structure the Playwright spec matches by role name — `rehearsal.spec.ts` would
need updated selectors, and `apps/web/test/stage-readiness.test.tsx` asserts anchor copy. Every
label change below would be a mechanical selector update, not a logic change.

---

## Not findings — things that are already right

Recorded so they don't get "fixed" by accident: the two written empty states; the publish
confirmation explaining it does not start the first cue; `The published plan has not changed.`;
the disabled-publish reason; `New forecast end 10:37 (+12 min)`; the recovery diff table; the
anchor dark theme and type scale; invite links that work with no sign-in and strip `code=` from
the URL; the offline snapshot line; the print view; `Try the fictional TechFest scenario`; and
all five §11 labels, verbatim and correct.

---

## Implemented — 2026-09-20

Every fix in the ranked list was applied, plus five from "just below the line" and three
found during verification. Verified by re-running the same scripted walkthrough against the
changed build: `docs/ux-screens-after/` holds the after-screenshots, taken at the same
viewports and the same moments as the before set.

**Gates after the change:** typecheck pass · oxlint pass · build pass · **330/330 vitest** ·
**Playwright e2e 1 passed (48.3 s)**. No §11 label was altered.

| # | Fix | Evidence |
|:--:|---|---|
| 1 | Cold load now shows the product's own explanation — name, one line, and the Prepare / Publish / Perform steps — instead of three grey boxes. `Restoring your secure session…` → `Setting up your workspace` | `A01`, `D01` |
| 2 | One publication status, never two. `Live` + `draft` + a duplicate `revision N` chip → `Draft — not visible to your anchor yet`, or freshness alone once published | `A08`, `C01` |
| 3 | The infeasibility sentence now names the three real options and leads with the verdict, keeping all three §14 quantities | `C02` |
| 4 | Eight fields per session → **four visible**, with `Shortening priority`, `Buffer`, `Available from` and `Fixed start` under `Advanced timing rules` | `A06` |
| 5 | `Hard finish (minutes after start)` → **`Must finish by`, a time input**, with `60 minutes after the start` shown beneath. Converts both ways; a finish past midnight is read as the next day | `A04` |
| 6 | `Weighted shortening cost 24` out of the headline row → `N items shortened`, with the score behind `Why this plan?` | `C03` |
| 7 | Countdown moved above `UP NEXT` on phones. `up next` became a sibling block so the mobile stack could reorder; the desktop three-column layout is preserved by explicit grid placement | `B04` |
| 8 | One idle message on the anchor screen, and `No speaker assigned` no longer appears directly under a name | `B02`, `B04` |
| 9 | One name for the recovery object; the duplicate card heading inside the dialog is gone | `C02`, `C03` |
| 10 | `Published revision not published` → `Not published yet`; `Awaiting ack` → `Not confirmed yet` | `A08`, `C01` |
| 11 | 9 px text raised to 13 px under 480 px — rehearsal banner, runbook table headers, `IST` suffixes. §11 wording untouched | `B02` |

Also done: `Add cue` → `Add session`; `Running late?` leads the rail during a running event;
the raw Firebase UID moved behind `Session details`; `Single-stage event control` removed;
`Try fictional rehearsal` becomes the filled primary for an empty workspace; all seven error
sentences rewritten; the agenda table's `Cue` and `Pref / min` headers renamed.

**Found while verifying, not in the original audit:**

- The first attempt at fix 7 broke the phone layout — `up next` kept its desktop grid cell
  and overlapped the countdown. Caught in the after-screenshot, not by any test.
- The freshness chip rendered **twice** on both the console and the anchor view, because
  `StageOverview` drew its own on top of the one each screen already had. Removed.
- `<summary>` with `display: flex` drops the native disclosure triangle, so `Advanced timing
  rules` did not read as openable. Added a rotating marker that respects reduced motion.

**Not changed:** the fourteen things recorded above as already right, and every §11 label.
