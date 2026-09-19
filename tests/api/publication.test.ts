import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  addAnchor,
  call,
  createEvent,
  createPublishedEvent,
  draftBody,
  errorCode,
  installLocalKeys,
  resetQuotas,
  json,
  mintToken,
  uuid,
} from './helpers/harness';

beforeAll(async () => {
  await installLocalKeys();
  await resetQuotas();
});

type Rooms = { EVENT_ROOMS: DurableObjectNamespace };
const roomFor = (eventId: string): DurableObjectStub => {
  const ns = (env as unknown as Rooms).EVENT_ROOMS;
  return ns.get(ns.idFromName(eventId));
};

/** Reads the raw storage rows, so tests assert what actually landed in SQLite. */
const rawRows = async (
  eventId: string,
): Promise<{
  state: { revision: number; published_revision: number | null; deleted_at: string | null };
  revisions: Array<{ revision: number; action: string }>;
  ledger: number;
}> =>
  runInDurableObject(roomFor(eventId), (_instance, state) => {
    const stateRow = state.storage.sql
      .exec<{ revision: number; published_revision: number | null; deleted_at: string | null }>(
        'SELECT revision, published_revision, deleted_at FROM event_state WHERE singleton = 1',
      )
      .toArray()[0] as { revision: number; published_revision: number | null; deleted_at: string | null };
    const revisions = state.storage.sql
      .exec<{ revision: number; action: string }>(
        'SELECT revision, action FROM revisions ORDER BY revision',
      )
      .toArray();
    const ledger = (
      state.storage.sql
        .exec<{ n: number }>('SELECT COUNT(*) AS n FROM command_results')
        .toArray()[0] as { n: number }
    ).n;
    return { state: stateRow, revisions, ledger };
  });

describe('draft to publish to snapshot', () => {
  it('round-trips and makes the snapshot visible to a member', async () => {
    const owner = await mintToken('pub-owner-1');
    const eventId = await createEvent(owner);

    // Creation: revision 1, phase draft, NO published pointer.
    const afterCreate = await rawRows(eventId);
    expect(afterCreate.state.revision).toBe(1);
    expect(afterCreate.state.published_revision).toBeNull();
    expect(afterCreate.revisions).toEqual([{ revision: 1, action: 'create' }]);

    // Draft save: revision 2, still no pointer.
    const draft = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(1),
      idempotencyKey: uuid(),
    });
    expect(draft.status).toBe(200);
    const draftBodyOut = await json<{ revision: number; state: { cues: Array<Record<string, number>> } }>(draft);
    expect(draftBodyOut.revision).toBe(2);
    // The server computed the intervals from minute zero.
    expect(draftBodyOut.state.cues.map((c) => [c.plannedStartMin, c.plannedEndMin])).toEqual([
      [0, 5],
      [5, 25],
      [25, 35],
      [35, 45],
      [45, 55],
      [55, 60],
    ]);
    const afterDraft = await rawRows(eventId);
    expect(afterDraft.state.published_revision).toBeNull();

    // Publish: revision 3 AND the pointer, together.
    const published = await call('POST', `/v1/events/${eventId}/publish`, {
      token: owner,
      body: { expectedRevision: 2 },
      idempotencyKey: uuid(),
    });
    expect(published.status).toBe(200);
    expect(await json<Record<string, unknown>>(published)).toMatchObject({
      revision: 3,
      publishedRevision: 3,
    });
    const afterPublish = await rawRows(eventId);
    expect(afterPublish.state.revision).toBe(3);
    expect(afterPublish.state.published_revision).toBe(3);
    expect(afterPublish.revisions.map((r) => r.action)).toEqual(['create', 'draft', 'publish']);

    // Publication changes phase to running without pretending the first cue has started.
    const read = await call('GET', `/v1/events/${eventId}`, { token: owner });
    const state = await json<{ state: { phase: string; cues: Array<{ status: string }> } }>(read);
    expect(state.state.phase).toBe('running');
    expect(state.state.cues.every((c) => c.status === 'pending')).toBe(true);

    // A member sees the snapshot.
    const anchor = await addAnchor(owner, eventId);
    const snapshot = await call('GET', `/v1/events/${eventId}/published`, { token: anchor });
    expect(snapshot.status).toBe(200);
    expect(await json<{ publishedRevision: number }>(snapshot)).toMatchObject({
      publishedRevision: 3,
    });
  });

  it('returns NOT_PUBLISHED to an anchor who joined before the first publish', async () => {
    const owner = await mintToken('pub-owner-2');
    const eventId = await createEvent(owner);
    const anchor = await addAnchor(owner, eventId);
    const res = await call('GET', `/v1/events/${eventId}/published`, { token: anchor });
    expect(res.status).toBe(409);
    const body = await json<{ error: { code: string; retryable: boolean } }>(res);
    // Distinct and retryable, so the anchor view can render "waiting for the organizer".
    expect(body.error.code).toBe('NOT_PUBLISHED');
    expect(body.error.retryable).toBe(true);
  });

  it('returns 204 when afterRevision is already current, with a server-time header on both', async () => {
    const owner = await mintToken('pub-owner-3');
    const { eventId, revision } = await createPublishedEvent(owner);

    const fresh = await call('GET', `/v1/events/${eventId}/published?afterRevision=${revision - 1}`, {
      token: owner,
    });
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get('X-Server-Now')).toMatch(/Z$/);

    const unchanged = await call('GET', `/v1/events/${eventId}/published?afterRevision=${revision}`, {
      token: owner,
    });
    expect(unchanged.status).toBe(204);
    expect(unchanged.headers.get('X-Server-Now')).toMatch(/Z$/);
    expect(await unchanged.text()).toBe('');
  });
});

