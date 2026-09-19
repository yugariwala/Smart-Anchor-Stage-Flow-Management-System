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
  computeInitialIntervals,
  draftConfigSchema,
  draftCueInputSchema,
  eventStateSchema,
  factSchema,
  materializeDraftCues,
  planIsValid,
  publishableCuesSchema,
  speakerSchema,
  validatePlan,
  withinStateBodyLimit,
  type Cue,
  type EventState,
  type Role,
  z,
} from '@cuepilot/domain';

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
  speakers: z.array(speakerSchema).max(20),
  eventFacts: z.array(factSchema).max(10),
  cues: z.array(draftCueInputSchema).max(20),
});

const expectedRevisionOnlySchema = z.strictObject({ expectedRevision: z.int().min(1) });

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

  /** Expiry cleanup at 72 hours. Alarms may repeat, so `purge` is idempotent. */
  override async alarm(): Promise<void> {
    this.sweepIfExpired(new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
  }

  /** Schedules the 72-hour cleanup. Called by the Worker right after creation. */
  async scheduleExpiry(expiresAt: string): Promise<void> {
    await this.ctx.storage.setAlarm(Date.parse(expiresAt));
  }
}
