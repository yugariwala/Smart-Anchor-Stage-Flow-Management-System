/**
 * Independent verification of a candidate schedule against every hard rule.
 *
 * INVENTED: not specified in §12. The report mandates the behaviour ("the backend is the
 * final authority", §24) but gives no signature, so this contract is ours, not the spec's.
 *
 * This is the server's SECOND LINE OF DEFENCE: it must be able to reject a plan the solver
 * produced. It therefore shares no code with `repair.ts` — it re-derives every rule from
 * `state` and the candidate alone. Duplicated arithmetic is the point; a shared helper
 * would let one bug pass both checks.
 */

import type { ConstraintCheck, EventState, ScheduleInterval, UUID } from './types';

/** Context the caller supplies because it owns the clock read. See `repair.ts`. */
export type ValidatePlanContext = {
  /** The active cue's fixed forecast end, or null when no cue is active. */
  activeForecastEndMin: number | null;
  /** Minutes relative to `startsAt`; negative clamps to 0. */
  nowMin: number;
};

const isFiniteInt = (n: number): boolean => Number.isInteger(n) && Number.isFinite(n);

const minutesFrom = (startsAt: string, at: string): number =>
  Math.ceil((Date.parse(at) - Date.parse(startsAt)) / 60_000);

/**
 * Returns one check per rule evaluated. A plan is acceptable only when every returned
 * check has `passed: true`; `planIsValid` below is the convenience predicate.
 */
export function validatePlan(
  state: EventState,
  candidate: readonly ScheduleInterval[],
  ctx: ValidatePlanContext,
): ConstraintCheck[] {
  const checks: ConstraintCheck[] = [];
  const pass = (rule: string, cueId: UUID | null, passed: boolean): void => {
    checks.push({ rule, cueId, passed });
  };

  const cues = state.cues.slice().sort((a, b) => a.order - b.order);
  const pending = cues.filter((c) => c.status === 'pending');
  const completed = cues.filter((c) => c.status === 'completed');
  const active = cues.find((c) => c.status === 'active');
  const clampedNow = Math.max(0, ctx.nowMin);

  // --- The candidate must describe exactly the pending cues, in fixed order -----------
  const sameCues =
    candidate.length === pending.length &&
    candidate.every((c, i) => c.cueId === (pending[i] as (typeof pending)[number]).id);
  pass('candidate_covers_pending', null, sameCues);

  // --- Completed and active cues must never appear in a candidate ---------------------
  const candidateIds = new Set(candidate.map((c) => c.cueId));
  pass('completed_immutable', null, completed.every((c) => !candidateIds.has(c.id)));
  pass('active_immutable', active === undefined ? null : active.id, !(active !== undefined && candidateIds.has(active.id)));

  // --- Integer minutes, positive intervals -------------------------------------------
  pass(
    'integer_minutes',
    null,
    candidate.every(
      (c) => isFiniteInt(c.startMin) && isFiniteInt(c.endMin) && c.endMin >= c.startMin,
    ),
  );

  // --- The active cue's forecast is a fixed input, and must be credible ---------------
  if (active !== undefined) {
    const forecast = ctx.activeForecastEndMin;
    if (forecast === null) {
      pass('active_forecast_present', active.id, false);
    } else {
      pass('active_forecast_present', active.id, true);
      const actualStartMin =
        active.actualStartAt === null ? null : minutesFrom(state.startsAt, active.actualStartAt);
      pass(
        'active_forecast_after_actual_start',
        active.id,
        actualStartMin === null || forecast >= actualStartMin,
      );
      pass('active_forecast_after_now', active.id, forecast >= clampedNow);
    }
  } else {
    pass('active_forecast_absent', null, ctx.activeForecastEndMin === null);
  }

  if (!sameCues) {
    // Per-cue rules below index the candidate positionally; a mismatched candidate
    // cannot be checked further without inventing an alignment.
    pass('minimum_durations', null, false);
    pass('hard_end', null, false);
    return checks;
  }

  // --- The floor the first pending cue must clear -------------------------------------
  const completedEnd = (at: string | null, plannedEndMin: number): number =>
    at === null ? plannedEndMin : minutesFrom(state.startsAt, at);
  const latestCompleted = completed.reduce(
    (acc, c) => Math.max(acc, completedEnd(c.actualEndAt, c.plannedEndMin)),
    0,
  );
  const floorMin =
    active !== undefined && ctx.activeForecastEndMin !== null
      ? ctx.activeForecastEndMin
      : Math.max(latestCompleted, clampedNow);

  // --- Per-cue hard rules -------------------------------------------------------------
  let minimumsOk = true;
  let prevEnd = floorMin;
  for (let i = 0; i < pending.length; i++) {
    const cue = pending[i] as (typeof pending)[number];
    const got = candidate[i] as ScheduleInterval;
    const duration = got.endMin - got.startMin;

    if (duration < cue.minDurationMin || duration > cue.preferredDurationMin) minimumsOk = false;

    // Non-overlapping and never earlier than the floor. Gaps are legal: a fixed start
    // or a release time can leave the stage idle.
    pass('contiguous_order', cue.id, got.startMin >= prevEnd);

    if (cue.bufferBeforeMin > 0) {
      pass('buffer', cue.id, got.startMin >= prevEnd + cue.bufferBeforeMin);
    }
    if (cue.notBeforeMin !== null) {
      pass('not_before', cue.id, got.startMin >= cue.notBeforeMin);
    }
    if (cue.fixedStartMin !== null) {
      pass('fixed_start', cue.id, got.startMin === cue.fixedStartMin);
    }

    prevEnd = got.endMin;
  }

  // Always emitted, per docs/decisions.md #6.
  pass('minimum_durations', null, minimumsOk);
  pass('hard_end', null, prevEnd <= state.hardEndMin);

  return checks;
}

/** A plan is acceptable only when every evaluated rule passed. */
export const planIsValid = (checks: readonly ConstraintCheck[]): boolean =>
  checks.every((c) => c.passed);