describe('expectedRevision', () => {
  it('rejects a stale write with 409 and currentRevision, while the fresh one succeeds', async () => {
    const owner = await mintToken('pub-owner-4');
    const eventId = await createEvent(owner);

    // Client A saves a draft: revision 1 -> 2.
    const first = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(1),
      idempotencyKey: uuid(),
    });
    expect(first.status).toBe(200);

    // Client B still believes it is on revision 1.
    const stale = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(1),
      idempotencyKey: uuid(),
    });
    expect(stale.status).toBe(409);
    const body = await json<{ error: { code: string; currentRevision: number; retryable: boolean } }>(stale);
    expect(body.error.code).toBe('REVISION_CONFLICT');
    expect(body.error.currentRevision).toBe(2);
    expect(body.error.retryable).toBe(false);

    // The stale attempt mutated nothing.
    const rows = await rawRows(eventId);
    expect(rows.state.revision).toBe(2);
    expect(rows.revisions.map((r) => r.action)).toEqual(['create', 'draft']);

    // Client B refreshes and succeeds.
    const fresh = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(2),
      idempotencyKey: uuid(),
    });
    expect(fresh.status).toBe(200);
    expect(await json<{ revision: number }>(fresh)).toMatchObject({ revision: 3 });
  });

  it('rejects two simultaneous approvals: only the first publish wins', async () => {
    const owner = await mintToken('pub-owner-5');
    const eventId = await createEvent(owner);
    await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(1),
      idempotencyKey: uuid(),
    });

    // Both clients hold revision 2 and publish concurrently, with DIFFERENT keys.
    const [a, b] = await Promise.all([
      call('POST', `/v1/events/${eventId}/publish`, {
        token: owner,
        body: { expectedRevision: 2 },
        idempotencyKey: uuid(),
      }),
      call('POST', `/v1/events/${eventId}/publish`, {
        token: owner,
        body: { expectedRevision: 2 },
        idempotencyKey: uuid(),
      }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Exactly one publish revision exists: no duplicate application.
    const rows = await rawRows(eventId);
    expect(rows.revisions.filter((r) => r.action === 'publish')).toHaveLength(1);
    expect(rows.state.revision).toBe(3);
    expect(rows.state.published_revision).toBe(3);
  });
});

