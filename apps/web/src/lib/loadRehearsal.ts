/**
 * The labeled "Load rehearsal at keynote" action (§12): publish the seeded draft, then run
 * the opening so the keynote is active, using ONLY the normal stage commands.
 *
 * This is demo orchestration, not scheduling. Every target minute is read from the published
 * snapshot the server produced; nothing here chooses a duration, compresses a cue or relaxes
 * a rule. Each step is issued separately, with its own idempotency key and expectedRevision.
 *
 * The planner is written for any seam, not only the pristine draft, so a lost response can
 * be retried and the action clicked again instead of leaving the event half-loaded.
 */

import type { EventState } from "@cuepilot/domain";

export type LoadRehearsalStep =
  | { kind: "publish" }
  | { kind: "start"; cueId: string }
  | { kind: "complete"; cueId: string }
  | { kind: "clock"; targetMin: number };

const minuteOf = (state: EventState): number => {
  const at = state.scenarioNowAt ?? state.startsAt;
  return Math.max(0, Math.ceil((Date.parse(at) - Date.parse(state.startsAt)) / 60_000));
};

/**
 * Command sequence that leaves the scenario's second cue active at its planned end. Returns
 * [] when there is nothing to do (already loaded, ended, or not a rehearsal).
 */
export const planLoadRehearsal = (state: EventState): LoadRehearsalStep[] => {
  if (state.mode !== "rehearsal" || state.phase === "ended") return [];
  const ordered = state.cues.slice().sort((a, b) => a.order - b.order);
  const opening = ordered[0];
  const keynote = ordered[1];
  if (opening === undefined || keynote === undefined) return [];
  // The target state: the second cue is active. Nothing left to load.
  if (keynote.status === "active") return [];

  const steps: LoadRehearsalStep[] = [];
  if (state.phase === "draft") steps.push({ kind: "publish" });
  let scenarioMin = minuteOf(state);

  if (opening.status === "pending") steps.push({ kind: "start", cueId: opening.id });
  if (opening.status !== "completed") {
    // Move the scenario clock to the opening's published end only when that is forward.
    if (opening.plannedEndMin > scenarioMin) {
      steps.push({ kind: "clock", targetMin: opening.plannedEndMin });
      scenarioMin = opening.plannedEndMin;
    }
    steps.push({ kind: "complete", cueId: opening.id });
  }

  // The keynote must be pending to be started; anything else is not this action's shape.
  if (keynote.status !== "pending") return [];
  steps.push({ kind: "start", cueId: keynote.id });
  if (keynote.plannedEndMin > scenarioMin) {
    steps.push({ kind: "clock", targetMin: keynote.plannedEndMin });
  }
  return steps;
};

/** Minute offset from `startsAt` as an absolute UTC instant, for the rehearsal-clock body. */
export const rehearsalClockIso = (startsAt: string, targetMin: number): string =>
  new Date(Date.parse(startsAt) + targetMin * 60_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
