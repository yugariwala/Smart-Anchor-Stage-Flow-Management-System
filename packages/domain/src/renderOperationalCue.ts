/**
 * Deterministic "current / up next" rendering from a published snapshot.
 *
 * §24: it derives current timing and the next cue from the same snapshot and MUST NOT parse
 * generated prose to find times. This module reads only structured state; nothing here ever
 * looks at an `ApprovedScript.body`.
 *
 * INVENTED signature: not specified in §12.
 */

import type { Cue, EventState, ISODate, UUID } from './types';
import { currentMinute, relativeMinutes } from './transitions';

/** Asia/Kolkata is UTC+05:30 with no DST, so a fixed offset is exact. */
const KOLKATA_OFFSET_MIN = 330;

export type CueLine = {
  cueId: UUID;
  title: string;
  speakerId: UUID | null;
  startMin: number;
  endMin: number;
  /** Local clock time in the event timezone, e.g. "10:37". */
  startsAtLocal: string;
  endsAtLocal: string;
};

export type OperationalCueView = {
  /** Minutes relative to `startsAt`: the scenario minute in rehearsal, real in live. */
  nowMin: number;
  /** The active cue, or null between cues. */
  current: CueLine | null;
  /** The next pending cue, or null when none remain. */
  next: CueLine | null;
  projectedFinishMin: number | null;
  projectedFinishLocal: string | null;
  scheduleHealth: 'valid' | 'needs_repair';
  /** Which clock this view was rendered against. */
  clockSource: 'rehearsal_clock' | 'server_clock';
  /**
   * The operational timing line (§14). Rendered from structured state by a deterministic
   * template, English only for now; localised wording is the M6 localisation pass.
   */
  line: string;
};

/** Minute offset from `startsAt` formatted as HH:MM in the event timezone. */
const localTime = (state: EventState, min: number): string => {
  const at = new Date(Date.parse(state.startsAt) + (min + KOLKATA_OFFSET_MIN) * 60_000);
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const toLine = (state: EventState, cue: Cue, startMin: number, endMin: number): CueLine => ({
  cueId: cue.id,
  title: cue.title,
  speakerId: cue.speakerId,
  startMin,
  endMin,
  startsAtLocal: localTime(state, startMin),
  endsAtLocal: localTime(state, endMin),
});

export function renderOperationalCue(state: EventState, nowAt: ISODate): OperationalCueView {
  const ordered = state.cues.slice().sort((a, b) => a.order - b.order);
  const active = ordered.find((c) => c.status === 'active') ?? null;
  const pending = ordered.filter((c) => c.status === 'pending');
  const nowMin = currentMinute(state, nowAt);
  const clockSource: 'rehearsal_clock' | 'server_clock' =
    state.mode === 'rehearsal' && state.scenarioNowAt !== null ? 'rehearsal_clock' : 'server_clock';

  let current: CueLine | null = null;
  if (active !== null) {
    // The active cue's start is its recorded actual; its end is the organizer's forecast.
    const startMin =
      active.actualStartAt === null
        ? active.plannedStartMin
        : relativeMinutes(state.startsAt, active.actualStartAt);
    const endMin = state.activeForecastEndMin ?? active.plannedEndMin;
    current = toLine(state, active, startMin, endMin);
  }

  const nextCue = pending[0] ?? null;
  const next =
    nextCue === null ? null : toLine(state, nextCue, nextCue.plannedStartMin, nextCue.plannedEndMin);

  const lastPending = pending[pending.length - 1];
  const projectedFinishMin =
    lastPending !== undefined
      ? lastPending.plannedEndMin
      : (state.activeForecastEndMin ?? lastCompletedEnd(state, ordered));

  return {
    nowMin,
    current,
    next,
    projectedFinishMin,
    projectedFinishLocal: projectedFinishMin === null ? null : localTime(state, projectedFinishMin),
    scheduleHealth: state.scheduleHealth,
    clockSource,
    line: renderLine(state, current, next, projectedFinishMin),
  };
}

const lastCompletedEnd = (state: EventState, ordered: readonly Cue[]): number | null => {
  const completed = ordered.filter((c) => c.status === 'completed');
  const last = completed[completed.length - 1];
  if (last === undefined) return null;
  return last.actualEndAt === null
    ? last.plannedEndMin
    : relativeMinutes(state.startsAt, last.actualEndAt);
};

const renderLine = (
  state: EventState,
  current: CueLine | null,
  next: CueLine | null,
  projectedFinishMin: number | null,
): string => {
  const parts: string[] = [];
  if (current !== null) {
    parts.push(`Now: ${current.title} · until ${current.endsAtLocal}`);
  } else if (state.phase === 'ended') {
    parts.push('Event complete');
  } else {
    parts.push('Between cues');
  }
  if (next !== null) {
    parts.push(`Up next: ${next.title} at ${next.startsAtLocal}`);
  } else if (state.phase !== 'ended') {
    parts.push('Nothing further scheduled');
  }
  if (projectedFinishMin !== null && state.phase !== 'ended') {
    parts.push(`Projected finish ${localTime(state, projectedFinishMin)}`);
  }
  return parts.join(' · ');
};
