import { describe, expect, it } from 'vitest';

import {
  advanceRehearsalClock,
  applyRepair,
  completeCue,
  previewRepair,
  sameRepairOutcome,
  startCue,
  TransitionError,
} from '../src/transitions';
import { renderOperationalCue } from '../src/renderOperationalCue';
import { eventStateSchema } from '../src/schemas';
import type { Cue, EventState, RepairInput } from '../src/types';

import fixtureJson from '../../../fixtures/college-demo-v1.json';

const FIXTURE: EventState = eventStateSchema.parse(fixtureJson) as EventState;

/** Minute N of the fixture, as an ISO instant. */
const atMinute = (min: number): string =>
  new Date(Date.parse(FIXTURE.startsAt) + min * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

const SERVER_NOW = '2026-09-19T05:00:00Z';

const withCues = (state: EventState, mutate: (cues: Cue[]) => Cue[]): EventState => ({
  ...state,
  cues: mutate(state.cues.map((c) => ({ ...c }))),
});

/** Every cue pending, nothing started: a freshly published event. */
const freshlyPublished = (): EventState => ({
  ...withCues(FIXTURE, (cues) =>
    cues.map((c) => ({
      ...c,
      status: 'pending' as const,
      actualStartAt: null,
      actualEndAt: null,
      actualTimeSource: null,
    })),
  ),
  currentCueId: null,
  activeForecastEndMin: null,
  scenarioNowAt: FIXTURE.startsAt,
});

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

describe('startCue', () => {
  it('starts the first pending cue and forecasts from its planned duration', () => {
    const next = startCue(freshlyPublished(), 'opening', SERVER_NOW);
    const opening = next.cues.find((c) => c.id === 'opening') as Cue;
    expect(opening.status).toBe('active');
    expect(opening.actualStartAt).toBe(FIXTURE.startsAt);
    expect(opening.actualTimeSource).toBe('rehearsal_clock');
    expect(next.currentCueId).toBe('opening');
    expect(next.activeForecastEndMin).toBe(5);
    expect(next.revision).toBe(FIXTURE.revision + 1);
  });

  it('pushes the forecast when the start is late, rather than compressing the cue', () => {
    // Scenario clock at minute 8, but the opening was planned 0-5.
    const late = { ...freshlyPublished(), scenarioNowAt: atMinute(8) };
    const next = startCue(late, 'opening', SERVER_NOW);
    // 8 + 5 minutes of planned duration, not the planned end of 5.
    expect(next.activeForecastEndMin).toBe(13);
    // And the deviation is flagged, not fixed: the keynote still says 5-25.
    expect(next.scheduleHealth).toBe('needs_repair');
    expect(next.cues.find((c) => c.id === 'keynote')?.plannedStartMin).toBe(5);
  });

  it('refuses a cue that is not next in order', () => {
    expect(() => startCue(freshlyPublished(), 'qa', SERVER_NOW)).toThrow(TransitionError);
    try {
      startCue(freshlyPublished(), 'qa', SERVER_NOW);
    } catch (e) {
      expect((e as TransitionError).code).toBe('CUE_ORDER_VIOLATION');
    }
  });

  it('refuses while another cue is active', () => {
    // The fixture already has the keynote active.
    expect(() => startCue(FIXTURE, 'qa', SERVER_NOW)).toThrow(/already active/);
  });

  it('refuses outside the running phase', () => {
    const draft: EventState = { ...freshlyPublished(), phase: 'draft' };
    try {
      startCue(draft, 'opening', SERVER_NOW);
      expect.unreachable();
    } catch (e) {
      expect((e as TransitionError).code).toBe('WRONG_PHASE');
    }
  });
});

describe('completeCue', () => {
  it('records the actual end and keeps the event running while cues remain', () => {
    const state = { ...FIXTURE, scenarioNowAt: atMinute(25) };
    const next = completeCue(state, 'keynote', SERVER_NOW);
    const keynote = next.cues.find((c) => c.id === 'keynote') as Cue;
    expect(keynote.status).toBe('completed');
    expect(keynote.actualEndAt).toBe(atMinute(25));
    expect(keynote.actualTimeSource).toBe('rehearsal_clock');
    expect(next.currentCueId).toBeNull();
    expect(next.activeForecastEndMin).toBeNull();
    expect(next.phase).toBe('running');
    expect(next.scheduleHealth).toBe('valid');
  });

  it('records reality that breaks the plan and flags needs_repair without shifting cues', () => {
    // Minute 50 is later than any feasible plan: sponsor is fixed at 45.
    const state = { ...FIXTURE, scenarioNowAt: atMinute(50) };
    const next = completeCue(state, 'keynote', SERVER_NOW);
    expect(next.cues.find((c) => c.id === 'keynote')?.actualEndAt).toBe(atMinute(50));
    expect(next.scheduleHealth).toBe('needs_repair');
    // Later cues untouched.
    expect(
      next.cues
        .filter((c) => c.status === 'pending')
        .map((c) => [c.id, c.plannedStartMin, c.plannedEndMin]),
    ).toEqual([
      ['qa', 25, 35],
      ['community', 35, 45],
      ['sponsor', 45, 55],
      ['closing', 55, 60],
    ]);
  });

  it('ends the event when the last cue completes', () => {
    const onlyOneLeft = withCues(FIXTURE, (cues) =>
      cues.map((c) =>
        c.status === 'pending'
          ? { ...c, status: 'completed' as const, actualStartAt: atMinute(25), actualEndAt: atMinute(26), actualTimeSource: 'rehearsal_clock' as const }
          : c,
      ),
    );
    const next = completeCue({ ...onlyOneLeft, scenarioNowAt: atMinute(30) }, 'keynote', SERVER_NOW);
    expect(next.phase).toBe('ended');
  });

  it('refuses to complete a cue that is not active', () => {
    try {
      completeCue(FIXTURE, 'qa', SERVER_NOW);
      expect.unreachable();
    } catch (e) {
      expect((e as TransitionError).code).toBe('CUE_ORDER_VIOLATION');
    }
  });

  it('refuses a completion earlier than the recorded start', () => {
    // Keynote started at minute 5; wind the scenario clock back before it.
    const state = { ...FIXTURE, scenarioNowAt: atMinute(2) };
    try {
      completeCue(state, 'keynote', SERVER_NOW);
      expect.unreachable();
    } catch (e) {
      expect((e as TransitionError).code).toBe('CLOCK_NOT_MONOTONIC');
    }
  });
});

describe('advanceRehearsalClock', () => {
  it('moves forward and bumps the revision', () => {
    const next = advanceRehearsalClock(FIXTURE, atMinute(30), SERVER_NOW);
    expect(next.scenarioNowAt).toBe(atMinute(30));
    expect(next.revision).toBe(FIXTURE.revision + 1);
  });

  it('refuses to move backwards or stand still', () => {
    for (const min of [20, 25]) {
      try {
        advanceRehearsalClock(FIXTURE, atMinute(min), SERVER_NOW);
        expect.unreachable();
      } catch (e) {
        expect((e as TransitionError).code).toBe('CLOCK_NOT_MONOTONIC');
      }
    }
  });

  it('is forbidden in live mode', () => {
    const live: EventState = { ...FIXTURE, mode: 'live', scenarioNowAt: null };
    try {
      advanceRehearsalClock(live, atMinute(30), SERVER_NOW);
      expect.unreachable();
    } catch (e) {
      expect((e as TransitionError).code).toBe('CLOCK_FORBIDDEN_IN_LIVE');
    }
  });

  it('flags needs_repair once the clock passes the active forecast end', () => {
    // Forecast end is 25; move the scenario to 40.
    const next = advanceRehearsalClock(FIXTURE, atMinute(40), SERVER_NOW);
    expect(next.scheduleHealth).toBe('needs_repair');
  });
});

describe('applyRepair', () => {
  const input: RepairInput = { expectedRevision: 7, activeForecastEndMin: 37, releaseUpdates: [] };

  it('moves only pending intervals and persists the new forecast', () => {
    const result = previewRepair(FIXTURE, input, SERVER_NOW);
    const next = applyRepair(FIXTURE, input, result, SERVER_NOW);
    expect(next.cues.map((c) => [c.id, c.plannedStartMin, c.plannedEndMin])).toEqual([
      ['opening', 0, 5],
      ['keynote', 5, 25],
      ['qa', 37, 41],
      ['community', 41, 45],
      ['sponsor', 45, 55],
      ['closing', 55, 60],
    ]);
    // INFERRED (decisions M3 #3).
    expect(next.activeForecastEndMin).toBe(37);
    expect(next.scheduleHealth).toBe('valid');
    expect(next.revision).toBe(FIXTURE.revision + 1);
  });

  it('persists releaseUpdates into notBeforeMin', () => {
    const withRelease: RepairInput = {
      ...input,
      releaseUpdates: [{ cueId: 'community', notBeforeMin: 41 }],
    };
    const result = previewRepair(FIXTURE, withRelease, SERVER_NOW);
    const next = applyRepair(FIXTURE, withRelease, result, SERVER_NOW);
    // INFERRED (decisions M3 #4): a later re-solve must not forget the release time.
    expect(next.cues.find((c) => c.id === 'community')?.notBeforeMin).toBe(41);
    // Untouched cues keep their own release rules.
    expect(next.cues.find((c) => c.id === 'qa')?.notBeforeMin).toBeNull();
  });

  it('does not mutate its arguments', () => {
    const state = deepFreeze(structuredClone(FIXTURE));
    const frozenInput = deepFreeze(structuredClone(input));
    const result = previewRepair(state, frozenInput, SERVER_NOW);
    expect(() => applyRepair(state, frozenInput, deepFreeze(result), SERVER_NOW)).not.toThrow();
    // And the original really is unchanged.
    expect(state.cues.find((c) => c.id === 'qa')?.plannedStartMin).toBe(25);
    expect(state.activeForecastEndMin).toBe(25);
  });

  it('refuses an infeasible result', () => {
    const bad: RepairInput = { ...input, activeForecastEndMin: 44 };
    const result = previewRepair(FIXTURE, bad, SERVER_NOW);
    expect(result.feasible).toBe(false);
    try {
      applyRepair(FIXTURE, bad, result, SERVER_NOW);
      expect.unreachable();
    } catch (e) {
      expect((e as TransitionError).code).toBe('VALIDATION_FAILED');
    }
  });
});

describe('sameRepairOutcome', () => {
  const input: RepairInput = { expectedRevision: 7, activeForecastEndMin: 33, releaseUpdates: [] };

  it('accepts two identical solves', () => {
    const a = previewRepair(FIXTURE, input, SERVER_NOW);
    const b = previewRepair(FIXTURE, input, SERVER_NOW);
    expect(sameRepairOutcome(a, b)).toBe(true);
  });

  it('rejects a plan that is valid but suboptimal', () => {
    const real = previewRepair(FIXTURE, input, SERVER_NOW);
    // The mirror-image split: every hard rule still holds, but the cost is 20 not 12.
    const suboptimal = {
      ...real,
      weightedShorteningCost: 20,
      schedule: [
        { cueId: 'qa', startMin: 33, endMin: 37 },
        { cueId: 'community', startMin: 37, endMin: 45 },
        { cueId: 'sponsor', startMin: 45, endMin: 55 },
        { cueId: 'closing', startMin: 55, endMin: 60 },
      ],
    };
    expect(sameRepairOutcome(real, suboptimal)).toBe(false);
  });

  it('ignores constraintChecks, which is a containment contract', () => {
    const a = previewRepair(FIXTURE, input, SERVER_NOW);
    const b = { ...a, constraintChecks: [...a.constraintChecks, { rule: 'extra', cueId: null, passed: true }] };
    expect(sameRepairOutcome(a, b)).toBe(true);
  });
});

describe('renderOperationalCue', () => {
  it('reads the active cue and the next pending cue from the snapshot', () => {
    const view = renderOperationalCue(FIXTURE, atMinute(25));
    expect(view.nowMin).toBe(25);
    expect(view.clockSource).toBe('rehearsal_clock');
    expect(view.current).toMatchObject({
      cueId: 'keynote',
      title: 'Keynote',
      startMin: 5, // the recorded actual start
      endMin: 25, // the organizer's forecast
      startsAtLocal: '10:05',
      endsAtLocal: '10:25',
    });
    expect(view.next).toMatchObject({ cueId: 'qa', startMin: 25, startsAtLocal: '10:25' });
    expect(view.projectedFinishMin).toBe(60);
    expect(view.projectedFinishLocal).toBe('11:00');
    expect(view.line).toBe(
      'Now: Keynote · until 10:25 · Up next: Audience Q&A at 10:25 · Projected finish 11:00',
    );
  });

  it('follows the repaired plan across the transition', () => {
    const input: RepairInput = { expectedRevision: 7, activeForecastEndMin: 37, releaseUpdates: [] };
    const repaired = applyRepair(FIXTURE, input, previewRepair(FIXTURE, input, SERVER_NOW), SERVER_NOW);
    const view = renderOperationalCue(repaired, atMinute(30));
    // The forecast moved to 37 and Q&A now starts at 10:37.
    expect(view.current).toMatchObject({ cueId: 'keynote', endMin: 37, endsAtLocal: '10:37' });
    expect(view.next).toMatchObject({ cueId: 'qa', startMin: 37, startsAtLocal: '10:37' });
    expect(view.projectedFinishLocal).toBe('11:00');
  });

  it('reports being between cues after a completion', () => {
    const done = completeCue({ ...FIXTURE, scenarioNowAt: atMinute(25) }, 'keynote', SERVER_NOW);
    const view = renderOperationalCue(done, atMinute(26));
    expect(view.current).toBeNull();
    expect(view.next).toMatchObject({ cueId: 'qa' });
    expect(view.line).toContain('Between cues');
    expect(view.line).toContain('Up next: Audience Q&A');
  });

  it('reports completion when the event has ended', () => {
    const allDone = withCues(FIXTURE, (cues) =>
      cues.map((c) => ({
        ...c,
        status: 'completed' as const,
        actualStartAt: c.actualStartAt ?? atMinute(0),
        actualEndAt: c.actualEndAt ?? atMinute(60),
        actualTimeSource: 'rehearsal_clock' as const,
      })),
    );
    const ended: EventState = {
      ...allDone,
      phase: 'ended',
      currentCueId: null,
      activeForecastEndMin: null,
    };
    const view = renderOperationalCue(ended, atMinute(61));
    expect(view.current).toBeNull();
    expect(view.next).toBeNull();
    expect(view.line).toBe('Event complete');
  });

  it('never reads an approved script body', () => {
    // A script whose prose contains a plausible but wrong time must not influence the view.
    const withScript: EventState = {
      ...FIXTURE,
      approvedScripts: [
        {
          id: 'scr-1',
          cueId: 'qa',
          kind: 'transition',
          language: 'en',
          body: 'Up next at 11:59, the Q&A session will begin.',
          usedFactIds: [],
          source: 'manual',
          model: null,
          promptVersion: 'v1',
          inputHash: 'abc',
          approvedBy: 'owner',
          approvedAt: FIXTURE.startsAt,
        },
      ],
    };
    const view = renderOperationalCue(withScript, atMinute(25));
    // 11:59 appears nowhere: times come from structured state only (§24).
    expect(view.line).not.toContain('11:59');
    expect(view.next?.startsAtLocal).toBe('10:25');
  });

  it('surfaces needs_repair without inventing a fix', () => {
    const drifted = advanceRehearsalClock(FIXTURE, atMinute(40), SERVER_NOW);
    const view = renderOperationalCue(drifted, atMinute(40));
    expect(view.scheduleHealth).toBe('needs_repair');
    // The plan is reported as it stands, not silently corrected.
    expect(view.next).toMatchObject({ cueId: 'qa', startMin: 25 });
  });
});