describe('idempotency', () => {
  it('replays the original response for the same key and applies the change once', async () => {
    const owner = await mintToken('pub-owner-6');
    const eventId = await createEvent(owner);
    await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(1),
      idempotencyKey: uuid(),
    });

    const key = uuid();
    const first = await call('POST', `/v1/events/${eventId}/publish`, {
      token: owner,
      body: { expectedRevision: 2 },
      idempotencyKey: key,
    });
    const firstBody = await json<Record<string, unknown>>(first);
    expect(first.status).toBe(200);

    // The retry sees the SAME body and status, not a REVISION_CONFLICT — the ledger is
    // checked before the revision check precisely so a lost response can be recovered.
    const retry = await call('POST', `/v1/events/${eventId}/publish`, {
      token: owner,
      body: { expectedRevision: 2 },
      idempotencyKey: key,
    });
    expect(retry.status).toBe(200);
    expect(await json<Record<string, unknown>>(retry)).toEqual(firstBody);

    // Applied exactly once.
    const rows = await rawRows(eventId);
    expect(rows.state.revision).toBe(3);
    expect(rows.revisions.filter((r) => r.action === 'publish')).toHaveLength(1);
  });

  it('replays a draft save without incrementing the revision twice', async () => {
    const owner = await mintToken('pub-owner-7');
    const eventId = await createEvent(owner);
    const key = uuid();
    const first = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(1),
      idempotencyKey: key,
    });
    const retry = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(1),
      idempotencyKey: key,
    });
    expect(retry.status).toBe(first.status);
    expect(await json<Record<string, unknown>>(retry)).toEqual(await json<Record<string, unknown>>(first));
    const rows = await rawRows(eventId);
    expect(rows.state.revision).toBe(2);
    expect(rows.revisions.filter((r) => r.action === 'draft')).toHaveLength(1);
  });

  it('returns 409 IDEMPOTENCY_MISMATCH for the same key with a different body', async () => {
    const owner = await mintToken('pub-owner-8');
    const eventId = await createEvent(owner);

    const key = uuid();
    const first = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(1),
      idempotencyKey: key,
    });
    expect(first.status).toBe(200);

    // Same key, genuinely different content.
    const changed = draftBody(2) as { config: { name: string } };
    changed.config.name = 'A Different Event Name';
    const mismatch = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: changed,
      idempotencyKey: key,
    });
    expect(mismatch.status).toBe(409);
    expect(await errorCode(mismatch)).toBe('IDEMPOTENCY_MISMATCH');

    // And it changed nothing.
    const rows = await rawRows(eventId);
    expect(rows.state.revision).toBe(2);
  });

  it('is insensitive to key order in the body, since the hash is canonical', async () => {
    const owner = await mintToken('pub-owner-9');
    const eventId = await createEvent(owner);
    const key = uuid();

    const first = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(1),
      idempotencyKey: key,
    });
    expect(first.status).toBe(200);

    // Same content, keys emitted in a different order.
    const base = draftBody(1) as Record<string, unknown>;
    const reordered = {
      cues: base.cues,
      eventFacts: base.eventFacts,
      speakers: base.speakers,
      config: base.config,
      expectedRevision: base.expectedRevision,
    };
    const retry = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: reordered,
      idempotencyKey: key,
    });
    // A replay, not a mismatch.
    expect(retry.status).toBe(200);
    expect(await json<Record<string, unknown>>(retry)).toEqual(await json<Record<string, unknown>>(first));
  });

  it('scopes keys per uid, so two users may reuse the same key', async () => {
    const ownerA = await mintToken('pub-owner-10a');
    const ownerB = await mintToken('pub-owner-10b');
    const sharedKey = 'shared-key-value';

    const a = await createEvent(ownerA);
    const inviteA = await call('POST', `/v1/events/${a}/invitations`, {
      token: ownerA,
      body: { role: 'anchor' },
      idempotencyKey: sharedKey,
    });
    expect(inviteA.status).toBe(201);

    // Same key, different uid, same event: not a collision.
    const anchor = await addAnchor(ownerA, a);
    void ownerB;
    const ackFromAnchor = await call('POST', `/v1/events/${a}/join`, {
      token: anchor,
      body: { inviteCode: 'irrelevant' },
      idempotencyKey: sharedKey,
    });
    // Rejected on invite validity, NOT on idempotency mismatch.
    expect(await errorCode(ackFromAnchor)).toBe('INVITATION_INVALID');
  });
});

