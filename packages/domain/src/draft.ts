/**
 * Draft input contract and initial-interval layout.
 *
 * INVENTED: §12 mandates the behaviour ("allowed `config` is name/startsAt/hardEndMin only;
 * server validates/calculates initial intervals", "`PUT /draft` cue objects accept only id,
 * order, title, speakerId and timing rules") but gives no schema or signature.
 *
 * Mass assignment is prevented STRUCTURALLY, not by a blocklist: the draft schemas are
 * strict, so `plannedStartMin`, `status`, `actualStartAt`, `ownerUid` or `revision` in a
 * request body is a parse error, and `materializeDraftCues` is the only way a `Cue` is
 * built from request data.
 */

import { z } from 'zod';

import { isoDateSchema, idSchema } from './schemas';
import type { Cue, ScheduleInterval } from './types';

const NAME_MAX = 120;
const HORIZON_MAX = 240;

/**
 * The only cue fields a request may set: identity, order, label, speaker and timing rules.
 * Strict, so an unexpected key is rejected rather than ignored.
 */
export const draftCueInputSchema = z
  .strictObject({
    id: idSchema,
    order: z.int().min(0).max(19),
    title: z.string().min(1).max(NAME_MAX),
    speakerId: idSchema.nullable(),
    preferredDurationMin: z.int().min(1).max(60),
    minDurationMin: z.int().min(1).max(60),
    compressionPenalty: z.int().min(1).max(100),
    bufferBeforeMin: z.int().min(0).max(30),
    notBeforeMin: z.int().min(0).max(HORIZON_MAX).nullable(),
    fixedStartMin: z.int().min(0).max(HORIZON_MAX).nullable(),
  })
  .refine((c) => c.minDurationMin <= c.preferredDurationMin, {
    message: 'minDurationMin must be <= preferredDurationMin',
    path: ['minDurationMin'],
  });

export type DraftCueInput = z.infer<typeof draftCueInputSchema>;

/** §12: "allowed `config` is name/startsAt/hardEndMin only". */
export const draftConfigSchema = z.strictObject({
  name: z.string().min(1).max(NAME_MAX),
  startsAt: isoDateSchema,
  hardEndMin: z.int().min(1).max(HORIZON_MAX),
});

export type DraftConfig = z.infer<typeof draftConfigSchema>;

/**
 * Lays out the draft from MINUTE ZERO at preferred durations, independently of today's
 * live wall clock (§12). Same start rule as `repairSchedule`, so the two agree.
 *
 * A `fixedStartMin` is honoured even when it is unreachable: the interval is recorded as
 * requested and `validatePlan` reports the resulting overlap. Silently sliding the cue
 * later would hide a rule the organizer asked for.
 */
export function computeInitialIntervals(
  cues: readonly DraftCueInput[],
): ScheduleInterval[] {
  const ordered = cues.slice().sort((a, b) => a.order - b.order);
  const intervals: ScheduleInterval[] = [];
  let prevEnd = 0;
  for (const cue of ordered) {
    const earliest = Math.max(prevEnd + cue.bufferBeforeMin, cue.notBeforeMin ?? 0);
    const startMin = cue.fixedStartMin ?? earliest;
    const endMin = startMin + cue.preferredDurationMin;
    intervals.push({ cueId: cue.id, startMin, endMin });
    prevEnd = endMin;
  }
  return intervals;
}

/**
 * The ONLY path from request data to a `Cue`. Runtime fields are set by the server, never
 * carried over from the body.
 */
export function materializeDraftCues(
  cues: readonly DraftCueInput[],
  intervals: readonly ScheduleInterval[],
): Cue[] {
  const byId = new Map(intervals.map((i) => [i.cueId, i]));
  return cues
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((cue) => {
      const interval = byId.get(cue.id);
      if (interval === undefined) throw new Error(`materializeDraftCues: no interval for ${cue.id}`);
      return {
        id: cue.id,
        order: cue.order,
        title: cue.title,
        speakerId: cue.speakerId,
        preferredDurationMin: cue.preferredDurationMin,
        minDurationMin: cue.minDurationMin,
        compressionPenalty: cue.compressionPenalty,
        bufferBeforeMin: cue.bufferBeforeMin,
        notBeforeMin: cue.notBeforeMin,
        fixedStartMin: cue.fixedStartMin,
        plannedStartMin: interval.startMin,
        plannedEndMin: interval.endMin,
        // Server-owned runtime state. Never settable from a request.
        status: 'pending' as const,
        actualStartAt: null,
        actualEndAt: null,
        actualTimeSource: null,
      };
    });
}
