/**
 * The §5 fixture, end to end over real HTTP: publish, run the opening, start the keynote,
 * then repair.
 *
 * The rehearsal clock is interleaved deliberately. Without the clock advances, "complete
 * opening" would record a zero-minute opening and every downstream number would be wrong.
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

/** Event starts 10:00 IST = 04:30Z, so minute N is 04:30Z + N. */
const atMinute = (min: number): string =>
  new Date(Date.parse('2026-09-19T04:30:00Z') + min * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

type Rooms = { EVENT_ROOMS: DurableObjectNamespace };
const roomFor = (eventId: string): DurableObjectStub => {
  const ns = (env as unknown as Rooms).EVENT_ROOMS;
  return ns.get(ns.idFromName(eventId));
};

const rawRows = async (eventId: string) =>
  runInDurableObject(roomFor(eventId), (_i, state) => {
    const s = state.storage.sql
      .exec<{ revision: number; published_revision: number | null }>(
        'SELECT revision, published_revision FROM event_state WHERE singleton = 1',
      )
      .toArray()[0] as { revision: number; published_revision: number | null };
    const revisions = state.storage.sql
      .exec<{ revision: number; action: string }>('SELECT revision, action FROM revisions ORDER BY revision')
      .toArray();
    const proposals = state.storage.sql
      .exec<{ id: string; status: string; base_revision: number }>(
        'SELECT id, status, base_revision FROM proposals',
      )
      .toArray();
    return { state: s, revisions, proposals };
  });

type CueOut = {
  id: string;
  status: string;
  plannedStartMin: number;
  plannedEndMin: number;
  actualStartAt: string | null;
  actualEndAt: string | null;
  actualTimeSource: string | null;
};
type StateOut = {
  revision: number;
  phase: string;
  scheduleHealth: string;
  scenarioNowAt: string | null;
  currentCueId: string | null;
  activeForecastEndMin: number | null;
  cues: CueOut[];
};

const post = async (
  token: string,
  path: string,
  body: unknown,
): Promise<Response> => call('POST', path, { token, body, idempotencyKey: uuid() });

const intervals = (cues: readonly CueOut[]): Array<[string, number, number]> =>
  cues.map((c) => [c.id, c.plannedStartMin, c.plannedEndMin]);

/**
 * Drives the fixture to "keynote active at scenario minute 25", which is the state §5's
 * +12 / +19 scenarios start from. Returns the event id and current revision.
 */
const driveToActiveKeynote = async (
  token: string,
): Promise<{ eventId: string; revision: number }> => {
  const eventId = await createEvent(token);
  let res = await call('PUT', `/v1/events/${eventId}/draft`, {
    token,
    body: draftBody(1),
    idempotencyKey: uuid(),
  });
  expect(res.status).toBe(200); // revision 2

  res = await post(token, `/v1/events/${eventId}/publish`, { expectedRevision: 2 });
  expect(res.status).toBe(200); // revision 3, running

  res = await post(token, `/v1/events/${eventId}/cues/opening/start`, { expectedRevision: 3 });
  expect(res.status).toBe(200); // revision 4

  res = await post(token, `/v1/events/${eventId}/rehearsal-clock`, {
    expectedRevision: 4,
    nowAt: atMinute(5),
  });
  expect(res.status).toBe(200); // revision 5

  res = await post(token, `/v1/events/${eventId}/cues/opening/complete`, { expectedRevision: 5 });
  expect(res.status).toBe(200); // revision 6

  res = await post(token, `/v1/events/${eventId}/cues/keynote/start`, { expectedRevision: 6 });
  expect(res.status).toBe(200); // revision 7

  res = await post(token, `/v1/events/${eventId}/rehearsal-clock`, {
    expectedRevision: 7,
    nowAt: atMinute(25),
  });
  expect(res.status).toBe(200); // revision 8
  return { eventId, revision: 8 };
};

describe('running the fixture through real commands', () => {
  it('records actual times from the labeled rehearsal clock, not a real one', async () => {
    const owner = await mintToken('m3-run-1');
    const { eventId } = await driveToActiveKeynote(owner);
    const read = await call('GET', `/v1/events/${eventId}`, { token: owner });
    const { state } = await json<{ state: StateOut }>(read);

    const opening = state.cues.find((c) => c.id === 'opening') as CueOut;
    expect(opening.status).toBe('completed');
    expect(opening.actualStartAt).toBe(atMinute(0));
    expect(opening.actualEndAt).toBe(atMinute(5));
    // The provenance travels with the timestamp, so a runbook can never present a scenario
    // time as a real observation.
    expect(opening.actualTimeSource).toBe('rehearsal_clock');

    const keynote = state.cues.find((c) => c.id === 'keynote') as CueOut;
    expect(keynote.status).toBe('active');
    expect(keynote.actualStartAt).toBe(atMinute(5));
    expect(keynote.actualTimeSource).toBe('rehearsal_clock');
    expect(state.currentCueId).toBe('keynote');
    // Forecast = actual start + planned DURATION, so a late start pushes the forecast.
    expect(state.activeForecastEndMin).toBe(25);
    expect(state.scheduleHealth).toBe('valid');
  });

  it('refuses to start a cue out of order', async () => {
    const owner = await mintToken('m3-run-2');
    const eventId = await createEvent(owner);
    await call('PUT', `/v1/events/${eventId}/draft`, { token: owner, body: draftBody(1), idempotencyKey: uuid() });
    await post(owner, `/v1/events/${eventId}/publish`, { expectedRevision: 2 });

    const res = await post(owner, `/v1/events/${eventId}/cues/qa/start`, { expectedRevision: 3 });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('CUE_ORDER_VIOLATION');
  });

  it('refuses to start a second cue while one is active', async () => {
    const owner = await mintToken('m3-run-3');
    const eventId = await createEvent(owner);
    await call('PUT', `/v1/events/${eventId}/draft`, { token: owner, body: draftBody(1), idempotencyKey: uuid() });
    await post(owner, `/v1/events/${eventId}/publish`, { expectedRevision: 2 });
    await post(owner, `/v1/events/${eventId}/cues/opening/start`, { expectedRevision: 3 });

    const res = await post(owner, `/v1/events/${eventId}/cues/keynote/start`, { expectedRevision: 4 });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('CUE_ORDER_VIOLATION');
  });

  it('refuses to complete a cue that is not the active one', async () => {
    const owner = await mintToken('m3-run-4');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    const res = await post(owner, `/v1/events/${eventId}/cues/qa/complete`, {
      expectedRevision: revision,
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('CUE_ORDER_VIOLATION');
  });
});

describe('rehearsal clock', () => {
  it('rejects a backwards clock and publishes a forwards one', async () => {
    const owner = await mintToken('m3-clock-1');
    const { eventId, revision } = await driveToActiveKeynote(owner);

    const backwards = await post(owner, `/v1/events/${eventId}/rehearsal-clock`, {
      expectedRevision: revision,
      nowAt: atMinute(10),
    });
    expect(backwards.status).toBe(409);
    expect(await errorCode(backwards)).toBe('CLOCK_NOT_MONOTONIC');

    // Equal is also rejected: the clock advances monotonically.
    const equal = await post(owner, `/v1/events/${eventId}/rehearsal-clock`, {
      expectedRevision: revision,
      nowAt: atMinute(25),
    });
    expect(equal.status).toBe(409);

    const before = await rawRows(eventId);
    const forwards = await post(owner, `/v1/events/${eventId}/rehearsal-clock`, {
      expectedRevision: revision,
      nowAt: atMinute(30),
    });
    expect(forwards.status).toBe(200);
    const body = await json<{ revision: number; publishedRevision: number; state: StateOut }>(forwards);
    expect(body.revision).toBe(revision + 1);
    // Changing it increments AND publishes, so both views agree on the scenario.
    expect(body.publishedRevision).toBe(revision + 1);
    expect(body.state.scenarioNowAt).toBe(atMinute(30));

    const after = await rawRows(eventId);
    expect(after.revisions.length).toBe(before.revisions.length + 1);
  });

  it('forbids the scenario clock in live mode', async () => {
    const owner = await mintToken('m3-clock-2');
    const eventId = `live-${uuid()}`;
    const created = await call('PUT', `/v1/events/${eventId}`, {
      token: owner,
      body: {
        name: 'Live Event',
        startsAt: '2026-09-19T04:30:00Z',
        hardEndMin: 60,
        mode: 'live',
        seed: 'blank',
      },
      idempotencyKey: uuid(),
    });
    expect(created.status).toBe(201);
    await call('PUT', `/v1/events/${eventId}/draft`, { token: owner, body: draftBody(1), idempotencyKey: uuid() });
    await post(owner, `/v1/events/${eventId}/publish`, { expectedRevision: 2 });

    const res = await post(owner, `/v1/events/${eventId}/rehearsal-clock`, {
      expectedRevision: 3,
      nowAt: atMinute(10),
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('CLOCK_FORBIDDEN_IN_LIVE');
  });
});

describe('+12 minutes through the real endpoints', () => {
  it('previews a feasible repair at cost 24 without mutating anything', async () => {
    const owner = await mintToken('m3-p12-1');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    const before = await rawRows(eventId);

    const res = await post(owner, `/v1/events/${eventId}/repair-proposals`, {
      expectedRevision: revision,
      activeForecastEndMin: 37,
      releaseUpdates: [],
    });
    expect(res.status).toBe(201);
    const body = await json<{
      proposalId: string;
      expiresAt: string;
      result: {
        feasible: boolean;
        weightedShorteningCost: number;
        recoveredMin: number;
        projectedFinishMin: number;
        schedule: Array<{ cueId: string; startMin: number; endMin: number }>;
      };
    }>(res);

    expect(body.result.feasible).toBe(true);
    expect(body.result.weightedShorteningCost).toBe(24);
    expect(body.result.recoveredMin).toBe(12);
    expect(body.result.projectedFinishMin).toBe(60);
    expect(body.result.schedule).toEqual([
      { cueId: 'qa', startMin: 37, endMin: 41 },
      { cueId: 'community', startMin: 41, endMin: 45 },
      { cueId: 'sponsor', startMin: 45, endMin: 55 },
      { cueId: 'closing', startMin: 55, endMin: 60 },
    ]);

    // A preview mutates NOTHING.
    const after = await rawRows(eventId);
    expect(after.state.revision).toBe(before.state.revision);
    expect(after.state.published_revision).toBe(before.state.published_revision);
    expect(after.revisions.length).toBe(before.revisions.length);
    // The proposal itself lives in `proposals` and is `proposed`.
    expect(after.proposals).toEqual([
      { id: body.proposalId, status: 'proposed', base_revision: revision },
    ]);
    // TTL is real wall-clock, ten minutes.
    const ttlMs = Date.parse(body.expiresAt) - Date.now();
    expect(ttlMs).toBeGreaterThan(9 * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(10 * 60_000 + 5_000);
  });

  it('publishes qa 37-41 and community 41-45, leaving sponsor and closing untouched', async () => {
    const owner = await mintToken('m3-p12-2');
    const { eventId, revision } = await driveToActiveKeynote(owner);

    const preview = await post(owner, `/v1/events/${eventId}/repair-proposals`, {
      expectedRevision: revision,
      activeForecastEndMin: 37,
      releaseUpdates: [],
    });
    const { proposalId } = await json<{ proposalId: string }>(preview);

    const approved = await post(
      owner,
      `/v1/events/${eventId}/repair-proposals/${proposalId}/approve`,
      { expectedRevision: revision },
    );
    expect(approved.status).toBe(200);
    const body = await json<{ revision: number; publishedRevision: number; state: StateOut }>(approved);
    expect(body.revision).toBe(revision + 1);
    expect(body.publishedRevision).toBe(revision + 1);

    expect(intervals(body.state.cues)).toEqual([
      ['opening', 0, 5], // completed, untouched
      ['keynote', 5, 25], // active, untouched
      ['qa', 37, 41],
      ['community', 41, 45],
      ['sponsor', 45, 55], // fixed start protected
      ['closing', 55, 60], // hard end protected
    ]);
    // The active cue's new forecast is persisted (INFERRED, decisions M3 #3).
    expect(body.state.activeForecastEndMin).toBe(37);
    expect(body.state.scheduleHealth).toBe('valid');

    const rows = await rawRows(eventId);
    expect(rows.proposals[0]?.status).toBe('accepted');
    expect(rows.revisions.at(-1)?.action).toBe('repair');

    // An anchor polling sees the new revision.
    const anchor = await addAnchor(owner, eventId);
    const snapshot = await call('GET', `/v1/events/${eventId}/published?afterRevision=${revision}`, {
      token: anchor,
    });
    expect(snapshot.status).toBe(200);
    expect(await json<{ publishedRevision: number }>(snapshot)).toMatchObject({
      publishedRevision: revision + 1,
    });
  });

  it('produces the identical plan when the same input is submitted twice', async () => {
    const owner = await mintToken('m3-p12-3');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    const input = { expectedRevision: revision, activeForecastEndMin: 37, releaseUpdates: [] };

    const first = await json<{ result: unknown }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, input),
    );
    const second = await json<{ result: unknown }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, input),
    );
    // The delay is an ABSOLUTE forecast end, never a delta, so resubmitting cannot stack.
    expect(second.result).toEqual(first.result);
  });

  it('does not accumulate a delta when the forecast is re-sent after approval', async () => {
    const owner = await mintToken('m3-p12-4');
    const { eventId, revision } = await driveToActiveKeynote(owner);

    const p1 = await json<{ proposalId: string }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, {
        expectedRevision: revision,
        activeForecastEndMin: 37,
        releaseUpdates: [],
      }),
    );
    await post(owner, `/v1/events/${eventId}/repair-proposals/${p1.proposalId}/approve`, {
      expectedRevision: revision,
    });

    // Same absolute forecast again on the new revision: the plan is unchanged, not shifted
    // by another 12 minutes.
    const p2 = await json<{ result: { schedule: Array<{ cueId: string; startMin: number; endMin: number }> } }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, {
        expectedRevision: revision + 1,
        activeForecastEndMin: 37,
        releaseUpdates: [],
      }),
    );
    expect(p2.result.schedule).toEqual([
      { cueId: 'qa', startMin: 37, endMin: 41 },
      { cueId: 'community', startMin: 41, endMin: 45 },
      { cueId: 'sponsor', startMin: 45, endMin: 55 },
      { cueId: 'closing', startMin: 55, endMin: 60 },
    ]);
  });
});

