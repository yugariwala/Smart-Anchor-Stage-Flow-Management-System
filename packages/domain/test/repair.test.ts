import { describe, expect, it } from 'vitest';

import { repairSchedule, repairScheduleWithDiagnostics } from '../src/repair';
import { eventStateSchema, withinStateBodyLimit } from '../src/schemas';
import type { Cue, EventState, RepairInput } from '../src/types';
import { planIsValid, validatePlan } from '../src/validatePlan';

import fixtureJson from '../../../fixtures/college-demo-v1.json';

/** Parsed once through the real schema — the fixture must be a legal EventState. */
const FIXTURE: EventState = eventStateSchema.parse(fixtureJson) as EventState;

const cueOf = (state: EventState, id: string): Cue => {
  const cue = state.cues.find((c) => c.id === id);
  if (cue === undefined) throw new Error(`no cue ${id}`);
  return cue;
};

const withCues = (state: EventState, mutate: (cues: Cue[]) => Cue[]): EventState => ({
  ...state,
  cues: mutate(state.cues.map((c) => ({ ...c }))),
});

const input = (activeForecastEndMin: number | null, releaseUpdates: RepairInput['releaseUpdates'] = []): RepairInput => ({
  expectedRevision: 7,
  activeForecastEndMin,
  releaseUpdates,
});

/** Minute 25 is 10:25 — the fixture's scenario clock during the keynote. */
const NOW_MIN = 25;

describe('fixture sanity', () => {
  it('is a schema-valid EventState within the 128 KB body limit', () => {
    expect(FIXTURE.cues).toHaveLength(6);
    expect(withinStateBodyLimit(FIXTURE)).toBe(true);
    expect(cueOf(FIXTURE, 'sponsor').fixedStartMin).toBe(45);
    // Zero buffers throughout, so the arithmetic in §5 is visible.
    expect(FIXTURE.cues.every((c) => c.bufferBeforeMin === 0)).toBe(true);
    // Penalties 1/1/3/1/1/1 in cue order.
    expect(
      FIXTURE.cues.slice().sort((a, b) => a.order - b.order).map((c) => c.compressionPenalty),
    ).toEqual([1, 1, 3, 1, 1, 1]);
  });
});

describe('+12 minutes (keynote forecast ends 10:37)', () => {
  const result = repairSchedule(FIXTURE, input(37), NOW_MIN);

  it('is feasible with the exact §5/§12 schedule', () => {
    expect(result.feasible).toBe(true);
    expect(result.ruleVersion).toBe('fixed-order-v1');
    expect(result.baseRevision).toBe(7);
    expect(result.schedule).toEqual([
      { cueId: 'qa', startMin: 37, endMin: 41 },
      { cueId: 'community', startMin: 41, endMin: 45 },
      { cueId: 'sponsor', startMin: 45, endMin: 55 },
      { cueId: 'closing', startMin: 55, endMin: 60 },
    ]);
  });

  it('recovers 12 minutes at a weighted cost of 24', () => {
    expect(result.recoveredMin).toBe(12);
    expect(result.weightedShorteningCost).toBe(24);
    expect(result.projectedFinishMin).toBe(60);
    expect(result.failure).toBeNull();
  });

  it('reports only the two changed intervals', () => {
    expect(result.changes).toEqual([
      { cueId: 'qa', oldStartMin: 25, oldEndMin: 35, newStartMin: 37, newEndMin: 41 },
      { cueId: 'community', oldStartMin: 35, oldEndMin: 45, newStartMin: 41, newEndMin: 45 },
    ]);
  });

  it('always emits minimum_durations, fixed_start per applicable cue and hard_end', () => {
    expect(result.constraintChecks).toEqual(
      expect.arrayContaining([
        { rule: 'minimum_durations', cueId: null, passed: true },
        { rule: 'fixed_start', cueId: 'sponsor', passed: true },
        { rule: 'hard_end', cueId: null, passed: true },
      ]),
    );
    expect(result.constraintChecks.every((c) => c.passed)).toBe(true);
  });

  it('survives independent validation by validatePlan', () => {
    const checks = validatePlan(FIXTURE, result.schedule, {
      activeForecastEndMin: 37,
      nowMin: NOW_MIN,
    });
    expect(planIsValid(checks)).toBe(true);
  });
});