describe('atomicity', () => {
  it('rolls back everything when publish validation fails, leaving the revision unchanged', async () => {
    const owner = await mintToken('pub-owner-11');
    const eventId = await createEvent(owner);

    // A draft that is individually valid but unpublishable: qa is pinned to minute 10,
    // which collides with the keynote running until minute 25.
    const body = draftBody(1) as { cues: Array<Record<string, unknown>> };
    body.cues[2] = { ...(body.cues[2] as Record<string, unknown>), fixedStartMin: 10 };
    const draft = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body,
      idempotencyKey: uuid(),
    });
    expect(draft.status).toBe(200);

    const before = await rawRows(eventId);
    expect(before.state.revision).toBe(2);
    const ledgerBefore = before.ledger;

    const key = uuid();
    const failed = await call('POST', `/v1/events/${eventId}/publish`, {
      token: owner,
      body: { expectedRevision: 2 },
      idempotencyKey: key,
    });
    expect(failed.status).toBe(422);
    expect(await errorCode(failed)).toBe('VALIDATION_FAILED');

    const after = await rawRows(eventId);
    // State untouched.
    expect(after.state.revision).toBe(2);
    // No published pointer.
    expect(after.state.published_revision).toBeNull();
    // No revision row appended.
    expect(after.revisions.map((r) => r.action)).toEqual(['create', 'draft']);
    // And critically: NO ledger row either. A rejected command must be retryable with the
    // same key after the organizer fixes the draft.
    expect(after.ledger).toBe(ledgerBefore);

    // Proof it is retryable: fix the draft, publish with the SAME key, and it works.
    const fixed = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(2),
      idempotencyKey: uuid(),
    });
    expect(fixed.status).toBe(200);
    const retried = await call('POST', `/v1/events/${eventId}/publish`, {
      token: owner,
      body: { expectedRevision: 3 },
      idempotencyKey: key,
    });
    expect(retried.status).toBe(200);
  });

  it('refuses to publish an event with no cues, changing nothing', async () => {
    const owner = await mintToken('pub-owner-12');
    const eventId = await createEvent(owner);
    const empty = draftBody(1) as Record<string, unknown>;
    empty.cues = [];
    const draft = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: empty,
      idempotencyKey: uuid(),
    });
    // A blank event may have zero cues while editing.
    expect(draft.status).toBe(200);

    const res = await call('POST', `/v1/events/${eventId}/publish`, {
      token: owner,
      body: { expectedRevision: 2 },
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(422);
    const rows = await rawRows(eventId);
    expect(rows.state.revision).toBe(2);
    expect(rows.state.published_revision).toBeNull();
  });

  it('writes state, the revision row and the pointer together or not at all', async () => {
    const owner = await mintToken('pub-owner-13');
    const { eventId } = await createPublishedEvent(owner);
    const rows = await rawRows(eventId);
    // The publish revision exists in `revisions` AND is the pointer AND is the state
    // revision. These three cannot disagree, because one transaction wrote them.
    const publishRevision = rows.revisions.find((r) => r.action === 'publish')?.revision;
    expect(publishRevision).toBe(rows.state.revision);
    expect(publishRevision).toBe(rows.state.published_revision);
  });
});

describe('immutability', () => {
  it('keeps revisions append-only and never rewrites an earlier snapshot', async () => {
    const owner = await mintToken('pub-owner-14');
    const eventId = await createEvent(owner);

    const r1 = await call('GET', `/v1/events/${eventId}/revisions/1`, { token: owner });
    const snapshot1 = await json<{ state: Record<string, unknown> }>(r1);

    await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(1),
      idempotencyKey: uuid(),
    });
    await call('POST', `/v1/events/${eventId}/publish`, {
      token: owner,
      body: { expectedRevision: 2 },
      idempotencyKey: uuid(),
    });

    // Revision 1 reads back byte-identical after two later revisions.
    const r1Again = await call('GET', `/v1/events/${eventId}/revisions/1`, { token: owner });
    expect(await json<{ state: Record<string, unknown> }>(r1Again)).toEqual(snapshot1);

    const list = await call('GET', `/v1/events/${eventId}/revisions`, { token: owner });
    const items = await json<{ items: Array<{ revision: number; action: string }> }>(list);
    expect(items.items.map((i) => i.revision)).toEqual([3, 2, 1]);
    expect(items.items.map((i) => i.action)).toEqual(['publish', 'draft', 'create']);
  });

  it('refuses a second publish rather than editing the published snapshot', async () => {
    const owner = await mintToken('pub-owner-15');
    const { eventId, revision } = await createPublishedEvent(owner);
    const res = await call('POST', `/v1/events/${eventId}/publish`, {
      token: owner,
      body: { expectedRevision: revision },
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('WRONG_PHASE');
  });

  it('makes direct agenda edits draft-only once running', async () => {
    const owner = await mintToken('pub-owner-16');
    const { eventId, revision } = await createPublishedEvent(owner);
    const res = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(revision),
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('WRONG_PHASE');
  });

  it('caps the revision page at 50', async () => {
    const owner = await mintToken('pub-owner-17');
    const eventId = await createEvent(owner);
    const res = await call('GET', `/v1/events/${eventId}/revisions?limit=500`, { token: owner });
    expect(res.status).toBe(200);
    const body = await json<{ items: unknown[] }>(res);
    expect(body.items.length).toBeLessThanOrEqual(50);
  });
});

