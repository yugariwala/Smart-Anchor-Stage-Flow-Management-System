/**
 * Announcements. Explicit publish IS the approval step (§12) — there is no separate draft,
 * and there is no autonomous wording: the organizer types every word.
 *
 * An announcement travels in the SAME published snapshot as the schedule, so an anchor can
 * never see a banner that disagrees with the runbook it came with.
 */

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

const post = (token: string, path: string, body: unknown): Promise<Response> =>
  call('POST', path, { token, body, idempotencyKey: uuid() });

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

type Announcement = {
  id: string;
  text: string;
  language: string;
  publishedAt: string;
  dismissedAt: string | null;
};

const snapshotAnnouncements = async (token: string, eventId: string): Promise<Announcement[]> => {
  const res = await call('GET', `/v1/events/${eventId}/published`, { token });
  const body = await json<{ state: { announcements: Announcement[] } }>(res);
  return body.state.announcements;
};

describe('publish, banner, dismiss', () => {
  it('round-trips through the published snapshot', async () => {
    const owner = await mintToken('ann-1');
    const { eventId, revision } = await runningEvent(owner);
    const anchor = await addAnchor(owner, eventId);

    expect(await snapshotAnnouncements(anchor, eventId)).toEqual([]);

    const published = await post(owner, `/v1/events/${eventId}/announcements`, {
      expectedRevision: revision,
      text: 'The fire drill scheduled for this hour has been postponed.',
      language: 'en',
    });
    expect(published.status).toBe(200);
    const out = await json<{ revision: number; announcementId: string; publishedRevision: number }>(
      published,
    );
    expect(out.revision).toBe(revision + 1);
    // Same snapshot as the schedule: the pointer moves with it.
    expect(out.publishedRevision).toBe(revision + 1);

    const afterPublish = await snapshotAnnouncements(anchor, eventId);
    expect(afterPublish).toHaveLength(1);
    expect(afterPublish[0]?.text).toBe('The fire drill scheduled for this hour has been postponed.');
    expect(afterPublish[0]?.dismissedAt).toBeNull();

    const dismissed = await post(
      owner,
      `/v1/events/${eventId}/announcements/${out.announcementId}/dismiss`,
      { expectedRevision: out.revision },
    );
    expect(dismissed.status).toBe(200);

    const afterDismiss = await snapshotAnnouncements(anchor, eventId);
    // The record survives for the audit trail; the BANNER is what goes away.
    expect(afterDismiss).toHaveLength(1);
    expect(afterDismiss[0]?.dismissedAt).not.toBeNull();
    expect(afterDismiss.filter((a) => a.dismissedAt === null)).toHaveLength(0);
  });

  it('refuses to dismiss the same announcement twice', async () => {
    const owner = await mintToken('ann-2');
    const { eventId, revision } = await runningEvent(owner);
    const published = await post(owner, `/v1/events/${eventId}/announcements`, {
      expectedRevision: revision,
      text: 'A notice.',
      language: 'en',
    });
    const out = await json<{ revision: number; announcementId: string }>(published);
    const first = await post(
      owner,
      `/v1/events/${eventId}/announcements/${out.announcementId}/dismiss`,
      { expectedRevision: out.revision },
    );
    expect(first.status).toBe(200);
    const second = await post(
      owner,
      `/v1/events/${eventId}/announcements/${out.announcementId}/dismiss`,
      { expectedRevision: out.revision + 1 },
    );
    expect(second.status).toBe(409);
    expect(await errorCode(second)).toBe('WRONG_PHASE');
  });

  it('returns 404 for an announcement that does not exist', async () => {
    const owner = await mintToken('ann-3');
    const { eventId, revision } = await runningEvent(owner);
    const res = await post(owner, `/v1/events/${eventId}/announcements/no-such-id/dismiss`, {
      expectedRevision: revision,
    });
    expect(res.status).toBe(404);
  });
});