describe('+8 minutes (forecast end 10:33) — penalty weights must steer the split', () => {
  const result = repairSchedule(FIXTURE, input(33), NOW_MIN);

  it('shortens community by 6 and Q&A by 2, at cost 12', () => {
    expect(result.feasible).toBe(true);
    expect(result.schedule).toEqual([
      { cueId: 'qa', startMin: 33, endMin: 41 }, // 8 min: shortened by 2
      { cueId: 'community', startMin: 41, endMin: 45 }, // 4 min: shortened by 6
      { cueId: 'sponsor', startMin: 45, endMin: 55 },
      { cueId: 'closing', startMin: 55, endMin: 60 },
    ]);
    expect(result.weightedShorteningCost).toBe(12);
    expect(result.recoveredMin).toBe(8);
    expect(result.projectedFinishMin).toBe(60);
  });

  it('did not take the naive cheapest-first split', () => {
    // Shortening the cheap cue first gives qa=10, community=2 — which breaks
    // community's minimum of 4. If this assertion ever inverts, the objective is wrong.
    const qa = result.schedule.find((s) => s.cueId === 'qa');
    expect(qa?.endMin === undefined ? 0 : qa.endMin - qa.startMin).toBe(8);
  });
});

describe('+19 minutes (forecast end 10:44) — infeasible', () => {
  const result = repairSchedule(FIXTURE, input(44), NOW_MIN);

  it('refuses with a quantified fixed_start failure', () => {
    expect(result.feasible).toBe(false);
    expect(result.failure).toEqual({
      rule: 'fixed_start',
      cueId: 'sponsor',
      earliestMin: 52,
      limitMin: 45,
      shortageMin: 7,
    });
  });

  it('empties the plan and nulls the objective values', () => {
    expect(result.schedule).toEqual([]);
    expect(result.changes).toEqual([]);
    expect(result.weightedShorteningCost).toBeNull();
    expect(result.projectedFinishMin).toBeNull();
  });
});

describe('determinism and purity', () => {
  it('returns identical output when called twice on identical input', () => {
    const a = repairSchedule(FIXTURE, input(37), NOW_MIN);
    const b = repairSchedule(FIXTURE, input(37), NOW_MIN);
    expect(a).toEqual(b);
  });

  it('never adds the delta twice: resubmitting the absolute forecast is idempotent', () => {
    const once = repairSchedule(FIXTURE, input(37), NOW_MIN);
    const twice = repairSchedule(FIXTURE, input(37), NOW_MIN);
    expect(twice.schedule).toEqual(once.schedule);
    expect(twice.recoveredMin).toBe(once.recoveredMin);
  });

  it('does not mutate its arguments', () => {
    const state = Object.freeze({
      ...FIXTURE,
      cues: Object.freeze(FIXTURE.cues.map((c) => Object.freeze({ ...c }))) as unknown as Cue[],
    }) as EventState;
    const frozenInput = Object.freeze(input(37, [])) as RepairInput;
    expect(() => repairSchedule(state, frozenInput, NOW_MIN)).not.toThrow();
  });

  it('reports per-reason rejection counts for dev builds', () => {
    const { rejections } = repairScheduleWithDiagnostics(FIXTURE, input(44), NOW_MIN);
    expect(rejections.fixed_start_unreachable).toBeGreaterThan(0);
    expect(Object.keys(rejections).sort()).toEqual([
      'fixed_start_unreachable',
      'hard_end_exceeded',
      'not_strictly_lower_cost',
    ]);
  });
});