describe('deletion and expiry', () => {
  it('deletes the event and denies access immediately afterwards', async () => {
    const owner = await mintToken('pub-owner-18');
    const { eventId, revision } = await createPublishedEvent(owner);

    const del = await call('DELETE', `/v1/events/${eventId}`, {
      token: owner,
      body: { expectedRevision: revision },
      idempotencyKey: uuid(),
    });
    expect(del.status).toBe(204);

    const read = await call('GET', `/v1/events/${eventId}`, { token: owner });
    expect(read.status).toBe(404);
    const published = await call('GET', `/v1/events/${eventId}/published`, { token: owner });
    expect(published.status).toBe(404);

    // A non-personal tombstone remains; content and membership are gone.
    const rows = await rawRows(eventId);
    expect(rows.state.deleted_at).not.toBeNull();
    expect(rows.revisions).toEqual([]);
  });

  it('rejects a delete with a stale expectedRevision', async () => {
    const owner = await mintToken('pub-owner-19');
    const { eventId } = await createPublishedEvent(owner);
    const res = await call('DELETE', `/v1/events/${eventId}`, {
      token: owner,
      body: { expectedRevision: 1 },
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('REVISION_CONFLICT');
    const read = await call('GET', `/v1/events/${eventId}`, { token: owner });
    expect(read.status).toBe(200);
  });

  it('cleans up on the expiry alarm, idempotently', async () => {
    const owner = await mintToken('pub-owner-20');
    const { eventId } = await createPublishedEvent(owner);
    const stub = roomFor(eventId);

    // Backdate expiry rather than waiting 72 hours. The clock is not under test; the
    // cleanup is.
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ state_json: string }>('SELECT state_json FROM event_state WHERE singleton = 1')
        .toArray()[0] as { state_json: string };
      const parsed = JSON.parse(row.state_json) as { expiresAt: string };
      parsed.expiresAt = '2020-01-01T00:00:00Z';
      state.storage.sql.exec(
        'UPDATE event_state SET state_json = ? WHERE singleton = 1',
        JSON.stringify(parsed),
      );
      state.storage.setAlarm(Date.now() + 1000);
    });

    expect(await runDurableObjectAlarm(stub)).toBe(true);

    const afterFirst = await rawRows(eventId);
    expect(afterFirst.state.deleted_at).not.toBeNull();
    expect(afterFirst.revisions).toEqual([]);

    // Alarms may repeat: a second run must not throw or change anything further.
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.setAlarm(Date.now() + 1000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const afterSecond = await rawRows(eventId);
    expect(afterSecond.state.deleted_at).toBe(afterFirst.state.deleted_at);
  });

  it('checks expiry at request entry, not only on the alarm', async () => {
    const owner = await mintToken('pub-owner-21');
    const { eventId } = await createPublishedEvent(owner);

    // Backdate expiry and DO NOT run the alarm — a delayed alarm must not extend access.
    await runInDurableObject(roomFor(eventId), (_instance, state) => {
      const row = state.storage.sql
        .exec<{ state_json: string }>('SELECT state_json FROM event_state WHERE singleton = 1')
        .toArray()[0] as { state_json: string };
      const parsed = JSON.parse(row.state_json) as { expiresAt: string };
      parsed.expiresAt = '2020-01-01T00:00:00Z';
      state.storage.sql.exec(
        'UPDATE event_state SET state_json = ? WHERE singleton = 1',
        JSON.stringify(parsed),
      );
    });

    const read = await call('GET', `/v1/events/${eventId}`, { token: owner });
    expect(read.status).toBe(404);
  });
});

describe('quota admission', () => {
  it('caps new events per uid per day', async () => {
    const owner = await mintToken(`quota-uid-${crypto.randomUUID()}`);
    // Default is 2 new events per UID per UTC day.
    expect((await call('PUT', `/v1/events/${crypto.randomUUID()}`, { token: owner, body: { name: 'A', startsAt: '2026-09-19T04:30:00Z', hardEndMin: 60, mode: 'rehearsal', seed: 'blank' }, idempotencyKey: uuid() })).status).toBe(201);
    expect((await call('PUT', `/v1/events/${crypto.randomUUID()}`, { token: owner, body: { name: 'B', startsAt: '2026-09-19T04:30:00Z', hardEndMin: 60, mode: 'rehearsal', seed: 'blank' }, idempotencyKey: uuid() })).status).toBe(201);
    const third = await call('PUT', `/v1/events/${crypto.randomUUID()}`, {
      token: owner,
      body: { name: 'C', startsAt: '2026-09-19T04:30:00Z', hardEndMin: 60, mode: 'rehearsal', seed: 'blank' },
      idempotencyKey: uuid(),
    });
    expect(third.status).toBe(429);
    expect(await errorCode(third)).toBe('DEMO_CAPACITY');
  });
});