describe('+19 minutes: infeasible', () => {
  it('returns 201 with a quantified shortage, because infeasible is an answer not an error', async () => {
    const owner = await mintToken('m3-p19-1');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    const before = await rawRows(eventId);

    const res = await post(owner, `/v1/events/${eventId}/repair-proposals`, {
      expectedRevision: revision,
      activeForecastEndMin: 44,
      releaseUpdates: [],
    });
    expect(res.status).toBe(201);
    const body = await json<{
      proposalId: string;
      result: {
        feasible: boolean;
        schedule: unknown[];
        weightedShorteningCost: number | null;
        failure: { rule: string; cueId: string; earliestMin: number; limitMin: number; shortageMin: number };
      };
    }>(res);
    expect(body.result.feasible).toBe(false);
    expect(body.result.failure).toEqual({
      rule: 'fixed_start',
      cueId: 'sponsor',
      earliestMin: 52,
      limitMin: 45,
      shortageMin: 7,
    });
    expect(body.result.schedule).toEqual([]);
    expect(body.result.weightedShorteningCost).toBeNull();

    // Still no mutation.
    const after = await rawRows(eventId);
    expect(after.state.revision).toBe(before.state.revision);
    expect(after.state.published_revision).toBe(before.state.published_revision);
  });

  it('refuses to approve an infeasible proposal with 422', async () => {
    const owner = await mintToken('m3-p19-2');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    const { proposalId } = await json<{ proposalId: string }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, {
        expectedRevision: revision,
        activeForecastEndMin: 44,
        releaseUpdates: [],
      }),
    );

    const res = await post(owner, `/v1/events/${eventId}/repair-proposals/${proposalId}/approve`, {
      expectedRevision: revision,
    });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('PROPOSAL_INFEASIBLE');

    const rows = await rawRows(eventId);
    expect(rows.state.revision).toBe(revision);
  });
});