describe('restored time is not recovered delay', () => {
  /** The fixture after a +12 repair was published: qa and community are already at 4. */
  const compressed = withCues(FIXTURE, (cues) =>
    cues.map((c) => {
      if (c.id === 'qa') return { ...c, plannedStartMin: 37, plannedEndMin: 41 };
      if (c.id === 'community') return { ...c, plannedStartMin: 41, plannedEndMin: 45 };
      return c;
    }),
  );

  it('produces a negative recoveredMin when the keynote finishes early', () => {
    // Keynote forecast drops back to 25, so the solver can restore preferred durations.
    const result = repairSchedule(compressed, input(25), NOW_MIN);
    expect(result.feasible).toBe(true);
    expect(result.schedule).toEqual([
      { cueId: 'qa', startMin: 25, endMin: 35 },
      { cueId: 'community', startMin: 35, endMin: 45 },
      { cueId: 'sponsor', startMin: 45, endMin: 55 },
      { cueId: 'closing', startMin: 55, endMin: 60 },
    ]);
    expect(result.weightedShorteningCost).toBe(0);
    // Published pending durations 4+4+10+5 = 23; new 10+10+10+5 = 35. 23 - 35 = -12.
    expect(result.recoveredMin).toBe(-12);
  });

  it('a negative recoveredMin means restored time, never recovered delay', () => {
    const result = repairSchedule(compressed, input(25), NOW_MIN);
    // The contract callers and UI rely on: sign carries the meaning.
    expect(result.recoveredMin).toBeLessThan(0);
    expect(Math.abs(result.recoveredMin)).toBe(12);
  });
});

