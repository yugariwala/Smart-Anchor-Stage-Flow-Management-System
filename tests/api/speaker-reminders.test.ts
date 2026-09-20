import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { __setVoiceFetchForTests } from '../../apps/api/src/index';
import {
  addAnchor,
  call,
  createBody,
  createPublishedEvent,
  draftBody,
  errorCode,
  freshEventId,
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

afterEach(() => __setVoiceFetchForTests(null));

const createLiveEvent = async (owner: string): Promise<{ eventId: string; revision: number }> => {
  const eventId = freshEventId();
  const created = await call('PUT', `/v1/events/${eventId}`, {
    token: owner,
    body: createBody({ mode: 'live' }),
    idempotencyKey: uuid(),
  });
  expect(created.status).toBe(201);

  const draft = draftBody(1);
  const speakers = draft.speakers as Array<Record<string, unknown>>;
  if (speakers[0]) speakers[0].phoneE164 = '+15557654321';
  const saved = await call('PUT', `/v1/events/${eventId}/draft`, {
    token: owner,
    body: draft,
    idempotencyKey: uuid(),
  });
  expect(saved.status).toBe(200);

  const published = await call('POST', `/v1/events/${eventId}/publish`, {
    token: owner,
    body: { expectedRevision: 2 },
    idempotencyKey: uuid(),
  });
  expect(published.status).toBe(200);
  return { eventId, revision: 3 };
};

describe('speaker reminder calls', () => {
  it('dials once, redacts the phone from published state, and replays safely', async () => {
    const owner = await mintToken('reminder-owner-1');
    const { eventId, revision } = await createLiveEvent(owner);
    const anchor = await addAnchor(owner, eventId);
    const provider = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ sid: 'CA00000000000000000000000000000000' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    __setVoiceFetchForTests(provider);

    const published = await call('GET', `/v1/events/${eventId}/published`, {
      token: anchor,
    });
    const snapshot = await json<{
      state: { speakers: Array<Record<string, unknown>> };
    }>(published);
    expect(snapshot.state.speakers[0]).not.toHaveProperty('phoneE164');

    const key = uuid();
    const place = () =>
      call('POST', `/v1/events/${eventId}/speakers/spk-mehta/reminder-call`, {
        token: owner,
        body: { expectedRevision: revision },
        idempotencyKey: key,
      });
    const first = await place();
    expect(first.status).toBe(201);
    expect(await json(first)).toEqual({ speakerId: 'spk-mehta', queued: true });
    expect(provider).toHaveBeenCalledOnce();

    const form = new URLSearchParams(String(provider.mock.calls[0]?.[1]?.body));
    expect(form.get('To')).toBe('+15557654321');
    expect(form.get('Twiml')).toContain('Keynote');

    const replay = await place();
    expect(replay.status).toBe(201);
    expect(await json(replay)).toEqual({
      speakerId: 'spk-mehta',
      queued: true,
    });
    expect(provider).toHaveBeenCalledOnce();
  });

  it('forbids anchors before contacting the provider', async () => {
    const owner = await mintToken('reminder-owner-2');
    const { eventId, revision } = await createLiveEvent(owner);
    const anchor = await addAnchor(owner, eventId);
    const provider = vi.fn<typeof fetch>();
    __setVoiceFetchForTests(provider);

    const response = await call('POST', `/v1/events/${eventId}/speakers/spk-mehta/reminder-call`, {
      token: anchor,
      body: { expectedRevision: revision },
      idempotencyKey: uuid(),
    });
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('FORBIDDEN_ROLE');
    expect(provider).not.toHaveBeenCalled();
  });

  it('does not place reminder calls during rehearsal', async () => {
    const owner = await mintToken('reminder-owner-3');
    const { eventId, revision } = await createPublishedEvent(owner);
    const provider = vi.fn<typeof fetch>();
    __setVoiceFetchForTests(provider);

    const response = await call('POST', `/v1/events/${eventId}/speakers/spk-mehta/reminder-call`, {
      token: owner,
      body: { expectedRevision: revision },
      idempotencyKey: uuid(),
    });
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('WRONG_PHASE');
    expect(provider).not.toHaveBeenCalled();
  });
});
