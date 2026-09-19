/**
 * Canonical running-state transitions. Pure functions: no clock read, no I/O, no mutation
 * of the input state. Every scheduling rule lives here, never in the API layer (§24).
 *
 * INVENTED: §12 specifies the behaviour of `start`, `complete`, `rehearsal-clock` and
 * repair approval but gives no signatures. These are ours.
 *
 * Each function returns the NEXT state with `revision` already incremented. The caller is
 * responsible for persisting it and the published pointer in one transaction.
 */

import { repairSchedule } from './repair';
import type {
  Cue,
  EventState,
  ISODate,
  RepairInput,
  RepairResult,
  ScheduleInterval,
  UUID,
} from './types';
import { planIsValid, validatePlan } from './validatePlan';

/** Codes a transition can refuse with. The API layer maps these to HTTP statuses. */
export type TransitionCode =
  | 'WRONG_PHASE'
  | 'CUE_ORDER_VIOLATION'
  | 'CLOCK_NOT_MONOTONIC'
  | 'CLOCK_FORBIDDEN_IN_LIVE'
  | 'VALIDATION_FAILED';

export class TransitionError extends Error {
  readonly code: TransitionCode;
  constructor(code: TransitionCode, message: string) {
    super(message);
    this.name = 'TransitionError';
    this.code = code;
  }
}

const refuse = (code: TransitionCode, message: string): never => {
  throw new TransitionError(code, message);
};

/** Minutes from `startsAt`, rounding partial minutes UPWARD per §12, clamped at 0. */
export const relativeMinutes = (startsAt: ISODate, at: ISODate): number =>
  Math.max(0, Math.ceil((Date.parse(at) - Date.parse(startsAt)) / 60_000));

/**
 * The clock that produces recorded actual times, and its provenance.
 *
 * §12 permits "the server clock or labeled rehearsal clock". In rehearsal the scenario clock
 * is used so the fixture's arithmetic is reproducible on every run; the source is recorded
 * on the cue so a rehearsal timestamp is never presented as a real observation.
 */
export const actualClock = (
  state: EventState,
  serverNow: ISODate,
): { at: ISODate; source: 'rehearsal_clock' | 'server_clock' } =>
  state.mode === 'rehearsal' && state.scenarioNowAt !== null
    ? { at: state.scenarioNowAt, source: 'rehearsal_clock' }
    : { at: serverNow, source: 'server_clock' };

/** The scenario minute in rehearsal, the real minute in live. */
export const currentMinute = (state: EventState, serverNow: ISODate): number =>
  relativeMinutes(
    state.startsAt,
    state.mode === 'rehearsal' && state.scenarioNowAt !== null ? state.scenarioNowAt : serverNow,
  );

const byOrder = (cues: readonly Cue[]): Cue[] => cues.slice().sort((a, b) => a.order - b.order);

const pendingIntervals = (cues: readonly Cue[]): ScheduleInterval[] =>
  byOrder(cues)
    .filter((c) => c.status === 'pending')
    .map((c) => ({ cueId: c.id, startMin: c.plannedStartMin, endMin: c.plannedEndMin }));

/**
 * Recomputes `scheduleHealth` after reality is recorded.
 *
 * §12: "After a real start/completion, compare actual state with timing rules. Record
 * deviations and show needs_repair. Do not silently shift later cues." So this only ever
 * sets a flag — it never touches a planned interval.
 */
const recomputeHealth = (state: EventState, nowMin: number): 'valid' | 'needs_repair' => {
  const checks = validatePlan(state, pendingIntervals(state.cues), {
    activeForecastEndMin: state.activeForecastEndMin,
    nowMin,
  });
  return planIsValid(checks) ? 'valid' : 'needs_repair';
};

const bump = (state: EventState, serverNow: ISODate): Pick<EventState, 'revision' | 'updatedAt'> => ({
  revision: state.revision + 1,
  updatedAt: serverNow,
});

/**
 * `POST /cues/{cid}/start`. The cue must be the FIRST pending cue and no other cue may be
 * active (§12: "at most one active cue", "`start` must identify the first pending cue").
 *
 * The forecast end comes from the cue's DURATION in the current plan, not its planned end,
 * so a late start pushes the forecast rather than silently compressing the cue.
 */
export function startCue(state: EventState, cueId: UUID, serverNow: ISODate): EventState {
  if (state.phase !== 'running') {
    refuse('WRONG_PHASE', 'Cues can only be started while the event is running.');
  }
  if (state.cues.some((c) => c.status === 'active')) {
    refuse('CUE_ORDER_VIOLATION', 'Another cue is already active.');
  }
  const firstPending = byOrder(state.cues).find((c) => c.status === 'pending');
  if (firstPending === undefined) {
    refuse('CUE_ORDER_VIOLATION', 'There are no pending cues left to start.');
  }
  if ((firstPending as Cue).id !== cueId) {
    refuse('CUE_ORDER_VIOLATION', `The next cue to start is ${(firstPending as Cue).id}.`);
  }
  const target = firstPending as Cue;

  const clock = actualClock(state, serverNow);
  const startMin = relativeMinutes(state.startsAt, clock.at);
  const plannedDuration = target.plannedEndMin - target.plannedStartMin;

  const next: EventState = {
    ...state,
    cues: state.cues.map((c) =>
      c.id === cueId
        ? {
            ...c,
            status: 'active' as const,
            actualStartAt: clock.at,
            actualTimeSource: clock.source,
          }
        : { ...c },
    ),
    currentCueId: cueId,
    activeForecastEndMin: startMin + plannedDuration,
    ...bump(state, serverNow),
  };
  return { ...next, scheduleHealth: recomputeHealth(next, currentMinute(next, serverNow)) };
}

