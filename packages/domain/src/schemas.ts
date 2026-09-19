/**
 * Zod schemas enforcing every limit in the §12 "Validation limits" paragraph.
 *
 * DECISION (docs/decisions.md #9): cue and speaker IDs validate as NONEMPTY BOUNDED
 * STRINGS, not `.uuid()` — mirroring what §12 already mandates for `FactId`
 * ("Validate FactId as a nonempty string, not a UUID"). UUID *generation* stays an
 * API-layer concern at creation time. This keeps the §5/§12 illustrative IDs
 * ("qa", "community", "sponsor") legal domain values so one fixture serves tests,
 * video and deck without a parallel UUID-only copy.
 */

import { z } from 'zod';

const NAME_MAX = 120; // names/titles <= 120 characters
const FACT_MAX = 400; // fact <= 400 characters
const ID_MAX = 128;
const HORIZON_MAX = 240; // hard end 1-240 minutes; release/fixed offset 0-240
export const STATE_BODY_MAX_BYTES = 128 * 1024; // maximum state body 128 KB

/** Nonempty bounded identifier. See DECISION note above. */
export const idSchema = z.string().min(1).max(ID_MAX);
export const factIdSchema = z.string().min(1).max(ID_MAX);

export const isoDateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
    'must be UTC ISO-8601 ending in Z',
  )
  .refine((s) => Number.isFinite(Date.parse(s)), 'must be a valid timestamp');

export const languageSchema = z.enum(['en', 'hi', 'gu']);
export const roleSchema = z.enum(['owner', 'anchor']);
export const scriptKindSchema = z.enum([
  'opening',
  'introduction',
  'transition',
  'closing',
  'announcement',
]);

export const factSchema = z.object({
  id: factIdSchema,
  text: z.string().min(1).max(FACT_MAX),
});

/**
 * Fact IDs the SERVER owns. §12 reserves these prefixes so an organizer-entered fact cannot
 * impersonate a source record: the event name and each approved speaker's display name are
 * supplied to the model as server-created records with stable IDs such as `event:name` and
 * `speaker:<uuid>:name`.
 *
 * SECURITY: without this, an organizer could submit a fact with id `event:name` and text of
 * their choosing, and the model would receive it as though the server had vouched for it.
 * `factSchema` still accepts reserved IDs because STORED state legitimately contains them;
 * the rejection belongs at the REQUEST boundary, which is what `organizerFactSchema` is for.
 */
const RESERVED_FACT_ID = /^(?:event|speaker):/;

export const isReservedFactId = (id: string): boolean => RESERVED_FACT_ID.test(id);

/** A fact as supplied by an organizer. Reserved prefixes are refused here. */
export const organizerFactSchema = factSchema.refine((f) => !isReservedFactId(f.id), {
  message: 'fact ids beginning "event:" or "speaker:" are reserved for server-created records',
  path: ['id'],
});

/** A speaker as supplied by an organizer: their facts may not use reserved ids either. */
export const organizerSpeakerSchema = z.object({
  id: idSchema,
  displayName: z.string().min(1).max(NAME_MAX),
  pronunciationHint: z.string().max(NAME_MAX),
  facts: z.array(organizerFactSchema).max(10),
});

export const speakerSchema = z.object({
  id: idSchema,
  displayName: z.string().min(1).max(NAME_MAX),
  pronunciationHint: z.string().max(NAME_MAX), // optional content represented as ""
  facts: z.array(factSchema).max(10), // ten facts/speaker
});

export const cueSchema = z
  .object({
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
    plannedStartMin: z.int().min(0).max(HORIZON_MAX),
    plannedEndMin: z.int().min(0).max(HORIZON_MAX),
    status: z.enum(['pending', 'active', 'completed']),
    actualStartAt: isoDateSchema.nullable(),
    actualEndAt: isoDateSchema.nullable(),
    actualTimeSource: z.enum(['rehearsal_clock', 'server_clock']).nullable(),
  })
  .refine((c) => c.minDurationMin <= c.preferredDurationMin, {
    message: 'minDurationMin must be <= preferredDurationMin',
    path: ['minDurationMin'],
  })
  .refine((c) => c.plannedStartMin <= c.plannedEndMin, {
    message: 'plannedStartMin must be <= plannedEndMin',
    path: ['plannedEndMin'],
  })
  .refine((c) => c.actualEndAt === null || c.actualStartAt !== null, {
    message: 'actualEndAt requires actualStartAt',
    path: ['actualStartAt'],
  })
  .refine((c) => (c.actualStartAt === null) === (c.actualTimeSource === null), {
    message: 'actualTimeSource must be set iff an actual time was recorded',
    path: ['actualTimeSource'],
  });

/** Cue ordering must be unique and contiguous 0..n-1. */
const contiguousOrder = (cues: readonly { order: number }[]): boolean => {
  const seen = new Set(cues.map((c) => c.order));
  return seen.size === cues.length && cues.every((c) => c.order < cues.length);
};

/** Draft-phase cue list: a blank event may have zero cues while editing. */
export const cuesSchema = z
  .array(cueSchema)
  .max(20)
  .refine(contiguousOrder, { message: 'cue order must be unique and contiguous 0..n-1' })
  .refine((cues) => cues.filter((c) => c.status === 'active').length <= 1, {
    message: 'at most one active cue',
  })
  .refine((cues) => new Set(cues.map((c) => c.id)).size === cues.length, {
    message: 'cue ids must be unique',
  });