describe('approval guards', () => {
  it('rejects approval with a stale expectedRevision and mutates nothing', async () => {
    const owner = await mintToken('m3-guard-1');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    const { proposalId } = await json<{ proposalId: string }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, {
        expectedRevision: revision,
        activeForecastEndMin: 37,
        releaseUpdates: [],
      }),
    );

    const res = await post(owner, `/v1/events/${eventId}/repair-proposals/${proposalId}/approve`, {
      expectedRevision: revision - 1,
    });
    expect(res.status).toBe(409);
    const body = await json<{ error: { code: string; currentRevision: number } }>(res);
    expect(body.error.code).toBe('REVISION_CONFLICT');
    expect(body.error.currentRevision).toBe(revision);

    const rows = await rawRows(eventId);
    expect(rows.state.revision).toBe(revision);
    expect(rows.proposals[0]?.status).toBe('proposed');
  });

  it('marks a proposal stale once any new revision is published', async () => {
    const owner = await mintToken('m3-guard-2');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    const { proposalId } = await json<{ proposalId: string }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, {
        expectedRevision: revision,
        activeForecastEndMin: 37,
        releaseUpdates: [],
      }),
    );

    // Any other publishing command invalidates the outstanding preview.
    await post(owner, `/v1/events/${eventId}/rehearsal-clock`, {
      expectedRevision: revision,
      nowAt: atMinute(26),
    });
    const rows = await rawRows(eventId);
    expect(rows.proposals[0]?.status).toBe('stale');

    const res = await post(owner, `/v1/events/${eventId}/repair-proposals/${proposalId}/approve`, {
      expectedRevision: revision + 1,
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('PROPOSAL_STALE');
  });

  it('rejects a proposal past its ten-minute real-time TTL', async () => {
    const owner = await mintToken('m3-guard-3');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    const { proposalId } = await json<{ proposalId: string }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, {
        expectedRevision: revision,
        activeForecastEndMin: 37,
        releaseUpdates: [],
      }),
    );

    // Backdate `expires_at` rather than waiting ten real minutes. The TTL is under test,
    // not the clock.
    await runInDurableObject(roomFor(eventId), (_i, state) => {
      state.storage.sql.exec(
        'UPDATE proposals SET expires_at = ? WHERE id = ?',
        '2020-01-01T00:00:00Z',
        proposalId,
      );
    });

    const res = await post(owner, `/v1/events/${eventId}/repair-proposals/${proposalId}/approve`, {
      expectedRevision: revision,
    });
    expect(res.status).toBe(409);
    // Distinct from PROPOSAL_STALE: "you took too long" needs a different message from
    // "the event moved".
    expect(await errorCode(res)).toBe('PROPOSAL_EXPIRED');
    const rows = await rawRows(eventId);
    expect(rows.state.revision).toBe(revision);
    // Expiry is DERIVED from expires_at; §12's status CHECK has no `expired` value.
    expect(rows.proposals[0]?.status).toBe('proposed');
  });

  it('refuses to apply the same proposal twice', async () => {
    const owner = await mintToken('m3-guard-4');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    const { proposalId } = await json<{ proposalId: string }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, {
        expectedRevision: revision,
        activeForecastEndMin: 37,
        releaseUpdates: [],
      }),
    );
    expect(
      (
        await post(owner, `/v1/events/${eventId}/repair-proposals/${proposalId}/approve`, {
          expectedRevision: revision,
        })
      ).status,
    ).toBe(200);

    // Different idempotency key, so this is a genuine second attempt, not a replay.
    const second = await post(
      owner,
      `/v1/events/${eventId}/repair-proposals/${proposalId}/approve`,
      { expectedRevision: revision + 1 },
    );
    expect(second.status).toBe(409);
    expect(['PROPOSAL_ALREADY_APPLIED', 'PROPOSAL_STALE']).toContain(await errorCode(second));
  });

  it('forbids an anchor from proposing or approving', async () => {
    const owner = await mintToken('m3-guard-5');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    const anchor = await addAnchor(owner, eventId);
    const res = await post(anchor, `/v1/events/${eventId}/repair-proposals`, {
      expectedRevision: revision,
      activeForecastEndMin: 37,
      releaseUpdates: [],
    });
    expect(res.status).toBe(403);
  });
});

