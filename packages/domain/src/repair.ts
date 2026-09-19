/**
 * Deterministic schedule repair — bounded dynamic programming, per §7A.
 *
 * No LLM decides timestamps. This module is a pure function: no `Date.now()`, no I/O,
 * no mutation of its arguments. Integer minutes relative to `startsAt` throughout.
 *
 * `nowMin` is MINUTES RELATIVE TO `state.startsAt`, derived by the CALLER from
 * `scenarioNowAt` in rehearsal mode or the server clock in live mode. The clock read
 * belongs to the caller so the solver stays testable with zero clock dependency.
 * Negative values clamp to 0.
 *
 * A reported delay arrives as an ABSOLUTE new forecast end (`input.activeForecastEndMin`),
 * already computed by the caller from the current forecast plus the entered delta. The
 * solver never adds a delta, so re-submitting the same input twice is idempotent by
 * construction.
 *
 * The solver never alters factual recorded times. If reality contradicts the plan that is
 * the caller's `scheduleHealth: "needs_repair"` concern, not something to silently fix.
 */

import type {
  ConstraintCheck,
  Cue,
  EventState,
  RepairFailure,
  RepairInput,
  RepairResult,
  ScheduleChange,
  ScheduleInterval,
  UUID,
} from './types';

const RULE_VERSION = 'fixed-order-v1' as const;

/** Why a candidate transition was refused. Every rejection is an explicit rule check. */
export type RejectionReason =
  /** A fixed-start cue is unreachable: earliest possible start is later than fixedStartMin. */
  | 'fixed_start_unreachable'
  /** The candidate interval would finish after hardEndMin. */
  | 'hard_end_exceeded'
  /** A cheaper-or-equal path already reaches this end minute (ties keep the incumbent). */
  | 'not_strictly_lower_cost';

export type RejectionCounts = Record<RejectionReason, number>;

/** Solver projection of a pending cue. Read-only: the solver never writes to `state`. */
type PendingCue = {
  readonly id: UUID;
  readonly preferredDurationMin: number;
  readonly minDurationMin: number;
  readonly compressionPenalty: number;
  readonly bufferBeforeMin: number;
  readonly notBeforeMin: number | null;
  readonly fixedStartMin: number | null;
  /** Currently published duration, the baseline for `recoveredMin`. */
  readonly publishedDurationMin: number;
  readonly plannedStartMin: number;
  readonly plannedEndMin: number;
};

/**
 * One reachable DP state: the best known way to finish this cue at a given end minute.
 * `startMin` is stored rather than recomputed so reconstruction cannot disagree with the
 * transition that was actually taken.
 */
type DpCell = {
  readonly cost: number; // cumulative weighted shortening cost
  readonly prevEnd: number; // backpointer: predecessor's end minute
  readonly startMin: number; // this cue's chosen start
  readonly duration: number; // chosen d
};

/** endMin -> best cell. Bounded at hardEndMin + 1 <= 241 entries. */
type Layer = Map<number, DpCell>;

const CURSOR_SENTINEL = -1;

/** Minutes from `startsAt` to `at`, rounding partial minutes UPWARD per §12. */
export const minutesFrom = (startsAt: string, at: string): number =>
  Math.ceil((Date.parse(at) - Date.parse(startsAt)) / 60_000);

const emptyRejections = (): RejectionCounts => ({
  fixed_start_unreachable: 0,
  hard_end_exceeded: 0,
  not_strictly_lower_cost: 0,
});

/** Pending cues in fixed order, with `releaseUpdates` applied to a copy. */
const projectPendingCues = (state: EventState, input: RepairInput): PendingCue[] => {
  const releases = new Map(input.releaseUpdates.map((u) => [u.cueId, u.notBeforeMin]));
  return state.cues
    .filter((c) => c.status === 'pending')
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      const override = releases.get(c.id);
      return {
        id: c.id,
        preferredDurationMin: c.preferredDurationMin,
        minDurationMin: c.minDurationMin,
        compressionPenalty: c.compressionPenalty,
        bufferBeforeMin: c.bufferBeforeMin,
        notBeforeMin: override === undefined ? c.notBeforeMin : override,
        fixedStartMin: c.fixedStartMin,
        publishedDurationMin: c.plannedEndMin - c.plannedStartMin,
        plannedStartMin: c.plannedStartMin,
        plannedEndMin: c.plannedEndMin,
      };
    });
};

