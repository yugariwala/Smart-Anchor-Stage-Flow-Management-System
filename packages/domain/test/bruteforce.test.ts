/**
 * Brute-force comparison: the DP must match exhaustive enumeration on the true optimum.
 *
 * Cases come from a fixed-seed PRNG, never `Math.random()`, so a failure is reproducible
 * from the seed alone.
 *
 * Per docs/decisions.md #7, feasibility, cost and finish minute are asserted on every
 * case; the full per-cue schedule is asserted only where the brute-force optimum is
 * PROVABLY UNIQUE. Pinning the interior split universally would test iteration order
 * rather than a documented rule — §7A names no tie-break between two plans that share
 * both cost and finish minute.
 */

import { describe, expect, it } from 'vitest';

import { repairSchedule } from '../src/repair';
import type { Cue, EventState, RepairInput, ScheduleInterval } from '../src/types';
import { planIsValid, validatePlan } from '../src/validatePlan';

const SEED = 0x5c0e_b17a;
const CASE_COUNT = 80; // §18 requires at least 50

/** mulberry32 — small, fast, fully determined by its seed. */
const makePrng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type GeneratedCase = {
  readonly index: number;
  readonly state: EventState;
  readonly input: RepairInput;
  readonly nowMin: number;
};

const ISO_START = '2026-09-19T04:30:00Z';

/**
 * Cases are generated so that compression is actually FORCED in a good share of them.
 *
 * A naive generator (random absolute `hardEndMin`, random absolute `fixedStartMin`)
 * produces a corpus that is mostly trivially infeasible or trivially zero-cost, which
 * would make "the DP matches the true optimum" a vacuous assertion. So the horizon is
 * chosen RELATIVE to the all-minimum and all-preferred finishes, and rule offsets are
 * chosen relative to where the cue actually lands.
 */
const buildCase = (index: number, rnd: () => number): GeneratedCase => {
  const int = (min: number, max: number): number => min + Math.floor(rnd() * (max - min + 1));

  const pendingCount = int(2, 4);
  const cursor = int(0, 10);

  type Spec = {
    preferred: number;
    min: number;
    penalty: number;
    buffer: number;
    notBeforeMin: number | null;
    fixedStartMin: number | null;
  };

  const specs: Spec[] = [];
  for (let i = 0; i < pendingCount; i++) {
    const preferred = int(2, 8);
    specs.push({
      preferred,
      min: int(1, preferred),
      penalty: int(1, 5),
      buffer: int(0, 2),
      notBeforeMin: null,
      fixedStartMin: null,
    });
  }

  // Where each cue would land at all-minimum and at all-preferred durations.
  const minStarts: number[] = [];
  const prefStarts: number[] = [];
  let minCursor = cursor;
  let prefCursor = cursor;
  for (const spec of specs) {
    minCursor += spec.buffer;
    prefCursor += spec.buffer;
    minStarts.push(minCursor);
    prefStarts.push(prefCursor);
    minCursor += spec.min;
    prefCursor += spec.preferred;
  }
  const minFinish = minCursor;
  const prefFinish = prefCursor;

  // A horizon spanning [minFinish - 2, prefFinish + 2] gives all three regimes:
  // below minFinish => infeasible, between => compression forced, above => zero cost.
  const hardEndMin = Math.min(240, Math.max(1, int(Math.max(1, minFinish - 2), prefFinish + 2)));

  // Rule offsets relative to where the cue lands, so they bite without being absurd.
  for (let i = 0; i < pendingCount; i++) {
    const spec = specs[i] as Spec;
    if (rnd() < 0.3) {
      spec.fixedStartMin = Math.max(0, (prefStarts[i] as number) + int(-2, 2));
    } else if (rnd() < 0.3) {
      spec.notBeforeMin = Math.max(0, (minStarts[i] as number) + int(-1, 3));
    }
  }

  const cues: Cue[] = [
    {
      id: 'active',
      order: 0,
      title: 'Active cue',
      speakerId: null,
      preferredDurationMin: 5,
      minDurationMin: 5,
      compressionPenalty: 1,
      bufferBeforeMin: 0,
      notBeforeMin: null,
      fixedStartMin: null,
      plannedStartMin: 0,
      plannedEndMin: 5,
      status: 'active',
      actualStartAt: ISO_START,
      actualEndAt: null,
      actualTimeSource: 'server_clock',
    },
  ];

  // Published intervals are the all-preferred layout, clamped to the horizon.
  for (let i = 0; i < pendingCount; i++) {
    const spec = specs[i] as Spec;
    const plannedStartMin = Math.min(prefStarts[i] as number, hardEndMin);
    cues.push({
      id: `c${i}`,
      order: i + 1,
      title: `Cue ${i}`,
      speakerId: null,
      preferredDurationMin: spec.preferred,
      minDurationMin: spec.min,
      compressionPenalty: spec.penalty,
      bufferBeforeMin: spec.buffer,
      notBeforeMin: spec.notBeforeMin,
      fixedStartMin: spec.fixedStartMin,
      plannedStartMin,
      plannedEndMin: Math.min(plannedStartMin + spec.preferred, hardEndMin),
      status: 'pending',
      actualStartAt: null,
      actualEndAt: null,
      actualTimeSource: null,
    });
  }

  const state: EventState = {
    id: `case-${index}`,
    ownerUid: 'brute-force',
    name: `Generated case ${index}`,
    timezone: 'Asia/Kolkata',
    startsAt: ISO_START,
    hardEndMin,
    mode: 'live',
    phase: 'running',
    revision: 1,
    scenarioNowAt: null,
    currentCueId: 'active',
    activeForecastEndMin: cursor,
    scheduleHealth: 'valid',
    demoSeed: null,
    eventFacts: [],
    speakers: [],
    cues,
    approvedScripts: [],
    announcements: [],
    createdAt: ISO_START,
    updatedAt: ISO_START,
    expiresAt: '2026-09-22T04:30:00Z',
  };

  return {
    index,
    state,
    input: { expectedRevision: 1, activeForecastEndMin: cursor, releaseUpdates: [] },
    nowMin: 0,
  };
};