describe('PLAN_TIME_STALE, both routes', () => {
  it('route 1: with no active cue, an advanced clock changes the plan', async () => {
    const owner = await mintToken('m3-stale-1');
    const { eventId, revision } = await driveToActiveKeynote(owner);

    // Complete the keynote so there is NO active cue. The DP cursor is then
    // max(latest completed end, current minute) and genuinely depends on the clock.
    let r = revision;
    expect((await post(owner, `/v1/events/${eventId}/cues/keynote/complete`, { expectedRevision: r })).status).toBe(200);
    r += 1;

    const { proposalId } = await json<{ proposalId: string }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, {
        expectedRevision: r,
        activeForecastEndMin: null,
        releaseUpdates: [],
      }),
    );

    // Advance the scenario clock. The cursor moves, so the recomputed plan differs.
    expect(
      (
        await post(owner, `/v1/events/${eventId}/rehearsal-clock`, {
          expectedRevision: r,
          nowAt: atMinute(33),
        })
      ).status,
    ).toBe(200);
    r += 1;

    // The proposal is also stale by base_revision, so force the base forward to isolate the
    // clock effect: re-preview at the new revision, then advance the clock again.
    const fresh = await json<{ proposalId: string }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, {
        expectedRevision: r,
        activeForecastEndMin: null,
        releaseUpdates: [],
      }),
    );
    void proposalId;

    // Backdate the stored base_revision check out of the way by advancing only the clock
    // inside the object, so base_revision still matches but the minute has moved.
    await runInDurableObject(roomFor(eventId), (_i, state) => {
      const row = state.storage.sql
        .exec<{ state_json: string }>('SELECT state_json FROM event_state WHERE singleton = 1')
        .toArray()[0] as { state_json: string };
      const parsed = JSON.parse(row.state_json) as { scenarioNowAt: string };
      parsed.scenarioNowAt = atMinute(50);
      state.storage.sql.exec(
        'UPDATE event_state SET state_json = ? WHERE singleton = 1',
        JSON.stringify(parsed),
      );
    });

    const res = await post(
      owner,
      `/v1/events/${eventId}/repair-proposals/${fresh.proposalId}/approve`,
      { expectedRevision: r },
    );
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('PLAN_TIME_STALE');
  });

  it('route 2: with an active cue, the clock passing the forecast end makes the plan unreachable', async () => {
    const owner = await mintToken('m3-stale-2');
    const { eventId, revision } = await driveToActiveKeynote(owner);

    const { proposalId } = await json<{ proposalId: string }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, {
        expectedRevision: revision,
        activeForecastEndMin: 37,
        releaseUpdates: [],
      }),
    );

    // Push the scenario clock PAST the forecast end of 37 without changing the revision, so
    // base_revision still matches and the DP output is byte-identical. Only the independent
    // validator can notice. Without this route an active-cue event could never go stale.
    await runInDurableObject(roomFor(eventId), (_i, state) => {
      const row = state.storage.sql
        .exec<{ state_json: string }>('SELECT state_json FROM event_state WHERE singleton = 1')
        .toArray()[0] as { state_json: string };
      const parsed = JSON.parse(row.state_json) as { scenarioNowAt: string };
      parsed.scenarioNowAt = atMinute(42);
      state.storage.sql.exec(
        'UPDATE event_state SET state_json = ? WHERE singleton = 1',
        JSON.stringify(parsed),
      );
    });

    const res = await post(owner, `/v1/events/${eventId}/repair-proposals/${proposalId}/approve`, {
      expectedRevision: revision,
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('PLAN_TIME_STALE');

    const rows = await rawRows(eventId);
    expect(rows.state.revision).toBe(revision);
  });
});

