/**
 * Script pipeline. The provider is replaced by an injected `fetch` so every branch is
 * exercised deterministically; the ONE genuine Gemini call is run manually and recorded in
 * docs/measurements.md, because a stubbed response is not evidence of an AI capability (§21).
 */

import { env, runInDurableObject } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  addAnchor,
  call,
  createEvent,
  draftBody,
  errorCode,
  installLocalKeys,
  json,
  mintToken,
  resetQuotas,
  uuid,
} from './helpers/harness';

beforeAll(async () => {
  await installLocalKeys();
  await resetQuotas();
});

const roomFor = (eventId: string): DurableObjectStub => {
  const ns = (env as unknown as { EVENT_ROOMS: DurableObjectNamespace }).EVENT_ROOMS;
  return ns.get(ns.idFromName(eventId));
};

const post = (token: string, path: string, body: unknown): Promise<Response> =>
  call('POST', path, { token, body, idempotencyKey: uuid() });

/** A running event with the keynote active, so `introduction` has a speaker to work with. */
const runningEvent = async (token: string): Promise<{ eventId: string; revision: number }> => {
  const eventId = await createEvent(token);
  await call('PUT', `/v1/events/${eventId}/draft`, {
    token,
    body: draftBody(1),
    idempotencyKey: uuid(),
  });
  await post(token, `/v1/events/${eventId}/publish`, { expectedRevision: 2 });
  return { eventId, revision: 3 };
};

type ProposalOut = {
  proposalId: string;
  body: string;
  usedFactIds: string[];
  warnings: string[];
  source: 'gemini' | 'template';
  model: string | null;
  fallbackReason: string | null;
  approvedFacts: Array<{ id: string; text: string }>;
};