/** Publication requires 1-20 valid cues. */
export const publishableCuesSchema = cuesSchema.refine((cues) => cues.length >= 1, {
  message: 'publication requires at least one cue',
});

export const approvedScriptSchema = z.object({
  id: idSchema,
  cueId: idSchema.nullable(),
  kind: scriptKindSchema,
  language: languageSchema,
  body: z.string().min(1).max(1500),
  usedFactIds: z.array(factIdSchema).max(50),
  source: z.enum(['gemini', 'template', 'manual']),
  model: z.string().max(NAME_MAX).nullable(),
  promptVersion: z.string().min(1).max(NAME_MAX),
  inputHash: z.string().min(1).max(ID_MAX),
  approvedBy: z.string().min(1).max(ID_MAX),
  approvedAt: isoDateSchema,
});

export const announcementSchema = z.object({
  id: idSchema,
  text: z.string().min(1).max(500), // 500-character maximum
  language: languageSchema,
  publishedAt: isoDateSchema,
  dismissedAt: isoDateSchema.nullable(),
});

export const eventStateSchema = z
  .object({
    id: idSchema,
    ownerUid: z.string().min(1).max(ID_MAX),
    name: z.string().min(1).max(NAME_MAX),
    timezone: z.literal('Asia/Kolkata'),
    startsAt: isoDateSchema,
    hardEndMin: z.int().min(1).max(HORIZON_MAX),
    mode: z.enum(['rehearsal', 'live']),
    phase: z.enum(['draft', 'running', 'ended']),
    revision: z.int().min(1),
    scenarioNowAt: isoDateSchema.nullable(),
    currentCueId: idSchema.nullable(),
    activeForecastEndMin: z.int().min(0).max(HORIZON_MAX).nullable(),
    scheduleHealth: z.enum(['valid', 'needs_repair']),
    // Defaulted so records created before the extension stay valid readers.
    demoSeed: z.literal('college-demo-v1').nullable().default(null),
    eventFacts: z.array(factSchema).max(10),
    speakers: z.array(speakerSchema).max(20), // at most 20 speakers
    cues: cuesSchema,
    approvedScripts: z.array(approvedScriptSchema).max(50), // at most 50 approved scripts
    announcements: z.array(announcementSchema).max(100),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
    expiresAt: isoDateSchema,
  })
  // scenarioNowAt: required in rehearsal; forbidden in live.
  .refine((s) => (s.mode === 'rehearsal' ? s.scenarioNowAt !== null : s.scenarioNowAt === null), {
    message: 'scenarioNowAt is required in rehearsal mode and forbidden in live mode',
    path: ['scenarioNowAt'],
  })
  // "ten active announcements" — dismissed ones are history, not active.
  .refine((s) => s.announcements.filter((a) => a.dismissedAt === null).length <= 10, {
    message: 'at most ten active announcements',
    path: ['announcements'],
  })
  // Referential integrity.
  .refine(
    (s) => {
      const ids = new Set(s.speakers.map((sp) => sp.id));
      return s.cues.every((c) => c.speakerId === null || ids.has(c.speakerId));
    },
    { message: 'cue.speakerId must reference a known speaker', path: ['cues'] },
  )
  .refine((s) => s.currentCueId === null || s.cues.some((c) => c.id === s.currentCueId), {
    message: 'currentCueId must reference a known cue',
    path: ['currentCueId'],
  })
  .refine((s) => new Set(s.speakers.map((sp) => sp.id)).size === s.speakers.length, {
    message: 'speaker ids must be unique',
    path: ['speakers'],
  })
  // An active cue implies a forecast; no active cue forbids one.
  .refine(
    (s) => {
      const hasActive = s.cues.some((c) => c.status === 'active');
      return hasActive ? s.activeForecastEndMin !== null : s.activeForecastEndMin === null;
    },
    {
      message: 'activeForecastEndMin must be set iff a cue is active',
      path: ['activeForecastEndMin'],
    },
  )
  // The active cue is the currentCueId.
  .refine(
    (s) => {
      const active = s.cues.find((c) => c.status === 'active');
      return active === undefined || active.id === s.currentCueId;
    },
    { message: 'currentCueId must identify the active cue', path: ['currentCueId'] },
  );

export const repairInputSchema = z.object({
  expectedRevision: z.int().min(1),
  activeForecastEndMin: z.int().min(0).max(HORIZON_MAX).nullable(),
  releaseUpdates: z
    .array(z.object({ cueId: idSchema, notBeforeMin: z.int().min(0).max(HORIZON_MAX) }))
    .max(20)
    .refine((u) => new Set(u.map((x) => x.cueId)).size === u.length, {
      message: 'releaseUpdates must not repeat a cueId',
    }),
});

/** §7B model output envelope: body 1-1500 chars, <=10 warnings, each <=200 chars. */
export const scriptDraftSchema = z.object({
  body: z.string().min(1).max(1500),
  usedFactIds: z.array(factIdSchema).max(50),
  warnings: z.array(z.string().min(1).max(200)).max(10),
});

/**
 * "Maximum state body 128 KB" is a serialized-size rule, not a field rule, so it is
 * checked alongside `eventStateSchema` rather than inside it.
 */
export const withinStateBodyLimit = (state: unknown): boolean =>
  new TextEncoder().encode(JSON.stringify(state)).byteLength <= STATE_BODY_MAX_BYTES;