describe('reality is recorded even when it breaks the plan', () => {
  it('persists a late completion and flags needs_repair without shifting later cues', async () => {
    const owner = await mintToken('m3-reality-1');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    let r = revision;

    // Push the scenario clock to minute 50: later than ANY feasible plan, since sponsor is
    // fixed at 45 and the hard end is 60.
    expect(
      (await post(owner, `/v1/events/${eventId}/rehearsal-clock`, { expectedRevision: r, nowAt: atMinute(50) })).status,
    ).toBe(200);
    r += 1;

    const res = await post(owner, `/v1/events/${eventId}/cues/keynote/complete`, {
      expectedRevision: r,
    });
    // Reality is never rejected.
    expect(res.status).toBe(200);
    const body = await json<{ state: StateOut }>(res);

    const keynote = body.state.cues.find((c) => c.id === 'keynote') as CueOut;
    expect(keynote.status).toBe('completed');
    expect(keynote.actualEndAt).toBe(atMinute(50));
    expect(keynote.actualTimeSource).toBe('rehearsal_clock');

    // The conflict is flagged, not fixed.
    expect(body.state.scheduleHealth).toBe('needs_repair');
    // Later cues are NOT silently shifted.
    expect(intervals(body.state.cues.filter((c) => c.status === 'pending'))).toEqual([
      ['qa', 25, 35],
      ['community', 35, 45],
      ['sponsor', 45, 55],
      ['closing', 55, 60],
    ]);
  });

  it('ends the event when the last cue completes', async () => {
    const owner = await mintToken('m3-reality-2');
    const eventId = await createEvent(owner);
    // A single-cue event, so one completion is the last one.
    const body = draftBody(1) as Record<string, unknown>;
    body.cues = [
      {
        id: 'only',
        order: 0,
        title: 'Only cue',
        speakerId: null,
        preferredDurationMin: 5,
        minDurationMin: 5,
        compressionPenalty: 1,
        bufferBeforeMin: 0,
        notBeforeMin: null,
        fixedStartMin: null,
      },
    ];
    await call('PUT', `/v1/events/${eventId}/draft`, { token: owner, body, idempotencyKey: uuid() });
    await post(owner, `/v1/events/${eventId}/publish`, { expectedRevision: 2 });
    await post(owner, `/v1/events/${eventId}/cues/only/start`, { expectedRevision: 3 });
    const res = await post(owner, `/v1/events/${eventId}/cues/only/complete`, { expectedRevision: 4 });
    expect(res.status).toBe(200);
    const out = await json<{ state: StateOut }>(res);
    expect(out.state.phase).toBe('ended');
    expect(out.state.currentCueId).toBeNull();
    expect(out.state.activeForecastEndMin).toBeNull();
  });
});