/**
 * `POST /cues/{cid}/complete`. The cue must be the active one.
 *
 * A completion that breaks the plan is still recorded: the actual time persists and
 * `scheduleHealth` becomes `needs_repair`. Reality is never rejected and later cues are
 * never silently shifted.
 */
export function completeCue(state: EventState, cueId: UUID, serverNow: ISODate): EventState {
  if (state.phase !== 'running') {
    refuse('WRONG_PHASE', 'Cues can only be completed while the event is running.');
  }
  const active = state.cues.find((c) => c.status === 'active');
  if (active === undefined) {
    refuse('CUE_ORDER_VIOLATION', 'No cue is currently active.');
  }
  if ((active as Cue).id !== cueId) {
    refuse('CUE_ORDER_VIOLATION', `The active cue is ${(active as Cue).id}.`);
  }
  const target = active as Cue;

  const clock = actualClock(state, serverNow);
  if (target.actualStartAt !== null && Date.parse(clock.at) < Date.parse(target.actualStartAt)) {
    refuse('CLOCK_NOT_MONOTONIC', 'A cue cannot finish before it started.');
  }

  const cues = state.cues.map((c) =>
    c.id === cueId
      ? {
          ...c,
          status: 'completed' as const,
          actualEndAt: clock.at,
          actualTimeSource: clock.source,
        }
      : { ...c },
  );
  const anyPending = cues.some((c) => c.status === 'pending');

  const next: EventState = {
    ...state,
    cues,
    currentCueId: null,
    activeForecastEndMin: null,
    // Completing the last cue ends the event.
    phase: anyPending ? 'running' : ('ended' as const),
    ...bump(state, serverNow),
  };
  return { ...next, scheduleHealth: recomputeHealth(next, currentMinute(next, serverNow)) };
}

/**
 * `POST /rehearsal-clock`. Owner-only, rehearsal-only, strictly forward.
 *
 * Changing it increments and publishes a revision so both views agree on the scenario.
 */
export function advanceRehearsalClock(
  state: EventState,
  nowAt: ISODate,
  serverNow: ISODate,
): EventState {
  if (state.mode !== 'rehearsal') {
    refuse('CLOCK_FORBIDDEN_IN_LIVE', 'The scenario clock is forbidden in live mode.');
  }
  if (state.scenarioNowAt !== null && Date.parse(nowAt) <= Date.parse(state.scenarioNowAt)) {
    refuse('CLOCK_NOT_MONOTONIC', 'The scenario clock only moves forward.');
  }
  const next: EventState = { ...state, scenarioNowAt: nowAt, ...bump(state, serverNow) };
  return { ...next, scheduleHealth: recomputeHealth(next, currentMinute(next, serverNow)) };
}

/**
 * Applies an approved repair.
 *
 * INFERRED (docs/decisions.md M3 #3): `activeForecastEndMin` is persisted from the input.
 * Without it the next repair would solve from the stale forecast.
 *
 * INFERRED (docs/decisions.md M3 #4): `releaseUpdates` are persisted into the cues'
 * `notBeforeMin`. §12 only requires storing them in `input_json` for recomputation, but a
 * later re-solve that silently forgot a speaker's release time is a correctness bug.
 *
 * Completed and active cues are never touched: only pending intervals move.
 */
export function applyRepair(
  state: EventState,
  input: RepairInput,
  result: RepairResult,
  serverNow: ISODate,
): EventState {
  if (!result.feasible) {
    refuse('VALIDATION_FAILED', 'An infeasible repair cannot be applied.');
  }
  const releases = new Map(input.releaseUpdates.map((u) => [u.cueId, u.notBeforeMin]));
  const schedule = new Map(result.schedule.map((s) => [s.cueId, s]));

  const cues = state.cues.map((c) => {
    if (c.status !== 'pending') return { ...c };
    const interval = schedule.get(c.id);
    const release = releases.get(c.id);
    return {
      ...c,
      notBeforeMin: release === undefined ? c.notBeforeMin : release,
      plannedStartMin: interval === undefined ? c.plannedStartMin : interval.startMin,
      plannedEndMin: interval === undefined ? c.plannedEndMin : interval.endMin,
    };
  });

  return {
    ...state,
    cues,
    activeForecastEndMin: input.activeForecastEndMin,
    // Only a validated repair clears the flag.
    scheduleHealth: 'valid',
    ...bump(state, serverNow),
  };
}

/**
 * Runs the solver for a preview. Kept here so the API layer never touches scheduling logic.
 * Pure and synchronous, so it is safe to call inside `transactionSync`.
 */
export function previewRepair(
  state: EventState,
  input: RepairInput,
  serverNow: ISODate,
): RepairResult {
  return repairSchedule(state, input, currentMinute(state, serverNow));
}

/** Compares two results for the step-10 approval check (docs/decisions.md M3 #2). */
export const sameRepairOutcome = (a: RepairResult, b: RepairResult): boolean =>
  a.feasible === b.feasible &&
  a.weightedShorteningCost === b.weightedShorteningCost &&
  a.projectedFinishMin === b.projectedFinishMin &&
  JSON.stringify(a.schedule) === JSON.stringify(b.schedule);