describe('hard rules', () => {
  it('respects a positive buffer before a cue', () => {
    const buffered = withCues(FIXTURE, (cues) =>
      cues.map((c) => (c.id === 'qa' ? { ...c, bufferBeforeMin: 3 } : c)),
    );
    const result = repairSchedule(buffered, input(37), NOW_MIN);
    expect(result.feasible).toBe(false);
    // 37 + 3 buffer + 4 min + 4 min = 48 > sponsor's fixed 45.
    expect(result.failure).toEqual({
      rule: 'fixed_start',
      cueId: 'sponsor',
      earliestMin: 48,
      limitMin: 45,
      shortageMin: 3,
    });
  });

  it('honours a buffer that still fits', () => {
    const buffered = withCues(FIXTURE, (cues) =>
      cues.map((c) => (c.id === 'community' ? { ...c, bufferBeforeMin: 2 } : c)),
    );
    const result = repairSchedule(buffered, input(35), NOW_MIN);
    expect(result.feasible).toBe(true);
    const qa = result.schedule.find((s) => s.cueId === 'qa');
    const community = result.schedule.find((s) => s.cueId === 'community');
    expect(community?.startMin).toBeGreaterThanOrEqual((qa?.endMin ?? 0) + 2);
    expect(
      result.constraintChecks.find((c) => c.rule === 'buffer' && c.cueId === 'community')?.passed,
    ).toBe(true);
  });

  it('applies a notBeforeMin release that falls after a fixed start', () => {
    // Release community at minute 46 — later than sponsor's fixed start of 45.
    const result = repairSchedule(FIXTURE, input(37, [{ cueId: 'community', notBeforeMin: 46 }]), NOW_MIN);
    expect(result.feasible).toBe(false);
    expect(result.failure).toEqual({
      rule: 'fixed_start',
      cueId: 'sponsor',
      earliestMin: 50, // release 46 + community minimum 4
      limitMin: 45,
      shortageMin: 5,
    });
  });

  it('applies a notBeforeMin release that still fits', () => {
    const result = repairSchedule(FIXTURE, input(33, [{ cueId: 'qa', notBeforeMin: 35 }]), NOW_MIN);
    expect(result.feasible).toBe(true);
    const qa = result.schedule.find((s) => s.cueId === 'qa');
    expect(qa?.startMin).toBe(35);
    expect(
      result.constraintChecks.find((c) => c.rule === 'not_before' && c.cueId === 'qa')?.passed,
    ).toBe(true);
  });

  it('reports a hard_end overrun with cueId null when no fixed start blocks first', () => {
    const noFixed = withCues(FIXTURE, (cues) =>
      cues.map((c) => (c.id === 'sponsor' ? { ...c, fixedStartMin: null } : c)),
    );
    const result = repairSchedule(noFixed, input(44), NOW_MIN);
    expect(result.feasible).toBe(false);
    // 44 + 4 + 4 + 10 + 5 = 67 against a hard end of 60.
    expect(result.failure).toEqual({
      rule: 'hard_end',
      cueId: null,
      earliestMin: 67,
      limitMin: 60,
      shortageMin: 7,
    });
  });

  it('handles no pending cues by validating the cursor against the hard end', () => {
    const allDone = withCues(FIXTURE, (cues) =>
      cues.map((c) => ({
        ...c,
        status: 'completed' as const,
        actualStartAt: c.actualStartAt ?? FIXTURE.startsAt,
        actualEndAt: c.actualEndAt ?? '2026-09-19T05:25:00Z',
      })),
    );
    const state: EventState = { ...allDone, currentCueId: null, activeForecastEndMin: null };
    const result = repairSchedule(state, input(null), 55);
    expect(result.feasible).toBe(true);
    expect(result.schedule).toEqual([]);
    expect(result.projectedFinishMin).toBe(55);
    expect(result.weightedShorteningCost).toBe(0);
    expect(result.recoveredMin).toBe(0);
  });

  it('reports hard_end when the cursor alone already exceeds it and nothing is pending', () => {
    const allDone = withCues(FIXTURE, (cues) =>
      cues.map((c) => ({
        ...c,
        status: 'completed' as const,
        actualStartAt: c.actualStartAt ?? FIXTURE.startsAt,
        actualEndAt: c.actualEndAt ?? '2026-09-19T05:40:00Z',
      })),
    );
    const state: EventState = { ...allDone, currentCueId: null, activeForecastEndMin: null };
    const result = repairSchedule(state, input(null), 70);
    expect(result.feasible).toBe(false);
    expect(result.failure).toEqual({
      rule: 'hard_end',
      cueId: null,
      earliestMin: 70,
      limitMin: 60,
      shortageMin: 10,
    });
  });

  it('never shortens a cue whose minimum equals its preferred', () => {
    const result = repairSchedule(FIXTURE, input(37), NOW_MIN);
    const sponsor = result.schedule.find((s) => s.cueId === 'sponsor');
    const closing = result.schedule.find((s) => s.cueId === 'closing');
    expect((sponsor?.endMin ?? 0) - (sponsor?.startMin ?? 0)).toBe(10);
    expect((closing?.endMin ?? 0) - (closing?.startMin ?? 0)).toBe(5);
  });

  it('solves a zero-slack exact fit', () => {
    // +12 is exactly zero-slack: both compressible cues are forced to their minimums.
    const result = repairSchedule(FIXTURE, input(37), NOW_MIN);
    expect(result.feasible).toBe(true);
    const qa = result.schedule.find((s) => s.cueId === 'qa');
    const community = result.schedule.find((s) => s.cueId === 'community');
    expect((qa?.endMin ?? 0) - (qa?.startMin ?? 0)).toBe(4);
    expect((community?.endMin ?? 0) - (community?.startMin ?? 0)).toBe(4);
    // One more minute of delay is infeasible, proving there was no slack left.
    expect(repairSchedule(FIXTURE, input(38), NOW_MIN).feasible).toBe(false);
  });

  it('never touches completed or active cues', () => {
    const result = repairSchedule(FIXTURE, input(37), NOW_MIN);
    const touched = new Set(result.schedule.map((s) => s.cueId));
    expect(touched.has('opening')).toBe(false);
    expect(touched.has('keynote')).toBe(false);
    expect(result.changes.some((c) => c.cueId === 'opening' || c.cueId === 'keynote')).toBe(false);
  });

  it('clamps a negative relative now to zero', () => {
    const pristine = withCues(FIXTURE, (cues) =>
      cues.map((c) => ({
        ...c,
        status: 'pending' as const,
        actualStartAt: null,
        actualEndAt: null,
      })),
    );
    const state: EventState = { ...pristine, currentCueId: null, activeForecastEndMin: null };
    const fromZero = repairSchedule(state, input(null), 0);
    const fromNegative = repairSchedule(state, input(null), -30);
    expect(fromNegative).toEqual(fromZero);
    expect(fromZero.schedule[0]?.startMin).toBe(0);
  });

  it('rejects a mismatched forecast argument rather than guessing', () => {
    expect(() => repairSchedule(FIXTURE, input(null), NOW_MIN)).toThrow(
      /activeForecastEndMin is required/,
    );
  });
});

