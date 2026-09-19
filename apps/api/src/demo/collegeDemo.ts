/**
 * The `college-demo-v1` seed: a draft built from the committed fixture.
 *
 * §12 names the seed value and says "Demo creation seeds a draft". The committed
 * `fixtures/college-demo-v1.json` is the same scenario the solver tests assert and the demo
 * video uses, so it is the single source of truth here — a second in-code copy would drift.
 *
 * Only draft-input fields are taken from the fixture. Runtime state (status, actual times,
 * revision, owner) is server-owned and is created fresh; the fixture's published running
 * state is reached the normal way, through publish/start/clock/complete.
 */

import {
  computeInitialIntervals,
  draftCueInputSchema,
  materializeDraftCues,
  speakerSchema,
  type Cue,
  type Speaker,
  z,
} from '@cuepilot/domain';

import fixtureJson from '../../../../fixtures/college-demo-v1.json';

export const COLLEGE_DEMO_SEED = 'college-demo-v1';

/** How long the seeded scenario needs: opening through closing occupies minutes 0-60. */
export const COLLEGE_DEMO_HARD_END_MIN = 60;

const fixtureCueSchema = z.object({
  id: z.string(),
  order: z.int(),
  title: z.string(),
  speakerId: z.string().nullable(),
  preferredDurationMin: z.int(),
  minDurationMin: z.int(),
  compressionPenalty: z.int(),
  bufferBeforeMin: z.int(),
  notBeforeMin: z.int().nullable(),
  fixedStartMin: z.int().nullable(),
});

const FIXTURE = z
  .object({
    speakers: z.array(speakerSchema).min(1),
    cues: z.array(fixtureCueSchema).min(1),
  })
  .parse(fixtureJson);

export type CollegeDemoDraft = {
  speakers: Speaker[];
  cues: Cue[];
};

/** Builds the seeded draft pieces. Pure; the caller owns clock, revision and ownership. */
export function collegeDemoDraft(): CollegeDemoDraft {
  // `draftCueInputSchema` is strict, so the fixture's runtime fields are deliberately
  // dropped here rather than accepted and ignored.
  const cuesInput = FIXTURE.cues.map((cue) =>
    draftCueInputSchema.parse({
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
    }),
  );
  const intervals = computeInitialIntervals(cuesInput);
  return {
    speakers: FIXTURE.speakers.map((speaker) => ({ ...speaker, facts: speaker.facts.map((f) => ({ ...f })) })),
    cues: materializeDraftCues(cuesInput, intervals),
  };
}