/**
 * DP cursor: the minute the first pending cue may build on.
 *
 * With an active cue, that is its organizer-supplied forecast end — its actual start and
 * forecast end are fixed inputs and it is never shortened. Otherwise it is the later of
 * the latest completed end and the current event minute, which supports repair BETWEEN
 * cues after a late completion.
 */
const resolveCursor = (state: EventState, input: RepairInput, nowMin: number): number => {
  const clampedNow = Math.max(0, nowMin);
  const active = state.cues.find((c) => c.status === 'active');
  if (active !== undefined) {
    if (input.activeForecastEndMin === null) {
      throw new Error('repairSchedule: activeForecastEndMin is required while a cue is active');
    }
    return input.activeForecastEndMin;
  }
  if (input.activeForecastEndMin !== null) {
    throw new Error('repairSchedule: activeForecastEndMin must be null when no cue is active');
  }
  const completedEnd = (c: Cue): number =>
    c.actualEndAt === null ? c.plannedEndMin : minutesFrom(state.startsAt, c.actualEndAt);
  const latestCompleted = state.cues
    .filter((c) => c.status === 'completed')
    .reduce((acc, c) => Math.max(acc, completedEnd(c)), 0);
  return Math.max(latestCompleted, clampedNow);
};

/**
 * All-minimum-duration, earliest-start pass. In this fixed-order model it yields an
 * earliest reachable time, so it reports the FIRST missed `fixedStartMin`, or the
 * hard-end overrun if no fixed start blocks it.
 *
 * This does NOT prove infeasibility for every imaginable event plan — only within the
 * stated model (one stage, fixed order, integer minutes).
 */
const explainInfeasibility = (
  pending: readonly PendingCue[],
  cursor: number,
  hardEndMin: number,
): RepairFailure => {
  let p = cursor;
  for (const cue of pending) {
    const earliest = Math.max(p + cue.bufferBeforeMin, cue.notBeforeMin ?? 0);
    if (cue.fixedStartMin !== null) {
      if (earliest > cue.fixedStartMin) {
        return {
          rule: 'fixed_start',
          cueId: cue.id,
          earliestMin: earliest,
          limitMin: cue.fixedStartMin,
          shortageMin: earliest - cue.fixedStartMin,
        };
      }
      p = cue.fixedStartMin + cue.minDurationMin;
    } else {
      p = earliest + cue.minDurationMin;
    }
  }
  if (p > hardEndMin) {
    // hard_end is not cue-specific: the overrun belongs to the plan, not one cue.
    return {
      rule: 'hard_end',
      cueId: null,
      earliestMin: p,
      limitMin: hardEndMin,
      shortageMin: p - hardEndMin,
    };
  }
  // The all-minimum path is itself a valid DP path, so the DP cannot fail where this
  // pass succeeds. Reaching here means a solver bug, not an infeasible plan — never
  // return a fake result that looks like it works.
  throw new Error(
    'repairSchedule: DP found no solution but the all-minimum pass is feasible (solver invariant violated)',
  );
};