describe('validatePlan rejects a hand-crafted invalid plan per hard rule', () => {
  const ctx = { activeForecastEndMin: 37, nowMin: NOW_MIN };
  const valid = repairSchedule(FIXTURE, input(37), NOW_MIN).schedule;

  const failed = (checks: ReturnType<typeof validatePlan>, rule: string): boolean =>
    checks.some((c) => c.rule === rule && !c.passed);

  it("accepts the solver's own output", () => {
    expect(planIsValid(validatePlan(FIXTURE, valid, ctx))).toBe(true);
  });

  it('rejects a duration below the minimum', () => {
    const bad = valid.map((s) => (s.cueId === 'qa' ? { ...s, endMin: 39 } : s));
    expect(failed(validatePlan(FIXTURE, bad, ctx), 'minimum_durations')).toBe(true);
  });

  it('rejects a duration above the preferred', () => {
    const bad = valid.map((s) => (s.cueId === 'qa' ? { ...s, endMin: 60 } : s));
    expect(failed(validatePlan(FIXTURE, bad, ctx), 'minimum_durations')).toBe(true);
  });

  it('rejects a violated fixed start', () => {
    const bad = valid.map((s) =>
      s.cueId === 'sponsor' ? { ...s, startMin: 46, endMin: 56 } : s,
    );
    expect(failed(validatePlan(FIXTURE, bad, ctx), 'fixed_start')).toBe(true);
  });

  it('rejects a plan that finishes after the hard end', () => {
    const bad = valid.map((s) => (s.cueId === 'closing' ? { ...s, startMin: 58, endMin: 63 } : s));
    expect(failed(validatePlan(FIXTURE, bad, ctx), 'hard_end')).toBe(true);
  });

  it('rejects overlapping intervals', () => {
    const bad = valid.map((s) => (s.cueId === 'community' ? { ...s, startMin: 39 } : s));
    expect(failed(validatePlan(FIXTURE, bad, ctx), 'contiguous_order')).toBe(true);
  });

  it('rejects a violated buffer', () => {
    const buffered = withCues(FIXTURE, (cues) =>
      cues.map((c) => (c.id === 'community' ? { ...c, bufferBeforeMin: 2 } : c)),
    );
    expect(failed(validatePlan(buffered, valid, ctx), 'buffer')).toBe(true);
  });

  it('rejects a violated notBeforeMin', () => {
    const released = withCues(FIXTURE, (cues) =>
      cues.map((c) => (c.id === 'qa' ? { ...c, notBeforeMin: 40 } : c)),
    );
    expect(failed(validatePlan(released, valid, ctx), 'not_before')).toBe(true);
  });

  it("rejects a plan that starts before the active cue's forecast end", () => {
    const bad = valid.map((s) => (s.cueId === 'qa' ? { ...s, startMin: 30, endMin: 34 } : s));
    expect(failed(validatePlan(FIXTURE, bad, ctx), 'contiguous_order')).toBe(true);
  });

  it('rejects a plan that includes a completed cue', () => {
    const bad = [{ cueId: 'opening', startMin: 0, endMin: 5 }, ...valid];
    const checks = validatePlan(FIXTURE, bad, ctx);
    expect(failed(checks, 'completed_immutable')).toBe(true);
    expect(failed(checks, 'candidate_covers_pending')).toBe(true);
  });

  it('rejects a plan that includes the active cue', () => {
    const bad = [{ cueId: 'keynote', startMin: 5, endMin: 37 }, ...valid];
    expect(failed(validatePlan(FIXTURE, bad, ctx), 'active_immutable')).toBe(true);
  });

  it('rejects a plan that omits a pending cue', () => {
    const bad = valid.filter((s) => s.cueId !== 'closing');
    expect(failed(validatePlan(FIXTURE, bad, ctx), 'candidate_covers_pending')).toBe(true);
  });

  it('rejects non-integer minutes', () => {
    const bad = valid.map((s) => (s.cueId === 'qa' ? { ...s, endMin: 41.5 } : s));
    expect(failed(validatePlan(FIXTURE, bad, ctx), 'integer_minutes')).toBe(true);
  });

  it("rejects a forecast earlier than the active cue's actual start", () => {
    const checks = validatePlan(FIXTURE, valid, { activeForecastEndMin: 3, nowMin: 0 });
    expect(failed(checks, 'active_forecast_after_actual_start')).toBe(true);
  });

  it('rejects a forecast earlier than the current minute', () => {
    const checks = validatePlan(FIXTURE, valid, { activeForecastEndMin: 20, nowMin: 25 });
    expect(failed(checks, 'active_forecast_after_now')).toBe(true);
  });
});
