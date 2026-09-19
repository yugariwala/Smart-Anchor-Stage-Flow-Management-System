/**
 * Deterministic "current / up next" rendering from a published snapshot.
 *
 * Out of scope for Milestone 1 (solver only). It derives current timing and the next cue
 * from the same snapshot and MUST NOT parse generated prose to find times (§24).
 *
 * INVENTED signature: not specified in §12.
 */

import type { EventState, ISODate, UUID } from './types';

export type OperationalCueView = {
  currentCueId: UUID | null;
  currentEndsAtMin: number | null;
  nextCueId: UUID | null;
  nextStartsAtMin: number | null;
  projectedFinishMin: number | null;
};

export function renderOperationalCue(_state: EventState, _nowAt: ISODate): OperationalCueView {
  throw new Error('not implemented: Milestone 2');
}