type Optimum = {
  feasible: boolean;
  cost: number | null;
  finish: number | null;
  /** Every optimal plan found, to decide whether the optimum is unique. */
  plans: ScheduleInterval[][];
};

/**
 * Exhaustive enumeration over every duration combination, applying the §7A start rule
 * independently of the solver. Optimal set = minimum cost, then earliest finish.
 */
const bruteForce = (state: EventState): Optimum => {
  const pending = state.cues
    .filter((c) => c.status === 'pending')
    .slice()
    .sort((a, b) => a.order - b.order);
  const cursor = state.activeForecastEndMin ?? 0;

  let bestCost = Number.POSITIVE_INFINITY;
  let bestFinish = Number.POSITIVE_INFINITY;
  let plans: ScheduleInterval[][] = [];

  const walk = (i: number, prevEnd: number, cost: number, acc: ScheduleInterval[]): void => {
    if (i === pending.length) {
      if (cost < bestCost || (cost === bestCost && prevEnd < bestFinish)) {
        bestCost = cost;
        bestFinish = prevEnd;
        plans = [acc.slice()];
      } else if (cost === bestCost && prevEnd === bestFinish) {
        plans.push(acc.slice());
      }
      return;
    }
    const cue = pending[i] as Cue;
    const earliest = Math.max(prevEnd + cue.bufferBeforeMin, cue.notBeforeMin ?? 0);
    let start: number;
    if (cue.fixedStartMin !== null) {
      if (earliest > cue.fixedStartMin) return;
      start = cue.fixedStartMin;
    } else {
      start = earliest;
    }
    for (let d = cue.minDurationMin; d <= cue.preferredDurationMin; d++) {
      const end = start + d;
      if (end > state.hardEndMin) continue;
      acc.push({ cueId: cue.id, startMin: start, endMin: end });
      walk(i + 1, end, cost + cue.compressionPenalty * (cue.preferredDurationMin - d), acc);
      acc.pop();
    }
  };

  walk(0, cursor, 0, []);

  if (plans.length === 0) return { feasible: false, cost: null, finish: null, plans: [] };
  return { feasible: true, cost: bestCost, finish: bestFinish, plans };
};

const serialise = (plan: readonly ScheduleInterval[]): string =>
  plan.map((s) => `${s.cueId}:${s.startMin}-${s.endMin}`).join('|');

describe(`brute-force comparison over ${CASE_COUNT} seeded cases`, () => {
  const rnd = makePrng(SEED);
  const cases = Array.from({ length: CASE_COUNT }, (_, i) => buildCase(i, rnd));

  it('is not a degenerate corpus', () => {
    const truths = cases.map((c) => bruteForce(c.state));
    const feasibleCount = truths.filter((t) => t.feasible).length;
    // A corpus where almost every case is infeasible, or almost every optimum costs 0,
    // would make the comparison vacuous: the DP's objective would never be tested.
    const compressedCount = truths.filter((t) => t.feasible && (t.cost ?? 0) > 0).length;
    expect(feasibleCount).toBeGreaterThan(CASE_COUNT * 0.4);
    expect(feasibleCount).toBeLessThan(CASE_COUNT * 0.95);
    expect(compressedCount).toBeGreaterThan(CASE_COUNT * 0.25);

    // Sample counts for the README's measured-results section (§18).
    const unique = truths.filter((t) => t.feasible && new Set(t.plans.map(serialise)).size === 1).length;
    console.log(
      `[corpus] seed=0x${SEED.toString(16)} cases=${CASE_COUNT} feasible=${feasibleCount} ` +
        `infeasible=${CASE_COUNT - feasibleCount} compressed=${compressedCount} uniqueOptimum=${unique}`,
    );
  });

  for (const testCase of cases) {
    const truth = bruteForce(testCase.state);
    const uniqueOptima = new Set(truth.plans.map(serialise)).size;

    it(`case ${testCase.index}: matches the true optimum${uniqueOptima === 1 ? ' (unique)' : ''}`, () => {
      const result = repairSchedule(testCase.state, testCase.input, testCase.nowMin);

      // Asserted on every case.
      expect(result.feasible).toBe(truth.feasible);
      expect(result.weightedShorteningCost).toBe(truth.cost);
      expect(result.projectedFinishMin).toBe(truth.finish);

      if (!truth.feasible) {
        expect(result.failure).not.toBeNull();
        expect(result.schedule).toEqual([]);
        return;
      }

      // The DP's plan must always be one of the true optima, and must survive the
      // independent validator.
      const plansAsStrings = new Set(truth.plans.map(serialise));
      expect(plansAsStrings.has(serialise(result.schedule))).toBe(true);
      expect(
        planIsValid(
          validatePlan(testCase.state, result.schedule, {
            activeForecastEndMin: testCase.input.activeForecastEndMin,
            nowMin: testCase.nowMin,
          }),
        ),
      ).toBe(true);

      // Full schedule asserted only where the optimum is provably unique.
      if (uniqueOptima === 1) {
        expect(result.schedule).toEqual(truth.plans[0]);
      }
    });
  }
});