describe('structural edits stay draft-only', () => {
  it('refuses a draft save while running', async () => {
    const owner = await mintToken('m3-struct-1');
    const { eventId, revision } = await driveToActiveKeynote(owner);
    const res = await call('PUT', `/v1/events/${eventId}/draft`, {
      token: owner,
      body: draftBody(revision),
      idempotencyKey: uuid(),
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('WRONG_PHASE');
  });

  it('refuses a repair proposal on a draft event', async () => {
    const owner = await mintToken('m3-struct-2');
    const eventId = await createEvent(owner);
    await call('PUT', `/v1/events/${eventId}/draft`, { token: owner, body: draftBody(1), idempotencyKey: uuid() });
    const res = await post(owner, `/v1/events/${eventId}/repair-proposals`, {
      expectedRevision: 2,
      activeForecastEndMin: null,
      releaseUpdates: [],
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('WRONG_PHASE');
  });
});

describe('speaker release times', () => {
  it('persists a releaseUpdate so a later re-solve remembers it', async () => {
    const owner = await mintToken('m3-release-1');
    const { eventId, revision } = await driveToActiveKeynote(owner);

    // Release community no earlier than minute 41, which the +12 plan already satisfies.
    const { proposalId } = await json<{ proposalId: string }>(
      await post(owner, `/v1/events/${eventId}/repair-proposals`, {
        expectedRevision: revision,
        activeForecastEndMin: 37,
        releaseUpdates: [{ cueId: 'community', notBeforeMin: 41 }],
      }),
    );
    const approved = await post(
      owner,
      `/v1/events/${eventId}/repair-proposals/${proposalId}/approve`,
      { expectedRevision: revision },
    );
    expect(approved.status).toBe(200);

    const read = await call('GET', `/v1/events/${eventId}`, { token: owner });
    const { state } = await json<{ state: { cues: Array<{ id: string; notBeforeMin: number | null }> } }>(read);
    // INFERRED (decisions M3 #4): without this, a later re-solve silently forgets the
    // speaker's release time.
    expect(state.cues.find((c) => c.id === 'community')?.notBeforeMin).toBe(41);
  });
});

describe('approval never trusts the stored result', () => {
  /**
   * This test exists because a break drill found that removing the recompute entirely still
   * passed all 24 other tests: with `base_revision` matching, `state` is identical and the
   * only free variable is the clock, so `validatePlan` caught every divergence the recompute
   * would have. The recompute was therefore undefended.
   *
   * To discriminate, the stored preview is tampered into a plan that is VALID but
   * SUBOPTIMAL, which `validatePlan` accepts and only a fresh solve rejects.
   */
  it('refuses a stored preview that is valid but not what the scheduler produces', async () => {
    const owner = await mintToken('m3-diverge-1');
    const { eventId, revision } = await driveToActiveKeynote(owner);

    // +8 minutes: the optimum is qa 33-41 (8 min) / community 41-45 (4 min) at cost 12.
    const preview = await post(owner, `/v1/events/${eventId}/repair-proposals`, {
      expectedRevision: revision,
      activeForecastEndMin: 33,
      releaseUpdates: [],
    });
    const { proposalId, result } = await json<{
      proposalId: string;
      result: { weightedShorteningCost: number; schedule: Array<{ cueId: string; startMin: number; endMin: number }> };
    }>(preview);
    expect(result.weightedShorteningCost).toBe(12);
    expect(result.schedule[0]).toEqual({ cueId: 'qa', startMin: 33, endMin: 41 });

    // Tamper the STORED result into the mirror-image split: qa 4 min, community 8 min.
    // Every hard rule still holds - minimums, the fixed start, the hard end, no overlap - so
    // `validatePlan` accepts it. It is simply the wrong answer, at cost 20 instead of 12.
    const tampered = {
      ...result,
      weightedShorteningCost: 20,
      schedule: [
        { cueId: 'qa', startMin: 33, endMin: 37 },
        { cueId: 'community', startMin: 37, endMin: 45 },
        { cueId: 'sponsor', startMin: 45, endMin: 55 },
        { cueId: 'closing', startMin: 55, endMin: 60 },
      ],
    };
    await runInDurableObject(roomFor(eventId), (_i, state) => {
      state.storage.sql.exec(
        'UPDATE proposals SET result_json = ? WHERE id = ?',
        JSON.stringify(tampered),
        proposalId,
      );
    });

    const res = await post(owner, `/v1/events/${eventId}/repair-proposals/${proposalId}/approve`, {
      expectedRevision: revision,
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('PROPOSAL_RESULT_DIVERGED');

    // And crucially: the tampered plan was NOT published.
    const rows = await rawRows(eventId);
    expect(rows.state.revision).toBe(revision);
    const read = await call('GET', `/v1/events/${eventId}`, { token: owner });
    const { state } = await json<{ state: StateOut }>(read);
    expect(intervals(state.cues.filter((c) => c.status === 'pending'))).toEqual([
      ['qa', 25, 35],
      ['community', 35, 45],
      ['sponsor', 45, 55],
      ['closing', 55, 60],
    ]);
  });
});