/** Emitted on every feasible result: minimum_durations, fixed_start per cue, hard_end. */
const buildConstraintChecks = (
  pending: readonly PendingCue[],
  schedule: readonly ScheduleInterval[],
  cursor: number,
  hardEndMin: number,
): ConstraintCheck[] => {
  const byId = new Map(schedule.map((s) => [s.cueId, s]));
  const checks: ConstraintCheck[] = [
    { rule: 'minimum_durations', cueId: null, passed: true },
  ];
  let prevEnd = cursor;
  for (const cue of pending) {
    const got = byId.get(cue.id);
    if (got === undefined) continue;
    const duration = got.endMin - got.startMin;
    if (duration < cue.minDurationMin || duration > cue.preferredDurationMin) {
      checks[0] = { rule: 'minimum_durations', cueId: null, passed: false };
    }
    if (cue.bufferBeforeMin > 0) {
      checks.push({
        rule: 'buffer',
        cueId: cue.id,
        passed: got.startMin >= prevEnd + cue.bufferBeforeMin,
      });
    }
    if (cue.notBeforeMin !== null) {
      checks.push({
        rule: 'not_before',
        cueId: cue.id,
        passed: got.startMin >= cue.notBeforeMin,
      });
    }
    if (cue.fixedStartMin !== null) {
      checks.push({
        rule: 'fixed_start',
        cueId: cue.id,
        passed: got.startMin === cue.fixedStartMin,
      });
    }
    checks.push({ rule: 'contiguous_order', cueId: cue.id, passed: got.startMin >= prevEnd });
    prevEnd = got.endMin;
  }
  checks.push({ rule: 'hard_end', cueId: null, passed: prevEnd <= hardEndMin });
  return checks;
};

const infeasible = (baseRevision: number, failure: RepairFailure): RepairResult => ({
  feasible: false,
  baseRevision,
  ruleVersion: RULE_VERSION,
  changes: [],
  schedule: [],
  recoveredMin: 0,
  weightedShorteningCost: null,
  projectedFinishMin: null,
  // The probe honours every minimum duration by construction, so what failed is the
  // fixed start or the hard end, never a minimum.
  constraintChecks: [
    { rule: 'minimum_durations', cueId: null, passed: true },
    ...(failure.rule === 'fixed_start'
      ? [{ rule: 'fixed_start', cueId: failure.cueId, passed: false }]
      : []),
    { rule: 'hard_end', cueId: null, passed: failure.rule !== 'hard_end' },
  ],
  failure,
});

/**
 * Dev-build entry point: the same solve, plus per-reason rejection counts. Turns
 * "why did this case come back infeasible" into a one-line answer instead of a
 * debugging session.
 */