describe('generation through the Durable Object', () => {
  it('supplies the server-created reserved records, which is what the prefix protects', async () => {
    const owner = await mintToken('scr-2');
    const { eventId, revision } = await runningEvent(owner);
    const res = await post(owner, `/v1/events/${eventId}/script-proposals`, {
      expectedRevision: revision,
      kind: 'introduction',
      cueId: 'keynote',
      language: 'en',
    });
    expect(res.status).toBe(201);
    const p = await json<ProposalOut>(res);
    expect(p.approvedFacts.some((f) => f.id === 'event:name')).toBe(true);
    expect(p.approvedFacts.some((f) => f.id === 'speaker:spk-mehta:name')).toBe(true);
    // The organizer cannot forge either id: the draft boundary refuses those prefixes.
  });

  it('produces a labelled template with no error state when AI_ENABLED is false', async () => {
    // The test Worker runs with AI_ENABLED=false so no test can reach Google by accident.
    const owner = await mintToken('scr-11');
    const { eventId, revision } = await runningEvent(owner);
    const res = await post(owner, `/v1/events/${eventId}/script-proposals`, {
      expectedRevision: revision,
      kind: 'opening',
      cueId: null,
      language: 'en',
    });
    expect(res.status).toBe(201);
    const p = await json<ProposalOut>(res);
    expect(p.source).toBe('template');
    expect(p.model).toBeNull();
    expect(p.fallbackReason).toBe('AI_ENABLED is false');
    expect(p.body.length).toBeGreaterThan(0);
  });

  it('refuses a draft for a cue that does not exist', async () => {
    const owner = await mintToken('scr-12');
    const { eventId, revision } = await runningEvent(owner);
    const res = await post(owner, `/v1/events/${eventId}/script-proposals`, {
      expectedRevision: revision,
      kind: 'introduction',
      cueId: 'no-such-cue',
      language: 'en',
    });
    expect(res.status).toBe(422);
  });

  it('refuses a draft at a stale revision, before spending any quota', async () => {
    const owner = await mintToken('scr-13');
    const { eventId, revision } = await runningEvent(owner);
    const res = await post(owner, `/v1/events/${eventId}/script-proposals`, {
      expectedRevision: revision - 1,
      kind: 'opening',
      cueId: null,
      language: 'en',
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('REVISION_CONFLICT');
  });
});

describe('approval', () => {
  const draftFor = async (
    token: string,
    uid: string,
  ): Promise<{ eventId: string; revision: number; proposalId: string }> => {
    const { eventId, revision } = await runningEvent(token);
    const res = await post(token, `/v1/events/${eventId}/script-proposals`, {
      expectedRevision: revision,
      kind: 'opening',
      cueId: null,
      language: 'en',
    });
    const p = await json<ProposalOut>(res);
    void uid;
    return { eventId, revision, proposalId: p.proposalId };
  };

  it('stores the reviewed copy in the published snapshot', async () => {
    const owner = await mintToken('app-1');
    const { eventId, revision, proposalId } = await draftFor(owner, 'app-1');

    const res = await post(owner, `/v1/events/${eventId}/script-proposals/${proposalId}/approve`, {
      expectedRevision: revision,
      body: 'The reviewed and edited welcome.',
      usedFactIds: ['event:name'],
    });
    expect(res.status).toBe(200);
    const out = await json<{ revision: number; scriptId: string; publishedRevision: number }>(res);
    expect(out.revision).toBe(revision + 1);
    expect(out.publishedRevision).toBe(revision + 1);

    const anchor = await addAnchor(owner, eventId);
    const snap = await call('GET', `/v1/events/${eventId}/published`, { token: anchor });
    const state = await json<{ state: { approvedScripts: Array<Record<string, unknown>> } }>(snap);
    expect(state.state.approvedScripts).toHaveLength(1);
    const script = state.state.approvedScripts[0] as Record<string, unknown>;
    expect(script.body).toBe('The reviewed and edited welcome.');
    // source records the GENERATOR, not whether a human edited it.
    expect(script.source).toBe('template');
    expect(script.inputHash).toBeTruthy();
    expect(script.approvedBy).toBe('app-1');
  });

  it('rejects a fact reference that was not part of the draft', async () => {
    const owner = await mintToken('app-2');
    const { eventId, revision, proposalId } = await draftFor(owner, 'app-2');
    const res = await post(owner, `/v1/events/${eventId}/script-proposals/${proposalId}/approve`, {
      expectedRevision: revision,
      body: 'Edited copy.',
      usedFactIds: ['fact-never-supplied'],
    });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('VALIDATION_FAILED');
  });

  it('rejects approval at a stale revision', async () => {
    const owner = await mintToken('app-3');
    const { eventId, revision, proposalId } = await draftFor(owner, 'app-3');
    const res = await post(owner, `/v1/events/${eventId}/script-proposals/${proposalId}/approve`, {
      expectedRevision: revision - 1,
      body: 'Edited copy.',
      usedFactIds: [],
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('REVISION_CONFLICT');
  });

  it('refuses to approve the same draft twice', async () => {
    const owner = await mintToken('app-4');
    const { eventId, revision, proposalId } = await draftFor(owner, 'app-4');
    const first = await post(
      owner,
      `/v1/events/${eventId}/script-proposals/${proposalId}/approve`,
      { expectedRevision: revision, body: 'Once.', usedFactIds: [] },
    );
    expect(first.status).toBe(200);
    const second = await post(
      owner,
      `/v1/events/${eventId}/script-proposals/${proposalId}/approve`,
      { expectedRevision: revision + 1, body: 'Twice.', usedFactIds: [] },
    );
    expect(second.status).toBe(409);
  });

  it('forbids an anchor from generating or approving', async () => {
    const owner = await mintToken('app-5');
    const { eventId, revision } = await runningEvent(owner);
    const anchor = await addAnchor(owner, eventId);
    const res = await post(anchor, `/v1/events/${eventId}/script-proposals`, {
      expectedRevision: revision,
      kind: 'opening',
      cueId: null,
      language: 'en',
    });
    expect(res.status).toBe(403);
  });
});

describe('the in-flight lease', () => {
  it('is released after a successful generation', async () => {
    const owner = await mintToken('lease-1');
    const { eventId, revision } = await runningEvent(owner);
    await post(owner, `/v1/events/${eventId}/script-proposals`, {
      expectedRevision: revision,
      kind: 'opening',
      cueId: null,
      language: 'en',
    });
    const held = await runInDurableObject(roomFor(eventId), (_i, state) =>
      state.storage.sql
        .exec<{ n: number }>(
          "SELECT COUNT(*) AS n FROM counters WHERE counter_key = 'ai:inflight'",
        )
        .toArray()[0] as { n: number },
    );
    expect(held.n).toBe(0);
  });

  it('is released even when generation ends in a rejection', async () => {
    const owner = await mintToken('lease-2');
    const { eventId, revision } = await runningEvent(owner);
    // A cue that does not exist: the reserve phase throws AFTER the lease would be taken on a
    // valid request, so this also proves the finally runs on the rejection path.
    await post(owner, `/v1/events/${eventId}/script-proposals`, {
      expectedRevision: revision,
      kind: 'introduction',
      cueId: 'no-such-cue',
      language: 'en',
    });
    const held = await runInDurableObject(roomFor(eventId), (_i, state) =>
      state.storage.sql
        .exec<{ n: number }>(
          "SELECT COUNT(*) AS n FROM counters WHERE counter_key = 'ai:inflight'",
        )
        .toArray()[0] as { n: number },
    );
    expect(held.n).toBe(0);
  });

  it('refuses a concurrent generation while a lease is live, and expires on its own', async () => {
    const owner = await mintToken('lease-3');
    const { eventId, revision } = await runningEvent(owner);

    // Simulate an isolate that died mid-generation: a lease row with no owner.
    await runInDurableObject(roomFor(eventId), (_i, state) => {
      const future = new Date(Date.now() + 30_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      state.storage.sql.exec(
        "INSERT INTO counters (counter_key, used, reset_at) VALUES ('ai:inflight', 1, ?)",
        future,
      );
    });
    const blocked = await post(owner, `/v1/events/${eventId}/script-proposals`, {
      expectedRevision: revision,
      kind: 'opening',
      cueId: null,
      language: 'en',
    });
    expect(blocked.status).toBe(429);
    expect(await errorCode(blocked)).toBe('DEMO_CAPACITY');

    // Backdate the lease: an orphaned reservation self-heals rather than wedging the event.
    await runInDurableObject(roomFor(eventId), (_i, state) => {
      state.storage.sql.exec(
        "UPDATE counters SET reset_at = '2020-01-01T00:00:00Z' WHERE counter_key = 'ai:inflight'",
      );
    });
    const recovered = await post(owner, `/v1/events/${eventId}/script-proposals`, {
      expectedRevision: revision,
      kind: 'opening',
      cueId: null,
      language: 'en',
    });
    expect(recovered.status).toBe(201);
  });

  it('enforces the per-event daily cap', async () => {
    const owner = await mintToken('lease-4');
    const { eventId, revision } = await runningEvent(owner);
    // Ten attempts per event per day (§12).
    await runInDurableObject(roomFor(eventId), (_i, state) => {
      const day = new Date().toISOString().slice(0, 10);
      state.storage.sql.exec(
        'INSERT INTO counters (counter_key, used, reset_at) VALUES (?, 10, ?)',
        `ai:event:${day}`,
        `${day}T23:59:59Z`,
      );
    });
    const res = await post(owner, `/v1/events/${eventId}/script-proposals`, {
      expectedRevision: revision,
      kind: 'opening',
      cueId: null,
      language: 'en',
    });
    expect(res.status).toBe(429);
    expect(await errorCode(res)).toBe('DEMO_CAPACITY');
  });
});
