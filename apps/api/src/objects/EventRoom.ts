/**
 * One SQLite Durable Object per event UUID. This object is the ONLY schedule authority.
 *
 * TRANSACTION DISCIPLINE (§9, §12):
 *  - `transactionSync`'s callback must be SYNCHRONOUS. Every hash is therefore computed by
 *    the caller before the transaction opens, which makes an external network call inside a
 *    transaction structurally impossible rather than a convention someone has to remember.
 *  - Every mutation checks the idempotency ledger BEFORE the current revision, so a network
 *    retry replays its original response instead of hitting a spurious REVISION_CONFLICT.
 *  - State, the immutable revision row and the published pointer are written in ONE
 *    transaction. A throw rolls back all three plus the ledger row.
 *  - All SQL is parameterized.
 */

import { DurableObject } from 'cloudflare:workers';
import {
  advanceRehearsalClock,
  applyRepair,
  completeCue,
  computeInitialIntervals,
  currentMinute,
  draftConfigSchema,
  draftCueInputSchema,
  eventStateSchema,
  idSchema,
  organizerFactSchema,
  materializeDraftCues,
  planIsValid,
  previewRepair,
  publishableCuesSchema,
  repairInputSchema,
  sameRepairOutcome,
  organizerSpeakerSchema,
  startCue,
  TransitionError,
  validatePlan,
  withinStateBodyLimit,
  type Cue,
  type EventState,
  type RepairInput,
  type RepairResult,
  type Role,
  type ApprovedScript,
  type Announcement,
  type Language,
  type ScriptKind,
  z,
} from '@cuepilot/domain';

import { generateScriptDraft, type FetchLike } from '../ai/gemini';
import { buildEnvelope, PROMPT_VERSION, type ScriptEnvelope } from '../ai/prompt';
import { throwApi } from '../http/errors';
import SCHEMA_SQL from '../storage/schema.sql';

export type Env = {
  EVENT_ROOMS: DurableObjectNamespace<EventRoom>;
  QUOTA_ROOMS: DurableObjectNamespace;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
  GEMINI_MODEL: string;
  AI_ENABLED: string;
  APP_ENV: string;
  BUILD_COMMIT: string;
};

/** Demonstration data lives 72 hours (§12). */
const RETENTION_MS = 72 * 60 * 60 * 1000;
const INVITATION_TTL_MS = 60 * 60 * 1000; // one use, one hour
const REVISION_PAGE_CAP = 50;
const TOMBSTONE_JSON = '{"tombstone":true}';

/**
 * Proposal TTL is TEN REAL WALL-CLOCK MINUTES, irrespective of the rehearsal clock (§12).
 *
 * TWO CLOCKS, TWO JOBS. This one is real time: a rehearsal parked at scenario minute 25 for
 * an hour must still expire its proposals. The OTHER clock - the scenario minute - decides
 * whether a previewed plan is still reachable, and drives PLAN_TIME_STALE. Conflating them
 * would either keep dead proposals alive forever or expire live ones on a paused scenario.
 */
const PROPOSAL_TTL_MS = 10 * 60 * 1000;

/**
 * The AI in-flight LEASE, not a lock (§12: "release the in-flight slot in finally, with a
 * short lease expiry for crashes").
 *
 * A boolean flag would wedge an event permanently the first time an isolate is evicted
 * mid-generation, and with only ten attempts a day the organizer could not work around it.
 * An expiring reservation self-heals: the `finally` clears it in the normal case, and if the
 * isolate dies the row is simply ignored once `reset_at` passes. 30s = the 12s provider
 * deadline plus margin, so a slow-but-alive generation is never double-run.
 */
const AI_LEASE_MS = 30_000;

/** §12 defaults for the per-event AI caps. The project cap lives in QuotaRoom. */
const AI_EVENT_DAY_LIMIT = 10;

/** Every mutation carries these. `expectedRevision` is absent only on creation (§12, #4). */
export type MutationEnvelope = {
  readonly uid: string;
  readonly idempotencyKey: string;
  /** SHA-256 of method + path + canonical JSON body, computed OUTSIDE the transaction. */
  readonly requestHash: string;
  /** Server clock, passed in so the transaction callback stays synchronous and testable. */
  readonly nowIso: string;
};

export type CreateCommand = MutationEnvelope & {
  readonly eventId: string;
  readonly body: unknown;
};
export type DraftCommand = MutationEnvelope & { readonly body: unknown };
export type PublishCommand = MutationEnvelope & { readonly body: unknown };
export type DestroyCommand = MutationEnvelope & { readonly body: unknown };
export type JoinCommand = MutationEnvelope & {
  /** SHA-256 of the invite secret, hashed outside the transaction. */
  readonly inviteCodeHash: string;
};

export type CommandResponse = { readonly status: number; readonly body: unknown };

const createBodySchema = z.strictObject({
  name: z.string().min(1).max(120),
  startsAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/, 'must be UTC ISO-8601 ending in Z'),
  hardEndMin: z.int().min(1).max(240),
  mode: z.enum(['rehearsal', 'live']),
  seed: z.enum(['blank', 'college-demo-v1']),
});

const draftBodySchema = z.strictObject({
  expectedRevision: z.int().min(1),
  config: draftConfigSchema,
  // Organizer-supplied, so reserved fact-id prefixes are refused here (§12).
  speakers: z.array(organizerSpeakerSchema).max(20),
  eventFacts: z.array(organizerFactSchema).max(10),
  cues: z.array(draftCueInputSchema).max(20),
});

const expectedRevisionOnlySchema = z.strictObject({ expectedRevision: z.int().min(1) });

const rehearsalClockBodySchema = z.strictObject({
  expectedRevision: z.int().min(1),
  nowAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/, 'must be UTC ISO-8601 ending in Z'),
});

const scriptProposalBodySchema = z.strictObject({
  expectedRevision: z.int().min(1),
  kind: z.enum(['opening', 'introduction', 'transition', 'closing', 'announcement']),
  cueId: idSchema.nullable(),
  language: z.enum(['en', 'hi', 'gu']),
});

const scriptApproveBodySchema = z.strictObject({
  expectedRevision: z.int().min(1),
  body: z.string().min(1).max(1500),
  usedFactIds: z.array(z.string().min(1).max(128)).max(50),
});

const announcementBodySchema = z.strictObject({
  expectedRevision: z.int().min(1),
  text: z.string().min(1).max(500),
  language: z.enum(['en', 'hi', 'gu']),
});

type ProposalRow = {
  id: string;
  base_revision: number;
  input_json: string;
  result_json: string;
  status: 'proposed' | 'accepted' | 'stale';
  expires_at: string;
};