export function repairScheduleWithDiagnostics(
  state: EventState,
  input: RepairInput,
  nowMin: number,
): { result: RepairResult; rejections: RejectionCounts } {
  const rejections = emptyRejections();
  const reject = (reason: RejectionReason): void => {
    rejections[reason] += 1;
  };

  const pending = projectPendingCues(state, input);
  const cursor = resolveCursor(state, input, nowMin);
  const hardEndMin = state.hardEndMin;
  const baseRevision = state.revision;

  // No remaining cues: just validate the cursor against the hard end.
  if (pending.length === 0) {
    if (cursor > hardEndMin) {
      return {
        result: infeasible(baseRevision, {
          rule: 'hard_end',
          cueId: null,
          earliestMin: cursor,
          limitMin: hardEndMin,
          shortageMin: cursor - hardEndMin,
        }),
        rejections,
      };
    }
    return {
      result: {
        feasible: true,
        baseRevision,
        ruleVersion: RULE_VERSION,
        changes: [],
        schedule: [],
        recoveredMin: 0,
        weightedShorteningCost: 0,
        projectedFinishMin: cursor,
        constraintChecks: [
          { rule: 'minimum_durations', cueId: null, passed: true },
          { rule: 'hard_end', cueId: null, passed: true },
        ],
        failure: null,
      },
      rejections,
    };
  }

  // ---- Bounded DP ----------------------------------------------------------------
  // Layers are indexed 0..pending.length; layer 0 holds only the cursor.
  const layers: Layer[] = [
    new Map([[cursor, { cost: 0, prevEnd: CURSOR_SENTINEL, startMin: cursor, duration: 0 }]]),
  ];

  for (const cue of pending) {
    const prev = layers[layers.length - 1] as Layer;
    const next: Layer = new Map();
    // Determinism: previous ends ASCENDING.
    const prevEnds = [...prev.keys()].sort((a, b) => a - b);
    for (const p of prevEnds) {
      const cell = prev.get(p) as DpCell;
      const earliest = Math.max(p + cue.bufferBeforeMin, cue.notBeforeMin ?? 0);
      let start: number;
      if (cue.fixedStartMin !== null) {
        if (earliest > cue.fixedStartMin) {
          reject('fixed_start_unreachable');
          continue;
        }
        start = cue.fixedStartMin;
      } else {
        start = earliest;
      }
      // Determinism: durations DESCENDING.
      for (let d = cue.preferredDurationMin; d >= cue.minDurationMin; d--) {
        const end = start + d;
        if (end > hardEndMin) {
          reject('hard_end_exceeded');
          continue;
        }
        const cost = cell.cost + cue.compressionPenalty * (cue.preferredDurationMin - d);
        const incumbent = next.get(end);
        // Determinism: replace ONLY on strictly lower cost.
        if (incumbent === undefined || cost < incumbent.cost) {
          next.set(end, { cost, prevEnd: p, startMin: start, duration: d });
        } else {
          reject('not_strictly_lower_cost');
        }
      }
    }
    layers.push(next);
    if (next.size === 0) break;
  }

  const finalLayer = layers[layers.length - 1] as Layer;
  if (layers.length !== pending.length + 1 || finalLayer.size === 0) {
    return { result: infeasible(baseRevision, explainInfeasibility(pending, cursor, hardEndMin)), rejections };
  }

  // Final layer: minimum cost, then earliest finish. Ascending keys + strictly-lower
  // comparison makes the earliest end win a cost tie.
  let bestEnd = -1;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const end of [...finalLayer.keys()].sort((a, b) => a - b)) {
    const cost = (finalLayer.get(end) as DpCell).cost;
    if (cost < bestCost) {
      bestCost = cost;
      bestEnd = end;
    }
  }

  // Reconstruct via backpointers, walking layers backwards.
  const schedule: ScheduleInterval[] = [];
  let endMin = bestEnd;
  for (let i = pending.length; i >= 1; i--) {
    const cell = (layers[i] as Layer).get(endMin) as DpCell;
    schedule.unshift({
      cueId: (pending[i - 1] as PendingCue).id,
      startMin: cell.startMin,
      endMin,
    });
    endMin = cell.prevEnd;
  }

  const changes: ScheduleChange[] = [];
  let publishedTotal = 0;
  let newTotal = 0;
  for (let i = 0; i < pending.length; i++) {
    const cue = pending[i] as PendingCue;
    const got = schedule[i] as ScheduleInterval;
    publishedTotal += cue.publishedDurationMin;
    newTotal += got.endMin - got.startMin;
    if (got.startMin !== cue.plannedStartMin || got.endMin !== cue.plannedEndMin) {
      changes.push({
        cueId: cue.id,
        oldStartMin: cue.plannedStartMin,
        oldEndMin: cue.plannedEndMin,
        newStartMin: got.startMin,
        newEndMin: got.endMin,
      });
    }
  }

  return {
    result: {
      feasible: true,
      baseRevision,
      ruleVersion: RULE_VERSION,
      changes,
      schedule,
      // Shortening of pending cues relative to their CURRENT PUBLISHED durations — not
      // the entered delay. May be negative: that is RESTORED TIME, never recovered delay.
      recoveredMin: publishedTotal - newTotal,
      // Measured against PREFERRED durations.
      weightedShorteningCost: bestCost,
      projectedFinishMin: bestEnd,
      constraintChecks: buildConstraintChecks(pending, schedule, cursor, hardEndMin),
      failure: null,
    },
    rejections,
  };
}

/**
 * Minimum-weight shortening plan within the stated model (one stage, fixed cue order,
 * integer minutes, <=20 cues, horizon <=240 min, preferred duration <=60 min/cue).
 *
 * Complexity is O(cues x horizon x durationRange), bounded near 288,000 candidate
 * transitions under those caps. Actual latency must be measured, not assumed.
 */
export function repairSchedule(
  state: EventState,
  input: RepairInput,
  nowMin: number,
): RepairResult {
  return repairScheduleWithDiagnostics(state, input, nowMin).result;
}