describe('limits and permissions', () => {
  it('rejects text over the 500-character maximum', async () => {
    const owner = await mintToken('ann-4');
    const { eventId, revision } = await runningEvent(owner);
    const res = await post(owner, `/v1/events/${eventId}/announcements`, {
      expectedRevision: revision,
      text: 'x'.repeat(501),
      language: 'en',
    });
    expect(res.status).toBe(422);
    expect(await errorCode(res)).toBe('VALIDATION_FAILED');
  });

  it('accepts exactly 500 characters', async () => {
    const owner = await mintToken('ann-5');
    const { eventId, revision } = await runningEvent(owner);
    const res = await post(owner, `/v1/events/${eventId}/announcements`, {
      expectedRevision: revision,
      text: 'x'.repeat(500),
      language: 'en',
    });
    expect(res.status).toBe(200);
  });

  it('rejects empty text rather than publishing a blank banner', async () => {
    const owner = await mintToken('ann-6');
    const { eventId, revision } = await runningEvent(owner);
    const res = await post(owner, `/v1/events/${eventId}/announcements`, {
      expectedRevision: revision,
      text: '',
      language: 'en',
    });
    expect(res.status).toBe(422);
  });

  it('forbids an anchor from publishing or dismissing', async () => {
    const owner = await mintToken('ann-7');
    const { eventId, revision } = await runningEvent(owner);
    const anchor = await addAnchor(owner, eventId);

    const publish = await post(anchor, `/v1/events/${eventId}/announcements`, {
      expectedRevision: revision,
      text: 'An anchor should not be able to say this.',
      language: 'en',
    });
    expect(publish.status).toBe(403);
    expect(await errorCode(publish)).toBe('FORBIDDEN_ROLE');

    const owned = await post(owner, `/v1/events/${eventId}/announcements`, {
      expectedRevision: revision,
      text: 'Organizer notice.',
      language: 'en',
    });
    const out = await json<{ revision: number; announcementId: string }>(owned);
    const dismiss = await post(
      anchor,
      `/v1/events/${eventId}/announcements/${out.announcementId}/dismiss`,
      { expectedRevision: out.revision },
    );
    expect(dismiss.status).toBe(403);
  });

  it('rejects a stale expectedRevision and changes nothing', async () => {
    const owner = await mintToken('ann-8');
    const { eventId, revision } = await runningEvent(owner);
    const res = await post(owner, `/v1/events/${eventId}/announcements`, {
      expectedRevision: revision - 1,
      text: 'A notice.',
      language: 'en',
    });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('REVISION_CONFLICT');
    const anchor = await addAnchor(owner, eventId);
    expect(await snapshotAnnouncements(anchor, eventId)).toEqual([]);
  });

  it('caps active announcements at ten', async () => {
    const owner = await mintToken('ann-9');
    const { eventId } = await runningEvent(owner);
    let revision = 3;
    for (let i = 0; i < 10; i++) {
      const res = await post(owner, `/v1/events/${eventId}/announcements`, {
        expectedRevision: revision,
        text: `Notice ${i + 1}.`,
        language: 'en',
      });
      expect(res.status).toBe(200);
      revision = (await json<{ revision: number }>(res)).revision;
    }
    const eleventh = await post(owner, `/v1/events/${eventId}/announcements`, {
      expectedRevision: revision,
      text: 'One too many.',
      language: 'en',
    });
    expect(eleventh.status).toBe(422);
  });

  it('accepts Hindi and Gujarati text without mangling it', async () => {
    const owner = await mintToken('ann-10');
    const { eventId, revision } = await runningEvent(owner);
    const hindi = 'कृपया अपने स्थान पर बैठें।';
    const res = await post(owner, `/v1/events/${eventId}/announcements`, {
      expectedRevision: revision,
      text: hindi,
      language: 'hi',
    });
    expect(res.status).toBe(200);
    const anchor = await addAnchor(owner, eventId);
    const list = await snapshotAnnouncements(anchor, eventId);
    expect(list[0]?.text).toBe(hindi);
    expect(list[0]?.language).toBe('hi');
  });
});