type StateRow = {
  revision: number;
  published_revision: number | null;
  state_json: string;
  deleted_at: string | null;
};

export class EventRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Idempotent: schema.sql uses CREATE TABLE IF NOT EXISTS throughout.
    this.ctx.storage.sql.exec(SCHEMA_SQL);
  }

  // ───────────────────────── synchronous helpers (transaction-safe) ─────────────────────

  private readStateRow(): StateRow | null {
    const rows = this.ctx.storage.sql
      .exec<StateRow>(
        'SELECT revision, published_revision, state_json, deleted_at FROM event_state WHERE singleton = 1',
      )
      .toArray();
    return rows[0] ?? null;
  }

  private roleOf(uid: string): Role | null {
    const rows = this.ctx.storage.sql
      .exec<{ role: Role }>('SELECT role FROM members WHERE uid = ?', uid)
      .toArray();
    return rows[0]?.role ?? null;
  }

  /**
   * Resolves the live event or throws. A non-member gets 404 with no revision, so another
   * event's revision can never leak. An anchor hitting an owner-only command gets 403.
   */
  private requireAccess(uid: string, need: 'owner' | 'member'): { row: StateRow; state: EventState; role: Role } {
    const row = this.readStateRow();
    if (row === null || row.deleted_at !== null) {
      return throwApi('NOT_FOUND', 'Event not found.') as never;
    }
    const role = this.roleOf(uid);
    if (role === null) {
      return throwApi('NOT_FOUND', 'Event not found.') as never;
    }
    if (need === 'owner' && role !== 'owner') {
      return throwApi('FORBIDDEN_ROLE', 'Only the event owner can do that.') as never;
    }
    return { row, state: JSON.parse(row.state_json) as EventState, role };
  }

  /** Ledger lookup. Runs FIRST inside every mutation, before any revision check. */
  private replayOrReject(env: MutationEnvelope): CommandResponse | null {
    const rows = this.ctx.storage.sql
      .exec<{ request_hash: string; status_code: number; response_json: string }>(
        'SELECT request_hash, status_code, response_json FROM command_results WHERE uid = ? AND request_key = ?',
        env.uid,
        env.idempotencyKey,
      )
      .toArray();
    const hit = rows[0];
    if (hit === undefined) return null;
    if (hit.request_hash !== env.requestHash) {
      return throwApi(
        'IDEMPOTENCY_MISMATCH',
        'That Idempotency-Key was already used with a different request body.',
      ) as never;
    }
    return { status: hit.status_code, body: JSON.parse(hit.response_json) as unknown };
  }

  private recordCommand(env: MutationEnvelope, response: CommandResponse): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO command_results (uid, request_key, request_hash, status_code, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      env.uid,
      env.idempotencyKey,
      env.requestHash,
      response.status,
      JSON.stringify(response.body),
      env.nowIso,
    );
  }

  private requireRevision(row: StateRow, expected: number): void {
    if (row.revision !== expected) {
      throwApi(
        'REVISION_CONFLICT',
        'The event changed. Refresh and preview again.',
        row.revision,
      );
    }
  }

  /** Writes state + the append-only revision row + the published pointer together. */
  private commitRevision(
    state: EventState,
    actorUid: string,
    action: string,
    publishedRevision: number | null,
    nowIso: string,
  ): void {
    if (!withinStateBodyLimit(state)) {
      throwApi('VALIDATION_FAILED', 'Event state exceeds the 128 KB limit.');
    }
    const json = JSON.stringify(state);
    this.ctx.storage.sql.exec(
      'UPDATE event_state SET revision = ?, published_revision = ?, state_json = ? WHERE singleton = 1',
      state.revision,
      publishedRevision,
      json,
    );
    // Append-only. A published snapshot is never edited; corrections are new revisions.
    this.ctx.storage.sql.exec(
      'INSERT INTO revisions (revision, state_json, actor_uid, action, created_at) VALUES (?, ?, ?, ?, ?)',
      state.revision,
      json,
      actorUid,
      action,
      nowIso,
    );
    // EAGER staleness: any new revision invalidates every outstanding proposal, because each
    // was solved against an older base. Approval still re-checks (it is the authority); this
    // just keeps the table honest for a future proposals list.
    this.ctx.storage.sql.exec(
      "UPDATE proposals SET status = 'stale' WHERE status = 'proposed'",
    );
  }

  /** Maps a domain rule refusal onto the HTTP error contract. */
  private runTransition(fn: () => EventState): EventState {
    try {
      return fn();
    } catch (cause) {
      if (cause instanceof TransitionError) {
        return throwApi(cause.code, cause.message) as never;
      }
      throw cause;
    }
  }

  /**
   * Idempotent cleanup. Alarms can repeat and can be delayed, so this is safe to call any
   * number of times and is also called at request entry.
   */
  private sweepIfExpired(nowIso: string): void {
    const row = this.readStateRow();
    if (row === null) return;
    if (row.deleted_at !== null) return; // already a tombstone
    const state = JSON.parse(row.state_json) as EventState;
    if (Date.parse(state.expiresAt) > Date.parse(nowIso)) return;
    this.purge(nowIso);
  }

  /** Deletes event content, proposals and membership; leaves a non-personal tombstone. */
  private purge(nowIso: string): void {
    for (const table of ['revisions', 'members', 'invitations', 'proposals', 'acknowledgments']) {
      this.ctx.storage.sql.exec(`DELETE FROM ${table}`);
    }
    this.ctx.storage.sql.exec(
      'UPDATE event_state SET state_json = ?, published_revision = NULL, deleted_at = ? WHERE singleton = 1',
      TOMBSTONE_JSON,
      nowIso,
    );
  }

  // ───────────────────────────────── commands ──────────────────────────────────────────

  /** `PUT /v1/events/{uuid}` — caller becomes owner, revision 1, phase draft, no pointer. */
  async create(cmd: CreateCommand): Promise<CommandResponse> {
    const parsed = createBodySchema.safeParse(cmd.body);
    if (!parsed.success) {
      throwApi('VALIDATION_FAILED', `Invalid event body: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
    }
    const body = parsed.data;
    if (body.seed === 'college-demo-v1') {
      throwApi('NOT_IMPLEMENTED', 'not implemented: Milestone 5');
    }

    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;

      const existing = this.readStateRow();
      if (existing !== null) {
        // Same UUID, different creator or a second create: not a retry, a conflict.
        return throwApi('ALREADY_EXISTS', 'That event id already exists.') as never;
      }

      const createdAt = cmd.nowIso;
      const state: EventState = {
        id: cmd.eventId,
        ownerUid: cmd.uid,
        name: body.name,
        timezone: 'Asia/Kolkata',
        startsAt: body.startsAt,
        hardEndMin: body.hardEndMin,
        mode: body.mode,
        phase: 'draft',
        revision: 1,
        // Required in rehearsal, forbidden in live (§12). Seeded to the event start so the
        // scenario clock begins at minute zero rather than at today's wall clock.
        scenarioNowAt: body.mode === 'rehearsal' ? body.startsAt : null,
        currentCueId: null,
        activeForecastEndMin: null,
        scheduleHealth: 'valid',
        eventFacts: [],
        speakers: [],
        cues: [],
        approvedScripts: [],
        announcements: [],
        createdAt,
        updatedAt: createdAt,
        expiresAt: new Date(Date.parse(createdAt) + RETENTION_MS).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      };

      this.ctx.storage.sql.exec(
        'INSERT INTO event_state (singleton, revision, published_revision, state_json, deleted_at) VALUES (1, ?, NULL, ?, NULL)',
        1,
        JSON.stringify(state),
      );
      this.ctx.storage.sql.exec(
        'INSERT INTO revisions (revision, state_json, actor_uid, action, created_at) VALUES (?, ?, ?, ?, ?)',
        1,
        JSON.stringify(state),
        cmd.uid,
        'create',
        createdAt,
      );
      this.ctx.storage.sql.exec(
        'INSERT INTO members (uid, role, joined_at) VALUES (?, ?, ?)',
        cmd.uid,
        'owner',
        createdAt,
      );

      const response: CommandResponse = {
        status: 201,
        body: { eventId: cmd.eventId, revision: 1, state },
      };
      this.recordCommand(cmd, response);
      return response;
    });
  }

  /** `GET /v1/events/{id}` — owner only. Anchors use `/published`. */
  async getForOwner(uid: string, nowIso: string): Promise<CommandResponse> {
    this.sweepIfExpired(nowIso);
    const { row, state } = this.requireAccess(uid, 'owner');
    const acknowledgments = this.ctx.storage.sql
      .exec<{ uid: string; revision: number; acknowledged_at: string }>(
        'SELECT uid, revision, acknowledged_at FROM acknowledgments ORDER BY uid',
      )
      .toArray()
      .map((a) => ({ uid: a.uid, revision: a.revision, acknowledgedAt: a.acknowledged_at }));
    return {
      status: 200,
      body: {
        state,
        publishedRevision: row.published_revision,
        serverNow: nowIso,
        acknowledgments,
      },
    };
  }

  /** `PUT /v1/events/{id}/draft` — owner, draft phase only. Server computes intervals. */
  async saveDraft(cmd: DraftCommand): Promise<CommandResponse> {
    const parsed = draftBodySchema.safeParse(cmd.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throwApi(
        'VALIDATION_FAILED',
        `Invalid draft: ${issue === undefined ? 'unknown' : `${issue.path.join('.')} ${issue.message}`}`,
      );
    }
    const body = parsed.data;

    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;

      const { row, state } = this.requireAccess(cmd.uid, 'owner');
      this.requireRevision(row, body.expectedRevision);
      if (state.phase !== 'draft') {
        return throwApi('WRONG_PHASE', 'Direct agenda edits are draft-only.') as never;
      }

      // Server computes the intervals from minute zero. Request data can only ever reach a
      // Cue through materializeDraftCues, so runtime fields cannot be mass-assigned.
      const intervals = computeInitialIntervals(body.cues);
      const cues: Cue[] = materializeDraftCues(body.cues, intervals);

      const next: EventState = {
        ...state,
        name: body.config.name,
        startsAt: body.config.startsAt,
        hardEndMin: body.config.hardEndMin,
        scenarioNowAt: state.mode === 'rehearsal' ? body.config.startsAt : null,
        eventFacts: body.eventFacts,
        speakers: body.speakers,
        cues,
        revision: state.revision + 1,
        updatedAt: cmd.nowIso,
      };

      const check = eventStateSchema.safeParse(next);
      if (!check.success) {
        const issue = check.error.issues[0];
        return throwApi(
          'VALIDATION_FAILED',
          `Invalid draft: ${issue === undefined ? 'unknown' : `${issue.path.join('.')} ${issue.message}`}`,
        ) as never;
      }

      // Draft saves do not publish: the pointer stays where it was.
      this.commitRevision(next, cmd.uid, 'draft', row.published_revision, cmd.nowIso);

      const response: CommandResponse = { status: 200, body: { revision: next.revision, state: next } };
      this.recordCommand(cmd, response);
      return response;
    });
  }

  /** `POST /v1/events/{id}/publish` — full validation, then running, in one transaction. */
  async publish(cmd: PublishCommand): Promise<CommandResponse> {
    const parsed = expectedRevisionOnlySchema.safeParse(cmd.body);
    if (!parsed.success) {
      throwApi('VALIDATION_FAILED', 'Invalid body: expectedRevision is required.');
    }
    const expectedRevision = parsed.data.expectedRevision;

    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;

      const { row, state } = this.requireAccess(cmd.uid, 'owner');
      this.requireRevision(row, expectedRevision);
      if (state.phase !== 'draft') {
        return throwApi('WRONG_PHASE', 'This event has already been published.') as never;
      }

      // Publication requires 1-20 valid cues.
      const cueCheck = publishableCuesSchema.safeParse(state.cues);
      if (!cueCheck.success) {
        return throwApi(
          'VALIDATION_FAILED',
          `Cannot publish: ${cueCheck.error.issues[0]?.message ?? 'invalid cues'}`,
        ) as never;
      }

      // Independent plan validation. Draft validation runs from MINUTE ZERO, independently
      // of today's live wall clock (§12), hence nowMin: 0.
      const candidate = state.cues
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ cueId: c.id, startMin: c.plannedStartMin, endMin: c.plannedEndMin }));
      const checks = validatePlan(state, candidate, { activeForecastEndMin: null, nowMin: 0 });
      if (!planIsValid(checks)) {
        const broke = checks.filter((c) => !c.passed).map((c) => `${c.rule}${c.cueId === null ? '' : `(${c.cueId})`}`);
        return throwApi('VALIDATION_FAILED', `Cannot publish, rules violated: ${broke.join(', ')}`) as never;
      }

      const revision = state.revision + 1;
      const next: EventState = {
        ...state,
        // It does not pretend the first cue has already started.
        phase: 'running',
        revision,
        updatedAt: cmd.nowIso,
      };

      // New revision AND published pointer, atomically.
      this.commitRevision(next, cmd.uid, 'publish', revision, cmd.nowIso);

      const response: CommandResponse = {
        status: 200,
        body: { revision, publishedRevision: revision, state: next },
      };
      this.recordCommand(cmd, response);
      return response;
    });
  }

  /** `GET /v1/events/{id}/published?afterRevision=N` — member; 204 when unchanged. */
  async getPublished(uid: string, afterRevision: number | null, nowIso: string): Promise<CommandResponse> {
    this.sweepIfExpired(nowIso);
    const { row, state } = this.requireAccess(uid, 'member');
    if (row.published_revision === null) {
      // A legitimate waiting state for an anchor who joined before the first publish.
      throwApi('NOT_PUBLISHED', 'The organizer has not published this event yet.');
    }
    if (afterRevision !== null && (row.published_revision as number) <= afterRevision) {
      return { status: 204, body: null };
    }
    return {
      status: 200,
      body: { state, publishedRevision: row.published_revision, serverNow: nowIso },
    };
  }

  /** `POST /v1/events/{id}/invitations` — plaintext secret returned exactly once. */
  async createInvitation(
    cmd: MutationEnvelope,
    tokenHash: string,
    expiresAt: string,
  ): Promise<CommandResponse> {
    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;
      this.requireAccess(cmd.uid, 'owner');
      this.ctx.storage.sql.exec(
        'INSERT INTO invitations (token_hash, role, expires_at, consumed_by, consumed_at) VALUES (?, ?, ?, NULL, NULL)',
        tokenHash,
        'anchor',
        expiresAt,
      );
      // The plaintext secret is added by the Worker and never stored or logged.
      const response: CommandResponse = { status: 201, body: { expiresAt } };
      this.recordCommand(cmd, response);
      return response;
    });
  }

  /** `POST /v1/events/{id}/join` — atomic consume-and-join. One use, one hour. */
  async join(cmd: JoinCommand): Promise<CommandResponse> {
    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;

      const row = this.readStateRow();
      if (row === null || row.deleted_at !== null) {
        return throwApi('NOT_FOUND', 'Event not found.') as never;
      }
      const state = JSON.parse(row.state_json) as EventState;

      const rows = this.ctx.storage.sql
        .exec<{ token_hash: string; expires_at: string; consumed_by: string | null }>(
          'SELECT token_hash, expires_at, consumed_by FROM invitations WHERE token_hash = ?',
          cmd.inviteCodeHash,
        )
        .toArray();
      const invite = rows[0];
      if (invite === undefined || invite.consumed_by !== null) {
        return throwApi('INVITATION_INVALID', 'That invitation is not valid.') as never;
      }
      if (Date.parse(invite.expires_at) <= Date.parse(cmd.nowIso)) {
        return throwApi('INVITATION_INVALID', 'That invitation has expired.') as never;
      }

      this.ctx.storage.sql.exec(
        'UPDATE invitations SET consumed_by = ?, consumed_at = ? WHERE token_hash = ? AND consumed_by IS NULL',
        cmd.uid,
        cmd.nowIso,
        cmd.inviteCodeHash,
      );
      this.ctx.storage.sql.exec(
        'INSERT OR IGNORE INTO members (uid, role, joined_at) VALUES (?, ?, ?)',
        cmd.uid,
        'anchor',
        cmd.nowIso,
      );

      // Joining is an auxiliary record: it does not increment the event revision.
      const response: CommandResponse = { status: 200, body: { role: 'anchor', eventId: state.id } };
      this.recordCommand(cmd, response);
      return response;
    });
  }

  /** `POST /v1/events/{id}/ack` — member. Does not increment the revision. */
  async acknowledge(uid: string, publishedRevision: number, nowIso: string): Promise<CommandResponse> {
    this.sweepIfExpired(nowIso);
    return this.ctx.storage.transactionSync(() => {
      const { row } = this.requireAccess(uid, 'member');
      if (row.published_revision === null) {
        return throwApi('NOT_PUBLISHED', 'Nothing has been published to acknowledge.') as never;
      }
      // Reject a future or unpublished revision. An older one is allowed and shown as behind.
      if (publishedRevision > (row.published_revision as number)) {
        return throwApi('ACK_INVALID', 'Cannot acknowledge a revision that is not published.') as never;
      }
      this.ctx.storage.sql.exec(
        'INSERT INTO acknowledgments (uid, revision, acknowledged_at) VALUES (?, ?, ?) ' +
          'ON CONFLICT(uid) DO UPDATE SET revision = excluded.revision, acknowledged_at = excluded.acknowledged_at',
        uid,
        publishedRevision,
        nowIso,
      );
      return {
        status: 200,
        body: { acknowledgedRevision: publishedRevision, acknowledgedAt: nowIso },
      };
    });
  }

  /** `GET /v1/events/{id}/revisions` — owner. Read-only audit list, cap 50. */
  async listRevisions(
    uid: string,
    before: number | null,
    limit: number,
    nowIso: string,
  ): Promise<CommandResponse> {
    this.sweepIfExpired(nowIso);
    this.requireAccess(uid, 'owner');
    const capped = Math.min(Math.max(limit, 1), REVISION_PAGE_CAP);
    const rows = this.ctx.storage.sql
      .exec<{ revision: number; action: string; actor_uid: string; created_at: string }>(
        'SELECT revision, action, actor_uid, created_at FROM revisions WHERE revision < ? ORDER BY revision DESC LIMIT ?',
        before ?? Number.MAX_SAFE_INTEGER,
        capped + 1,
      )
      .toArray();
    const page = rows.slice(0, capped);
    return {
      status: 200,
      body: {
        items: page.map((r) => ({
          revision: r.revision,
          action: r.action,
          actorUid: r.actor_uid,
          createdAt: r.created_at,
        })),
        nextBefore: rows.length > capped ? (page[page.length - 1]?.revision ?? null) : null,
      },
    };
  }

  /** `GET /v1/events/{id}/revisions/{rev}` — owner. Immutable audit record. */
  async getRevision(uid: string, revision: number, nowIso: string): Promise<CommandResponse> {
    this.sweepIfExpired(nowIso);
    this.requireAccess(uid, 'owner');
    const rows = this.ctx.storage.sql
      .exec<{ state_json: string }>('SELECT state_json FROM revisions WHERE revision = ?', revision)
      .toArray();
    const found = rows[0];
    if (found === undefined) {
      throwApi('NOT_FOUND', 'No such revision.');
    }
    return {
      status: 200,
      body: { revision, state: JSON.parse((found as { state_json: string }).state_json) as EventState },
    };
  }

  /** `DELETE /v1/events/{id}` — owner. Access is denied immediately afterwards. */
  async destroy(cmd: DestroyCommand): Promise<CommandResponse> {
    const parsed = expectedRevisionOnlySchema.safeParse(cmd.body);
    if (!parsed.success) {
      throwApi('VALIDATION_FAILED', 'Invalid body: expectedRevision is required.');
    }
    const expectedRevision = parsed.data.expectedRevision;

    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;
      const { row } = this.requireAccess(cmd.uid, 'owner');
      this.requireRevision(row, expectedRevision);
      // Deliberately NOT recorded in the ledger: the tombstone wipes command_results too,
      // so there is nothing to replay and a repeat correctly returns 404.
      this.purge(cmd.nowIso);
      return { status: 204, body: null };
    });
  }


  // ───────────────────────── Milestone 3: repair proposals ─────────────────────────────

  /**
   * `POST /v1/events/{id}/repair-proposals` - owner.
   *
   * Runs the solver against a COPY of state and stores an expiring proposal. An infeasible
   * result is a SUCCESSFUL `201` response carrying the quantified shortage, not an error:
   * the organizer needs to see why, and §12 requires the published plan to be untouched
   * either way.
   */
  async proposeRepair(cmd: MutationEnvelope & { body: unknown; proposalId: string }): Promise<CommandResponse> {
    const parsed = repairInputSchema.safeParse(cmd.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throwApi(
        'VALIDATION_FAILED',
        `Invalid repair input: ${issue === undefined ? 'unknown' : `${issue.path.join('.')} ${issue.message}`}`,
      );
    }
    const input: RepairInput = parsed.data;

    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;

      const { row, state } = this.requireAccess(cmd.uid, 'owner');
      this.requireRevision(row, input.expectedRevision);
      if (state.phase !== 'running') {
        return throwApi('WRONG_PHASE', 'Repairs apply to a running event.') as never;
      }

      // The solver is pure and synchronous, so it is safe inside the transaction. It reads
      // `state` and never writes to it.
      const result = previewRepair(state, input, cmd.nowIso);

      const expiresAt = new Date(Date.parse(cmd.nowIso) + PROPOSAL_TTL_MS)
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z');

      this.ctx.storage.sql.exec(
        'INSERT INTO proposals (id, kind, base_revision, input_json, result_json, status, created_by, created_at, expires_at) ' +
          "VALUES (?, 'repair', ?, ?, ?, 'proposed', ?, ?, ?)",
        cmd.proposalId,
        state.revision,
        JSON.stringify(input),
        JSON.stringify(result),
        cmd.uid,
        cmd.nowIso,
        expiresAt,
      );

      // A preview mutates nothing: no revision bump, no published pointer change, no
      // `revisions` row. Proposals are auxiliary records (§12).
      const response: CommandResponse = {
        status: 201,
        body: { proposalId: cmd.proposalId, expiresAt, result },
      };
      this.recordCommand(cmd, response);
      return response;
    });
  }

  /**
   * `POST /v1/events/{id}/repair-proposals/{pid}/approve` - owner.
   *
   * Approval RECOMPUTES from the stored `input_json` and publishes THAT. It never publishes
   * the stored `result_json`: a stored result is a preview artefact, and §12 is explicit that
   * we must never silently publish a different repair from the one approved. The recomputed
   * plan is compared against the preview and a divergence is refused, not applied.
   */
  async approveRepair(
    cmd: MutationEnvelope & { body: unknown; proposalId: string },
  ): Promise<CommandResponse> {
    const parsed = expectedRevisionOnlySchema.safeParse(cmd.body);
    if (!parsed.success) {
      throwApi('VALIDATION_FAILED', 'Invalid body: expectedRevision is required.');
    }
    const expectedRevision = parsed.data.expectedRevision;

    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;

      const { row, state } = this.requireAccess(cmd.uid, 'owner');
      this.requireRevision(row, expectedRevision);

      const rows = this.ctx.storage.sql
        .exec<ProposalRow>(
          "SELECT id, base_revision, input_json, result_json, status, expires_at FROM proposals WHERE id = ? AND kind = 'repair'",
          cmd.proposalId,
        )
        .toArray();
      const proposal = rows[0];
      if (proposal === undefined) {
        return throwApi('NOT_FOUND', 'No such proposal.') as never;
      }
      if (proposal.status === 'accepted') {
        return throwApi('PROPOSAL_ALREADY_APPLIED', 'That proposal was already applied.') as never;
      }
      if (proposal.status === 'stale') {
        return throwApi('PROPOSAL_STALE', 'The event changed. Preview again.') as never;
      }
      // TTL is real wall-clock, independent of the rehearsal clock.
      if (Date.parse(proposal.expires_at) <= Date.parse(cmd.nowIso)) {
        return throwApi('PROPOSAL_EXPIRED', 'That preview expired. Preview again.') as never;
      }
      if (proposal.base_revision !== state.revision) {
        this.ctx.storage.sql.exec("UPDATE proposals SET status = 'stale' WHERE id = ?", cmd.proposalId);
        return throwApi('PROPOSAL_STALE', 'The event changed. Preview again.') as never;
      }

      const stored = JSON.parse(proposal.result_json) as RepairResult;
      if (!stored.feasible) {
        return throwApi('PROPOSAL_INFEASIBLE', 'An infeasible repair cannot be published.') as never;
      }

      const input = JSON.parse(proposal.input_json) as RepairInput;

      // RECOMPUTE. Route 1 to PLAN_TIME_STALE: with no active cue the DP cursor is
      // max(latest completed end, current minute), so an advanced clock changes the plan.
      const recomputed = previewRepair(state, input, cmd.nowIso);
      if (!recomputed.feasible) {
        return throwApi(
          'PLAN_TIME_STALE',
          'Time advanced and this plan is no longer reachable. Preview again.',
        ) as never;
      }
      // §12: never silently publish a different repair from the one approved. The stored
      // result is a preview artefact and is never trusted into production - what gets
      // published is `recomputed`, and a divergence is refused rather than reconciled.
      if (!sameRepairOutcome(recomputed, stored)) {
        return throwApi(
          'PROPOSAL_RESULT_DIVERGED',
          'This preview no longer matches what the scheduler produces. Preview again.',
        ) as never;
      }

      const next = this.runTransition(() => applyRepair(state, input, recomputed, cmd.nowIso));

      // Route 2 to PLAN_TIME_STALE: with an ACTIVE cue the DP cursor is the absolute forecast
      // end and never depends on the clock, so the recomputed plan above would be identical
      // forever. The independent validator is what notices that the scenario minute has
      // passed the forecast end. Without this check an active-cue event could never go
      // stale, and the check above would pass vacuously on the fixture's main path.
      const checks = validatePlan(
        next,
        recomputed.schedule,
        { activeForecastEndMin: next.activeForecastEndMin, nowMin: currentMinute(next, cmd.nowIso) },
      );
      if (!planIsValid(checks)) {
        const broke = checks
          .filter((c) => !c.passed)
          .map((c) => `${c.rule}${c.cueId === null ? '' : `(${c.cueId})`}`);
        return throwApi(
          'PLAN_TIME_STALE',
          `Time advanced and this plan is no longer reachable (${broke.join(', ')}). Preview again.`,
        ) as never;
      }

      const stateCheck = eventStateSchema.safeParse(next);
      if (!stateCheck.success) {
        return throwApi(
          'VALIDATION_FAILED',
          `Repair produced an invalid state: ${stateCheck.error.issues[0]?.message ?? 'unknown'}`,
        ) as never;
      }

      this.ctx.storage.sql.exec("UPDATE proposals SET status = 'accepted' WHERE id = ?", cmd.proposalId);
      this.commitRevision(next, cmd.uid, 'repair', next.revision, cmd.nowIso);

      const response: CommandResponse = {
        status: 200,
        body: { revision: next.revision, publishedRevision: next.revision, state: next },
      };
      this.recordCommand(cmd, response);
      return response;
    });
  }

  // ───────────────────────── Milestone 3: cue and clock controls ───────────────────────

  /** `POST /v1/events/{id}/cues/{cid}/start` - owner. Server-derived actual start. */
  async startCueCommand(cmd: MutationEnvelope & { body: unknown; cueId: string }): Promise<CommandResponse> {
    return this.mutateRunning(cmd, (state) => ({
      next: this.runTransition(() => startCue(state, cmd.cueId, cmd.nowIso)),
      action: 'cue_start',
    }));
  }

  /** `POST /v1/events/{id}/cues/{cid}/complete` - owner. Reality is recorded regardless. */
  async completeCueCommand(cmd: MutationEnvelope & { body: unknown; cueId: string }): Promise<CommandResponse> {
    return this.mutateRunning(cmd, (state) => ({
      next: this.runTransition(() => completeCue(state, cmd.cueId, cmd.nowIso)),
      action: 'cue_complete',
    }));
  }

  /** `POST /v1/events/{id}/rehearsal-clock` - owner, rehearsal only, strictly forward. */
  async rehearsalClockCommand(cmd: MutationEnvelope & { body: unknown }): Promise<CommandResponse> {
    const parsed = rehearsalClockBodySchema.safeParse(cmd.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throwApi(
        'VALIDATION_FAILED',
        `Invalid body: ${issue === undefined ? 'unknown' : `${issue.path.join('.')} ${issue.message}`}`,
      );
    }
    const nowAt = parsed.data.nowAt;
    return this.mutateRunning(cmd, (state) => ({
      next: this.runTransition(() => advanceRehearsalClock(state, nowAt, cmd.nowIso)),
      action: 'rehearsal_clock',
    }));
  }

  /**
   * Shared shape for the running-state commands: ledger, role, revision, then one pure
   * domain transition, then state + revision row + published pointer in this transaction.
   */
  private mutateRunning(
    cmd: MutationEnvelope & { body: unknown },
    transition: (state: EventState) => { next: EventState; action: string },
  ): CommandResponse {
    const parsed = z
      .object({ expectedRevision: z.int().min(1) })
      .safeParse(cmd.body);
    if (!parsed.success) {
      throwApi('VALIDATION_FAILED', 'Invalid body: expectedRevision is required.');
    }
    const expectedRevision = parsed.data.expectedRevision;

    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;

      const { row, state } = this.requireAccess(cmd.uid, 'owner');
      this.requireRevision(row, expectedRevision);
      if (state.phase !== 'running') {
        return throwApi('WRONG_PHASE', 'This command applies to a running event.') as never;
      }

      const { next, action } = transition(state);

      const check = eventStateSchema.safeParse(next);
      if (!check.success) {
        const issue = check.error.issues[0];
        return throwApi(
          'VALIDATION_FAILED',
          `Invalid resulting state: ${issue === undefined ? 'unknown' : `${issue.path.join('.')} ${issue.message}`}`,
        ) as never;
      }

      this.commitRevision(next, cmd.uid, action, next.revision, cmd.nowIso);
      const response: CommandResponse = {
        status: 200,
        body: { revision: next.revision, publishedRevision: next.revision, state: next },
      };
      this.recordCommand(cmd, response);
      return response;
    });
  }

  /** `GET /v1/events/{id}/proposals/{pid}` - owner. Read-only preview retrieval. */
  async getProposal(uid: string, proposalId: string, nowIso: string): Promise<CommandResponse> {
    this.sweepIfExpired(nowIso);
    this.requireAccess(uid, 'owner');
    const rows = this.ctx.storage.sql
      .exec<ProposalRow>(
        'SELECT id, base_revision, input_json, result_json, status, expires_at FROM proposals WHERE id = ?',
        proposalId,
      )
      .toArray();
    const proposal = rows[0];
    if (proposal === undefined) {
      throwApi('NOT_FOUND', 'No such proposal.');
    }
    const p = proposal as ProposalRow;
    return {
      status: 200,
      body: {
        proposalId: p.id,
        status: p.status,
        baseRevision: p.base_revision,
        expiresAt: p.expires_at,
        result: JSON.parse(p.result_json) as RepairResult,
      },
    };
  }


  // ─────────────────────── Milestone 5: script proposals ───────────────────────────────

  /** Reads the AI in-flight lease. An expired row is treated as absent. */
  private aiLeaseHeld(nowIso: string): boolean {
    const rows = this.ctx.storage.sql
      .exec<{ reset_at: string }>(
        "SELECT reset_at FROM counters WHERE counter_key = 'ai:inflight'",
      )
      .toArray();
    const row = rows[0];
    return row !== undefined && Date.parse(row.reset_at) > Date.parse(nowIso);
  }

  private takeAiLease(nowIso: string): void {
    const resetAt = new Date(Date.parse(nowIso) + AI_LEASE_MS)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    this.ctx.storage.sql.exec(
      "INSERT INTO counters (counter_key, used, reset_at) VALUES ('ai:inflight', 1, ?) " +
        'ON CONFLICT(counter_key) DO UPDATE SET used = 1, reset_at = ?',
      resetAt,
      resetAt,
    );
  }

  /** Always called from a `finally`, so a thrown path cannot strand the lease. */
  private releaseAiLease(): void {
    this.ctx.storage.sql.exec("DELETE FROM counters WHERE counter_key = 'ai:inflight'");
  }

  private reserveAiDayUnit(nowIso: string): void {
    const key = `ai:event:${nowIso.slice(0, 10)}`;
    const rows = this.ctx.storage.sql
      .exec<{ used: number }>('SELECT used FROM counters WHERE counter_key = ?', key)
      .toArray();
    const used = rows[0]?.used ?? 0;
    if (used >= AI_EVENT_DAY_LIMIT) {
      throwApi('DEMO_CAPACITY', 'This event has used its AI drafts for today.');
    }
    const resetAt = `${nowIso.slice(0, 10)}T23:59:59Z`;
    this.ctx.storage.sql.exec(
      'INSERT INTO counters (counter_key, used, reset_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(counter_key) DO UPDATE SET used = ?, reset_at = ?',
      key,
      used + 1,
      resetAt,
      used + 1,
      resetAt,
    );
  }

  /**
   * `POST /v1/events/{id}/script-proposals` - owner.
   *
   * Four phases, and the ordering is the whole design:
   *   1. reserve (sync, atomic)  - lease + per-event day unit, under expectedRevision
   *   2. provider call (ASYNC)   - necessarily outside any transaction
   *   3. commit (sync, atomic)   - re-check baseRevision, store, release
   *   finally                    - release the lease on every path
   *
   * `transactionSync` is synchronous-only, so step 2 CANNOT accidentally be wrapped in a
   * transaction. The structure enforces §12's rule rather than relying on discipline.
   */
  async proposeScript(
    cmd: MutationEnvelope & { body: unknown; proposalId: string },
    doFetch?: FetchLike,
  ): Promise<CommandResponse> {
    const parsed = scriptProposalBodySchema.safeParse(cmd.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throwApi(
        'VALIDATION_FAILED',
        `Invalid script request: ${issue === undefined ? 'unknown' : `${issue.path.join('.')} ${issue.message}`}`,
      );
    }
    const request = parsed.data;

    // ── phase 1: reserve ────────────────────────────────────────────────────────────
    const prepared = this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return { replay } as const;

      const { state } = this.requireAccess(cmd.uid, 'owner');
      const row = this.readStateRow() as StateRow;
      this.requireRevision(row, request.expectedRevision);

      if (request.cueId !== null && !state.cues.some((c) => c.id === request.cueId)) {
        return throwApi('VALIDATION_FAILED', 'No such cue.') as never;
      }
      if (this.aiLeaseHeld(cmd.nowIso)) {
        return throwApi(
          'DEMO_CAPACITY',
          'A draft is already being generated for this event. Try again shortly.',
        ) as never;
      }
      this.reserveAiDayUnit(cmd.nowIso);
      this.takeAiLease(cmd.nowIso);

      const envelope = buildEnvelope(state, request.kind, request.language, request.cueId);
      return { replay: null, envelope, baseRevision: state.revision } as const;
    });

    if (prepared.replay !== null) return prepared.replay;
    const envelope: ScriptEnvelope = prepared.envelope;

    try {
      // ── phase 2: the provider, outside every transaction ──────────────────────────
      const outcome = await generateScriptDraft(envelope, this.env, doFetch ?? fetch);

      // ── phase 3: commit ───────────────────────────────────────────────────────────
      return this.ctx.storage.transactionSync(() => {
        const row = this.readStateRow();
        if (row === null || row.deleted_at !== null) {
          return throwApi('NOT_FOUND', 'Event not found.') as never;
        }
        const state = JSON.parse(row.state_json) as EventState;

        const stale = state.revision !== prepared.baseRevision;
        const expiresAt = new Date(Date.parse(cmd.nowIso) + PROPOSAL_TTL_MS)
          .toISOString()
          .replace(/\.\d{3}Z$/, 'Z');

        this.ctx.storage.sql.exec(
          'INSERT INTO proposals (id, kind, base_revision, input_json, result_json, status, created_by, created_at, expires_at) ' +
            "VALUES (?, 'script', ?, ?, ?, ?, ?, ?, ?)",
          cmd.proposalId,
          prepared.baseRevision,
          JSON.stringify({ ...request, promptVersion: PROMPT_VERSION, envelope }),
          JSON.stringify(outcome),
          stale ? 'stale' : 'proposed',
          cmd.uid,
          cmd.nowIso,
          expiresAt,
        );

        if (stale) {
          // The event moved while the provider was working. The draft is kept for the audit
          // trail but cannot be approved; the organizer regenerates against the new revision.
          return throwApi(
            'PROPOSAL_STALE',
            'The event changed while this draft was being generated. Generate a new one.',
          ) as never;
        }

        const response: CommandResponse = {
          status: 201,
          body: {
            proposalId: cmd.proposalId,
            baseRevision: prepared.baseRevision,
            body: outcome.body,
            usedFactIds: outcome.usedFactIds,
            warnings: outcome.warnings,
            source: outcome.source,
            model: outcome.model,
            fallbackReason: outcome.fallbackReason,
            approvedFacts: envelope.approvedFacts,
            expiresAt,
          },
        };
        this.recordCommand(cmd, response);
        return response;
      });
    } finally {
      // Runs on success, on rejection and on a provider throw. A crash before this is
      // covered by the lease expiry instead.
      this.ctx.storage.transactionSync(() => this.releaseAiLease());
    }
  }

  /**
   * `POST /v1/events/{id}/script-proposals/{pid}/approve` - owner.
   *
   * Stores the REVIEWED copy, which may differ from what was generated: review is mandatory
   * and editing is expected. `source` records who generated it, so an edited Gemini draft is
   * still `gemini` - downgrading it would erase the AI evidence the moment a human did the
   * review §7B requires. `humanEdited` records the other fact separately.
   */
  async approveScript(
    cmd: MutationEnvelope & { body: unknown; proposalId: string; inputHash: string },
  ): Promise<CommandResponse> {
    const parsed = scriptApproveBodySchema.safeParse(cmd.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throwApi(
        'VALIDATION_FAILED',
        `Invalid approval: ${issue === undefined ? 'unknown' : `${issue.path.join('.')} ${issue.message}`}`,
      );
    }
    const request = parsed.data;

    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;

      const { row, state } = this.requireAccess(cmd.uid, 'owner');
      this.requireRevision(row, request.expectedRevision);

      const rows = this.ctx.storage.sql
        .exec<ProposalRow>(
          "SELECT id, base_revision, input_json, result_json, status, expires_at FROM proposals WHERE id = ? AND kind = 'script'",
          cmd.proposalId,
        )
        .toArray();
      const proposal = rows[0];
      if (proposal === undefined) return throwApi('NOT_FOUND', 'No such draft.') as never;
      if (proposal.status === 'accepted') {
        return throwApi('PROPOSAL_ALREADY_APPLIED', 'That draft was already approved.') as never;
      }
      if (proposal.status === 'stale' || proposal.base_revision !== state.revision) {
        return throwApi('PROPOSAL_STALE', 'The event changed. Generate a new draft.') as never;
      }
      if (Date.parse(proposal.expires_at) <= Date.parse(cmd.nowIso)) {
        return throwApi('PROPOSAL_EXPIRED', 'That draft expired. Generate a new one.') as never;
      }

      const input = JSON.parse(proposal.input_json) as {
        kind: ScriptKind;
        language: Language;
        cueId: string | null;
        envelope: ScriptEnvelope;
        promptVersion: string;
      };
      const generated = JSON.parse(proposal.result_json) as {
        body: string;
        source: 'gemini' | 'template';
        model: string | null;
      };

      // §12: approval repeats the fact-reference check. An id the organizer submits must
      // still resolve against the facts that were supplied for this draft.
      const supplied = new Set(input.envelope.approvedFacts.map((f) => f.id));
      const unknownIds = request.usedFactIds.filter((id) => !supplied.has(id));
      if (unknownIds.length > 0) {
        return throwApi(
          'VALIDATION_FAILED',
          `These fact references are not part of this draft: ${unknownIds.join(', ')}`,
        ) as never;
      }

      const script: ApprovedScript = {
        id: cmd.proposalId,
        cueId: input.cueId,
        kind: input.kind,
        language: input.language,
        body: request.body,
        usedFactIds: request.usedFactIds,
        source: generated.source,
        model: generated.model,
        promptVersion: input.promptVersion,
        inputHash: cmd.inputHash,
        approvedBy: cmd.uid,
        approvedAt: cmd.nowIso,
      };

      const next: EventState = {
        ...state,
        approvedScripts: [...state.approvedScripts, script],
        revision: state.revision + 1,
        updatedAt: cmd.nowIso,
      };

      const check = eventStateSchema.safeParse(next);
      if (!check.success) {
        return throwApi(
          'VALIDATION_FAILED',
          `Cannot approve: ${check.error.issues[0]?.message ?? 'invalid state'}`,
        ) as never;
      }

      this.ctx.storage.sql.exec(
        "UPDATE proposals SET status = 'accepted' WHERE id = ?",
        cmd.proposalId,
      );
      // Draft phase leaves the published pointer null (§12).
      const publishedRevision = state.phase === 'draft' ? row.published_revision : next.revision;
      this.commitRevision(next, cmd.uid, 'script_approve', publishedRevision, cmd.nowIso);

      const response: CommandResponse = {
        status: 200,
        body: { revision: next.revision, scriptId: script.id, publishedRevision },
      };
      this.recordCommand(cmd, response);
      return response;
    });
  }

  // ─────────────────────── Milestone 5: announcements ──────────────────────────────────

  /** `POST /v1/events/{id}/announcements` - owner. Explicit publish IS the approval step. */
  async publishAnnouncement(
    cmd: MutationEnvelope & { body: unknown; announcementId: string },
  ): Promise<CommandResponse> {
    const parsed = announcementBodySchema.safeParse(cmd.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throwApi(
        'VALIDATION_FAILED',
        `Invalid announcement: ${issue === undefined ? 'unknown' : `${issue.path.join('.')} ${issue.message}`}`,
      );
    }
    const request = parsed.data;

    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;

      const { row, state } = this.requireAccess(cmd.uid, 'owner');
      this.requireRevision(row, request.expectedRevision);

      const announcement: Announcement = {
        id: cmd.announcementId,
        text: request.text,
        language: request.language,
        publishedAt: cmd.nowIso,
        dismissedAt: null,
      };
      const next: EventState = {
        ...state,
        announcements: [...state.announcements, announcement],
        revision: state.revision + 1,
        updatedAt: cmd.nowIso,
      };

      const check = eventStateSchema.safeParse(next);
      if (!check.success) {
        return throwApi(
          'VALIDATION_FAILED',
          `Cannot publish: ${check.error.issues[0]?.message ?? 'invalid state'}`,
        ) as never;
      }

      const publishedRevision = state.phase === 'draft' ? row.published_revision : next.revision;
      this.commitRevision(next, cmd.uid, 'announcement', publishedRevision, cmd.nowIso);

      const response: CommandResponse = {
        status: 200,
        body: { revision: next.revision, announcementId: announcement.id, publishedRevision },
      };
      this.recordCommand(cmd, response);
      return response;
    });
  }

  /** `POST /v1/events/{id}/announcements/{aid}/dismiss` - owner. Clears it in a new snapshot. */
  async dismissAnnouncement(
    cmd: MutationEnvelope & { body: unknown; announcementId: string },
  ): Promise<CommandResponse> {
    const parsed = expectedRevisionOnlySchema.safeParse(cmd.body);
    if (!parsed.success) {
      throwApi('VALIDATION_FAILED', 'Invalid body: expectedRevision is required.');
    }
    const expectedRevision = parsed.data.expectedRevision;

    return this.ctx.storage.transactionSync(() => {
      const replay = this.replayOrReject(cmd);
      if (replay !== null) return replay;

      const { row, state } = this.requireAccess(cmd.uid, 'owner');
      this.requireRevision(row, expectedRevision);

      const target = state.announcements.find((a) => a.id === cmd.announcementId);
      if (target === undefined) return throwApi('NOT_FOUND', 'No such announcement.') as never;
      if (target.dismissedAt !== null) {
        return throwApi('WRONG_PHASE', 'That announcement was already dismissed.') as never;
      }

      const next: EventState = {
        ...state,
        announcements: state.announcements.map((a) =>
          a.id === cmd.announcementId ? { ...a, dismissedAt: cmd.nowIso } : a,
        ),
        revision: state.revision + 1,
        updatedAt: cmd.nowIso,
      };

      const publishedRevision = state.phase === 'draft' ? row.published_revision : next.revision;
      this.commitRevision(next, cmd.uid, 'announcement_dismiss', publishedRevision, cmd.nowIso);

      const response: CommandResponse = {
        status: 200,
        body: { revision: next.revision, publishedRevision },
      };
      this.recordCommand(cmd, response);
      return response;
    });
  }

  /** Expiry cleanup at 72 hours. Alarms may repeat, so `purge` is idempotent. */
  override async alarm(): Promise<void> {
    this.sweepIfExpired(new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
  }

  /** Schedules the 72-hour cleanup. Called by the Worker right after creation. */
  async scheduleExpiry(expiresAt: string): Promise<void> {
    await this.ctx.storage.setAlarm(Date.parse(expiresAt));
  }
}
