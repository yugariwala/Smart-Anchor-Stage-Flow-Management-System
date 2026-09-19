/**
 * The `college-demo-v1` seed (§8 MUST: "One click creates a personal labeled scenario").
 *
 * Two properties are pinned here:
 *  1. Creation seeds a DRAFT with the committed fixture's speakers, facts and cues, with the
 *     server-computed intervals — and refuses a configuration the scenario cannot satisfy.
 *  2. Driving that draft with the ordinary publish/start/clock/complete commands reproduces
 *     `fixtures/college-demo-v1.json` exactly at revision 7. The fixture is not a bypass; it
 *     is a destination reached through the same commands a person clicks.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import fixtureJson from '../../fixtures/college-demo-v1.json';
import {
  call,
  createBody,
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

const seededBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> =>
  createBody({
    name: fixtureJson.name,
    startsAt: fixtureJson.startsAt,
    hardEndMin: fixtureJson.hardEndMin,
    mode: 'rehearsal',
    seed: 'college-demo-v1',
    ...overrides,
  });

const createSeeded = async (
  token: string,
  body: Record<string, unknown> = seededBody(),
): Promise<{ eventId: string; state: Record<string, unknown> }> => {
  const eventId = freshEventId();
  const res = await call('PUT', `/v1/events/${eventId}`, {
    token,
    body,
    idempotencyKey: uuid(),
  });
  if (res.status !== 201) throw new Error(`seeded create failed: ${res.status} ${await res.text()}`);
  const out = await json<{ state: Record<string, unknown> }>(res);
  return { eventId, state: out.state };
};

describe('seeded rehearsal creation', () => {
  it('seeds a draft with the fixture speakers, marker fact and server-computed intervals', async () => {
    const owner = await mintToken('seed-owner-1');
    const { state } = await createSeeded(owner);

    expect(state.phase).toBe('draft');
    expect(state.mode).toBe('rehearsal');
    expect(state.revision).toBe(1);
    expect(state.name).toBe(fixtureJson.name);
    expect(state.startsAt).toBe(fixtureJson.startsAt);
    expect(state.hardEndMin).toBe(60);

    expect((state.speakers as Array<{ id: string }>).map((s) => s.id)).toEqual([
      'spk-mehta',
      'spk-rao',
      'spk-fernandes',
    ]);
    // Server-owned provenance for the labeled demo action; a draft request cannot set it.
    expect(state.demoSeed).toBe('college-demo-v1');
    expect(state.eventFacts).toEqual(fixtureJson.eventFacts);

    const cues = state.cues as Array<Record<string, unknown>>;
    expect(cues.map((c) => [c.id, c.plannedStartMin, c.plannedEndMin])).toEqual([
      ['opening', 0, 5],
      ['keynote', 5, 25],
      ['qa', 25, 35],
      ['community', 35, 45],
      ['sponsor', 45, 55],
      ['closing', 55, 60],
    ]);
    // Draft seeding never writes runtime state.
    expect(cues.every((c) => c.status === 'pending' && c.actualStartAt === null)).toBe(true);
    expect(state.currentCueId).toBeNull();
    expect(state.activeForecastEndMin).toBeNull();
  });

  it('reaches the committed fixture state through the normal stage commands', async () => {
    const owner = await mintToken('seed-owner-2');
    const { eventId } = await createSeeded(owner);
    const at = (minute: number): string =>
      new Date(Date.parse(fixtureJson.startsAt) + minute * 60_000)
        .toISOString()
        .replace('.000Z', 'Z');

    const publish = await call('POST', `/v1/events/${eventId}/publish`, {
      token: owner,
      body: { expectedRevision: 1 },
      idempotencyKey: uuid(),
    });
    expect(publish.status).toBe(200);
    expect((await json<{ revision: number }>(publish)).revision).toBe(2);

    const startOpening = await call('POST', `/v1/events/${eventId}/cues/opening/start`, {
      token: owner,
      body: { expectedRevision: 2 },
      idempotencyKey: uuid(),
    });
    expect(startOpening.status).toBe(200);

    const clock1 = await call('POST', `/v1/events/${eventId}/rehearsal-clock`, {
      token: owner,
      body: { expectedRevision: 3, nowAt: at(5) },
      idempotencyKey: uuid(),
    });
    expect(clock1.status).toBe(200);

    const completeOpening = await call('POST', `/v1/events/${eventId}/cues/opening/complete`, {
      token: owner,
      body: { expectedRevision: 4 },
      idempotencyKey: uuid(),
    });
    expect(completeOpening.status).toBe(200);

    const startKeynote = await call('POST', `/v1/events/${eventId}/cues/keynote/start`, {
      token: owner,
      body: { expectedRevision: 5 },
      idempotencyKey: uuid(),
    });
    expect(startKeynote.status).toBe(200);

    const clock2 = await call('POST', `/v1/events/${eventId}/rehearsal-clock`, {
      token: owner,
      body: { expectedRevision: 6, nowAt: at(25) },
      idempotencyKey: uuid(),
    });
    expect(clock2.status).toBe(200);
    expect((await json<{ revision: number }>(clock2)).revision).toBe(7);

    const read = await call('GET', `/v1/events/${eventId}`, { token: owner });
    const { state } = await json<{ state: Record<string, unknown> }>(read);
    expect(state.revision).toBe(7);
    expect(state.phase).toBe('running');
    expect(state.currentCueId).toBe('keynote');
    expect(state.activeForecastEndMin).toBe(25);
    expect(state.scenarioNowAt).toBe(at(25));
    expect(state.scheduleHealth).toBe('valid');
    // Exactly the fixture: the seed plus normal commands IS the committed scenario.
    expect(state.cues).toEqual(fixtureJson.cues);
    expect(state.speakers).toEqual(fixtureJson.speakers);
  });

  it('refuses a scenario that cannot satisfy its own timing rules', async () => {
    const liveOwner = await mintToken('seed-owner-3');
    const live = await call('PUT', `/v1/events/${freshEventId()}`, {
      token: liveOwner,
      body: seededBody({ mode: 'live' }),
      idempotencyKey: uuid(),
    });
    expect(live.status).toBe(422);
    expect(await errorCode(live)).toBe('VALIDATION_FAILED');

    const shortOwner = await mintToken('seed-owner-4');
    const short = await call('PUT', `/v1/events/${freshEventId()}`, {
      token: shortOwner,
      body: seededBody({ hardEndMin: 30 }),
      idempotencyKey: uuid(),
    });
    expect(short.status).toBe(422);
    expect(await errorCode(short)).toBe('VALIDATION_FAILED');
  });

  it('keeps the seed provenance across a later draft edit and refuses a forged one', async () => {
    const owner = await mintToken('seed-owner-6');
    const { eventId } = await createSeeded(owner);

    // Editing the agenda must not erase the provenance, or the labeled action would vanish.
    const edit = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: {
        expectedRevision: 1,
        config: {
          name: 'Edited rehearsal name',
          startsAt: fixtureJson.startsAt,
          hardEndMin: 60,
        },
        speakers: [],
        eventFacts: [],
        cues: [
          {
            id: 'opening',
            order: 0,
            title: 'Edited opening',
            speakerId: null,
            preferredDurationMin: 5,
            minDurationMin: 5,
            compressionPenalty: 1,
            bufferBeforeMin: 0,
            notBeforeMin: null,
            fixedStartMin: null,
          },
        ],
      },
      idempotencyKey: uuid(),
    });
    expect(edit.status).toBe(200);
    expect((await json<{ state: Record<string, unknown> }>(edit)).state.demoSeed).toBe(
      'college-demo-v1',
    );

    // The field is server-owned: a draft body cannot set it.
    const forged = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: {
        expectedRevision: 2,
        config: {
          name: 'Forged',
          startsAt: fixtureJson.startsAt,
          hardEndMin: 60,
        },
        speakers: [],
        eventFacts: [],
        cues: [],
        demoSeed: 'college-demo-v1',
      },
      idempotencyKey: uuid(),
    });
    expect(forged.status).toBe(422);
    expect(await errorCode(forged)).toBe('VALIDATION_FAILED');
  });

  it('replays a same-key seeded create without seeding twice', async () => {
    const owner = await mintToken('seed-owner-5');
    const eventId = freshEventId();
    const key = uuid();
    const body = seededBody();

    const first = await call('PUT', `/v1/events/${eventId}`, { token: owner, body, idempotencyKey: key });
    const retry = await call('PUT', `/v1/events/${eventId}`, { token: owner, body, idempotencyKey: key });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(await json<Record<string, unknown>>(retry)).toEqual(await json<Record<string, unknown>>(first));
  });
});
