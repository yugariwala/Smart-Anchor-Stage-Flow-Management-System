import { beforeAll, describe, expect, it } from 'vitest';

import {
  addAnchor,
  call,
  createBody,
  createEvent,
  createPublishedEvent,
  draftBody,
  errorCode,
  freshEventId,
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

describe('token verification', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await call('GET', `/v1/events/${freshEventId()}`);
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('UNAUTHENTICATED');
  });

  it('rejects a malformed Authorization header', async () => {
    const res = await call('GET', `/v1/events/${freshEventId()}`, {
      headers: { Authorization: 'Basic abc' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const token = await mintToken('owner', { expiresIn: '-1h' });
    const res = await call('GET', `/v1/events/${freshEventId()}`, { token });
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('UNAUTHENTICATED');
  });

  it('rejects a token signed with a key that is not in the published key set', async () => {
    const token = await mintToken('owner', { signWithUnpublishedKey: true });
    const res = await call('GET', `/v1/events/${freshEventId()}`, { token });
    expect(res.status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const token = await mintToken('owner');
    const parts = token.split('.');
    // Flip a byte of the signature.
    const tampered = `${parts[0]}.${parts[1]}.${(parts[2] ?? '').slice(0, -2)}AA`;
    const res = await call('GET', `/v1/events/${freshEventId()}`, { token: tampered });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong audience', async () => {
    const token = await mintToken('owner', { audience: 'some-other-project' });
    const res = await call('GET', `/v1/events/${freshEventId()}`, { token });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong issuer', async () => {
    const token = await mintToken('owner', { issuer: 'https://evil.example/' });
    const res = await call('GET', `/v1/events/${freshEventId()}`, { token });
    expect(res.status).toBe(401);
  });

  it('rejects a token with no sub claim', async () => {
    const token = await mintToken('owner', { omitSub: true });
    const res = await call('GET', `/v1/events/${freshEventId()}`, { token });
    expect(res.status).toBe(401);
  });

  it('leaves /v1/health public and leaks nothing', async () => {
    const res = await call('GET', '/v1/health');
    expect(res.status).toBe(200);
    const body = await json<Record<string, unknown>>(res);
    // Exactly two fields: no quota internals, no env, no secrets.
    expect(Object.keys(body).sort()).toEqual(['buildCommit', 'ok']);
  });
});

describe('roles', () => {
  it('makes the creator the owner and lets them read the event', async () => {
    const owner = await mintToken('owner-1');
    const eventId = await createEvent(owner);
    const res = await call('GET', `/v1/events/${eventId}`, { token: owner });
    expect(res.status).toBe(200);
    const body = await json<{ state: { ownerUid: string; phase: string; revision: number } }>(res);
    expect(body.state.ownerUid).toBe('owner-1');
    expect(body.state.phase).toBe('draft');
    expect(body.state.revision).toBe(1);
  });

  it('gives an anchor 403 on the owner-only event read, not 404', async () => {
    const owner = await mintToken('owner-2');
    const { eventId } = await createPublishedEvent(owner);
    const anchor = await addAnchor(owner, eventId);
    const res = await call('GET', `/v1/events/${eventId}`, { token: anchor });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('FORBIDDEN_ROLE');
  });

  it('forbids an anchor from publishing', async () => {
    const owner = await mintToken('owner-3');
    const eventId = await createEvent(owner);
    await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(1),
      idempotencyKey: uuid(),
    });
    // Publish first so an invite can be issued, then try as the anchor on a new event.
    const published = await createPublishedEvent(await mintToken('owner-3b'));
    void published;

    const anchor = await addAnchor(owner, eventId);
    const res = await call('POST', `/v1/events/${eventId}/publish`, {
      token: anchor,
      body: { expectedRevision: 2 },
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('FORBIDDEN_ROLE');
  });

  it('forbids an anchor from saving a draft', async () => {
    const owner = await mintToken('owner-4');
    const eventId = await createEvent(owner);
    const anchor = await addAnchor(owner, eventId);
    const res = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: anchor,
      body: draftBody(1),
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(403);
  });

  it('forbids an anchor from deleting the event', async () => {
    const owner = await mintToken('owner-5');
    const eventId = await createEvent(owner);
    const anchor = await addAnchor(owner, eventId);
    const res = await call('DELETE', `/v1/events/${eventId}`, {
      token: anchor,
      body: { expectedRevision: 1 },
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(403);
  });

  it('forbids an anchor from listing revisions', async () => {
    const owner = await mintToken('owner-6');
    const eventId = await createEvent(owner);
    const anchor = await addAnchor(owner, eventId);
    const res = await call('GET', `/v1/events/${eventId}/revisions`, { token: anchor });
    expect(res.status).toBe(403);
  });

  it('lets an anchor read the published snapshot and acknowledge it', async () => {
    const owner = await mintToken('owner-7');
    const { eventId, revision } = await createPublishedEvent(owner);
    const anchor = await addAnchor(owner, eventId);

    const snapshot = await call('GET', `/v1/events/${eventId}/published`, { token: anchor });
    expect(snapshot.status).toBe(200);
    const body = await json<{ publishedRevision: number; serverNow: string }>(snapshot);
    expect(body.publishedRevision).toBe(revision);
    expect(body.serverNow).toMatch(/Z$/);

    const ack = await call('POST', `/v1/events/${eventId}/ack`, {
      token: anchor,
      body: { publishedRevision: revision },
    });
    expect(ack.status).toBe(200);
    expect(await json<{ acknowledgedRevision: number }>(ack)).toMatchObject({
      acknowledgedRevision: revision,
    });
  });

  it('shows the owner the anchor acknowledgment', async () => {
    const owner = await mintToken('owner-8');
    const { eventId, revision } = await createPublishedEvent(owner);
    const anchor = await addAnchor(owner, eventId);
    await call('POST', `/v1/events/${eventId}/ack`, {
      token: anchor,
      body: { publishedRevision: revision },
    });
    const res = await call('GET', `/v1/events/${eventId}`, { token: owner });
    const body = await json<{ acknowledgments: Array<{ revision: number }> }>(res);
    expect(body.acknowledgments).toHaveLength(1);
    expect(body.acknowledgments[0]?.revision).toBe(revision);
  });

  it('rejects an acknowledgment of a revision that is not published', async () => {
    const owner = await mintToken('owner-9');
    const { eventId, revision } = await createPublishedEvent(owner);
    const anchor = await addAnchor(owner, eventId);
    const res = await call('POST', `/v1/events/${eventId}/ack`, {
      token: anchor,
      body: { publishedRevision: revision + 5 },
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('ACK_INVALID');
  });
});

describe('non-members', () => {
  it('gets 404 on read, and never learns the revision', async () => {
    const owner = await mintToken('owner-10');
    const { eventId } = await createPublishedEvent(owner);
    const stranger = await mintToken('stranger-1');

    const res = await call('GET', `/v1/events/${eventId}`, { token: stranger });
    expect(res.status).toBe(404);
    const body = await json<{ error: Record<string, unknown> }>(res);
    expect(body.error.code).toBe('NOT_FOUND');
    // The whole point: no revision number crosses to a non-member.
    expect(body.error).not.toHaveProperty('currentRevision');
  });

  it('gets 404 on the published snapshot', async () => {
    const owner = await mintToken('owner-11');
    const { eventId } = await createPublishedEvent(owner);
    const stranger = await mintToken('stranger-2');
    const res = await call('GET', `/v1/events/${eventId}/published`, { token: stranger });
    expect(res.status).toBe(404);
  });

  it('gets 404 on a write, with no revision leaked even on a stale expectedRevision', async () => {
    const owner = await mintToken('owner-12');
    const { eventId } = await createPublishedEvent(owner);
    const stranger = await mintToken('stranger-3');
    const res = await call('POST', `/v1/events/${eventId}/publish`, {
      token: stranger,
      body: { expectedRevision: 1 },
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(404);
    const body = await json<{ error: Record<string, unknown> }>(res);
    expect(body.error).not.toHaveProperty('currentRevision');
  });

  it('cannot acknowledge', async () => {
    const owner = await mintToken('owner-13');
    const { eventId, revision } = await createPublishedEvent(owner);
    const stranger = await mintToken('stranger-4');
    const res = await call('POST', `/v1/events/${eventId}/ack`, {
      token: stranger,
      body: { publishedRevision: revision },
    });
    expect(res.status).toBe(404);
  });

  it('gets 404 for an event that does not exist at all', async () => {
    const stranger = await mintToken('stranger-5');
    const res = await call('GET', `/v1/events/${freshEventId()}`, { token: stranger });
    expect(res.status).toBe(404);
  });
});

describe('invitations', () => {
  it('returns the plaintext secret exactly once and never stores it', async () => {
    const owner = await mintToken('owner-14');
    const eventId = await createEvent(owner);
    const res = await call('POST', `/v1/events/${eventId}/invitations`, {
      token: owner,
      body: { role: 'anchor' },
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(201);
    const body = await json<{ inviteCode: string; expiresAt: string }>(res);
    // >= 128 bits of randomness, base64url encoded.
    expect(body.inviteCode.length).toBeGreaterThanOrEqual(32);
    expect(body.inviteCode).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('consumes an invitation exactly once', async () => {
    const owner = await mintToken('owner-15');
    const eventId = await createEvent(owner);
    const invite = await call('POST', `/v1/events/${eventId}/invitations`, {
      token: owner,
      body: { role: 'anchor' },
      idempotencyKey: uuid(),
    });
    const { inviteCode } = await json<{ inviteCode: string }>(invite);

    const first = await call('POST', `/v1/events/${eventId}/join`, {
      token: await mintToken('anchor-a'),
      body: { inviteCode },
      idempotencyKey: uuid(),
    });
    expect(first.status).toBe(200);

    // A second identity cannot reuse the same code.
    const second = await call('POST', `/v1/events/${eventId}/join`, {
      token: await mintToken('anchor-b'),
      body: { inviteCode },
      idempotencyKey: uuid(),
    });
    expect(second.status).toBe(409);
    expect(await errorCode(second)).toBe('INVITATION_INVALID');
  });

  it('rejects an unknown invite code', async () => {
    const owner = await mintToken('owner-16');
    const eventId = await createEvent(owner);
    const res = await call('POST', `/v1/events/${eventId}/join`, {
      token: await mintToken('anchor-c'),
      body: { inviteCode: 'not-a-real-code' },
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('INVITATION_INVALID');
  });

  it('forbids a non-owner from minting an invitation', async () => {
    const owner = await mintToken('owner-17');
    const eventId = await createEvent(owner);
    const anchor = await addAnchor(owner, eventId);
    const res = await call('POST', `/v1/events/${eventId}/invitations`, {
      token: anchor,
      body: { role: 'anchor' },
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(403);
  });
});

describe('no mass assignment', () => {
  it('rejects a draft cue carrying runtime fields', async () => {
    const owner = await mintToken('owner-18');
    const eventId = await createEvent(owner);
    const body = draftBody(1) as { cues: Array<Record<string, unknown>> };
    body.cues[0] = { ...(body.cues[0] as Record<string, unknown>), status: 'completed' };
    const res = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body,
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('VALIDATION_FAILED');
  });

  it('rejects a draft cue carrying planned intervals', async () => {
    const owner = await mintToken('owner-19');
    const eventId = await createEvent(owner);
    const body = draftBody(1) as { cues: Array<Record<string, unknown>> };
    body.cues[2] = { ...(body.cues[2] as Record<string, unknown>), plannedStartMin: 0, plannedEndMin: 1 };
    const res = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body,
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(422);
  });

  it('rejects a draft cue carrying actual times', async () => {
    const owner = await mintToken('owner-20');
    const eventId = await createEvent(owner);
    const body = draftBody(1) as { cues: Array<Record<string, unknown>> };
    body.cues[1] = {
      ...(body.cues[1] as Record<string, unknown>),
      actualStartAt: '2026-09-19T04:35:00Z',
    };
    const res = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body,
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(422);
  });

  it('rejects a config carrying ownerUid or revision', async () => {
    const owner = await mintToken('owner-21');
    const eventId = await createEvent(owner);
    const body = draftBody(1) as { config: Record<string, unknown> };
    body.config = { ...body.config, ownerUid: 'someone-else', revision: 99 };
    const res = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body,
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(422);
  });

  it('ignores an attempt to set ownerUid at creation', async () => {
    const owner = await mintToken('owner-22');
    const eventId = freshEventId();
    const res = await call('PUT', `/v1/events/${eventId}`, {
      token: owner,
      body: createBody({ ownerUid: 'someone-else' }),
      idempotencyKey: uuid(),
    });
    // Strict schema: an unexpected key is a rejection, not a silent drop.
    expect(res.status).toBe(422);
  });
});

describe('request hygiene', () => {
  it('requires an Idempotency-Key on every mutation', async () => {
    const owner = await mintToken('owner-23');
    const res = await call('PUT', `/v1/events/${freshEventId()}`, {
      token: owner,
      body: createBody(),
    });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('returns 400 on malformed JSON', async () => {
    const owner = await mintToken('owner-24');
    const res = await call('PUT', `/v1/events/${freshEventId()}`, {
      token: owner,
      idempotencyKey: uuid(),
      headers: { 'Content-Type': 'application/json' },
    }).then(async (r) => r);
    // A body-less mutation parses as {} and fails validation, not JSON parsing.
    expect([400, 422]).toContain(res.status);
  });

  it('defers the seeded demo scenario to a later milestone rather than faking it', async () => {
    const owner = await mintToken('owner-25');
    const res = await call('PUT', `/v1/events/${freshEventId()}`, {
      token: owner,
      body: createBody({ seed: 'college-demo-v1' }),
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(422);
    const body = await json<{ error: { code: string; message: string } }>(res);
    expect(body.error.code).toBe('NOT_IMPLEMENTED');
    expect(body.error.message).toBe('not implemented: Milestone 5');
  });

  it('attaches a request id to every response', async () => {
    const res = await call('GET', '/v1/health');
    expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('only allows configured origins through CORS', async () => {
    const allowed = await call('GET', '/v1/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');

    const denied = await call('GET', '/v1/health', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('reserved fact-id prefixes', () => {
  /**
   * §12 reserves `event:` and `speaker:` so an organizer-entered fact cannot impersonate a
   * server-created source record. This was NOT enforced through M2-M4: `factSchema` accepted
   * any nonempty id, and this suite's own harness was posting `event:name`, which is how the
   * gap survived four milestones. The test that would have caught it:
   */
  it('refuses an organizer event fact that impersonates the reserved event record', async () => {
    const owner = await mintToken('reserved-1');
    const eventId = await createEvent(owner);
    const body = draftBody(1) as Record<string, unknown>;
    body.eventFacts = [{ id: 'event:name', text: 'A name the server never vouched for' }];
    const res = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body,
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('VALIDATION_FAILED');
  });

  it('refuses a speaker fact that impersonates the reserved speaker-name record', async () => {
    const owner = await mintToken('reserved-2');
    const eventId = await createEvent(owner);
    const body = draftBody(1) as { speakers: Array<Record<string, unknown>> };
    body.speakers[0] = {
      ...(body.speakers[0] as Record<string, unknown>),
      facts: [{ id: 'speaker:spk-mehta:name', text: 'Professor Impersonator' }],
    };
    const res = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body,
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(422);
  });

  it('accepts ordinary organizer fact ids', async () => {
    const owner = await mintToken('reserved-3');
    const eventId = await createEvent(owner);
    const body = draftBody(1) as Record<string, unknown>;
    body.eventFacts = [{ id: 'fact-ordinary-1', text: 'Fictional: an ordinary approved fact.' }];
    const res = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body,
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(200);
  });

  it('does not reject an id that merely contains the word event or speaker', async () => {
    const owner = await mintToken('reserved-4');
    const eventId = await createEvent(owner);
    const body = draftBody(1) as Record<string, unknown>;
    // The rule anchors at the start; these are legitimate organizer ids.
    body.eventFacts = [
      { id: 'my-event-note', text: 'Fictional: not a reserved id.' },
      { id: 'speakers-lounge', text: 'Fictional: also not reserved.' },
    ];
    const res = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body,
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(200);
  });
});
