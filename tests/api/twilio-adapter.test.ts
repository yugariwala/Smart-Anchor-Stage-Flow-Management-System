import { describe, expect, it, vi } from 'vitest';

import { placeReminderCall, reminderTwiML } from '../../apps/api/src/voice/twilio';

const env = {
  VOICE_REMINDERS_ENABLED: 'true',
  TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
  TWILIO_AUTH_TOKEN: 'test-token-not-real',
  TWILIO_FROM_NUMBER: '+15551234567',
};

const call = {
  to: '+15557654321',
  speakerName: 'Dr. Mehta',
  eventName: 'TechFest',
  cueTitle: 'Keynote',
};

describe('Twilio reminder adapter', () => {
  it('escapes organizer-entered text in TwiML', () => {
    const twiml = reminderTwiML({
      speakerName: 'A&B <guest>',
      eventName: 'Demo "night"',
      cueTitle: "R&D's future",
    });

    expect(twiml).toContain('A&amp;B &lt;guest&gt;');
    expect(twiml).toContain('Demo &quot;night&quot;');
    expect(twiml).toContain('R&amp;D&apos;s future');
    expect(twiml).not.toContain('<guest>');
  });

  it('posts one form-encoded call without putting credentials in the URL', async () => {
    const doFetch = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      expect(url).toBe(
        'https://api.twilio.com/2010-04-01/Accounts/AC00000000000000000000000000000000/Calls.json',
      );
      expect(url).not.toContain(env.TWILIO_AUTH_TOKEN);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/x-www-form-urlencoded',
      });
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('To')).toBe(call.to);
      expect(form.get('From')).toBe(env.TWILIO_FROM_NUMBER);
      expect(form.get('Twiml')).toContain('This call cannot receive a response.');
      return new Response(JSON.stringify({ sid: 'CA00000000000000000000000000000000' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await expect(placeReminderCall(call, env, doFetch)).resolves.toEqual({
      callSid: 'CA00000000000000000000000000000000',
    });
    expect(doFetch).toHaveBeenCalledOnce();
  });

  it('refuses to call when the feature is disabled', async () => {
    const doFetch = vi.fn<typeof fetch>();

    await expect(
      placeReminderCall(call, { ...env, VOICE_REMINDERS_ENABLED: 'false' }, doFetch),
    ).rejects.toMatchObject({
      kind: 'not_configured',
    });
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('does not expose a provider response body in failures', async () => {
    const doFetch = vi.fn<typeof fetch>(
      async () =>
        new Response('private provider diagnostic with +15557654321', {
          status: 503,
        }),
    );

    await expect(placeReminderCall(call, env, doFetch)).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'The voice provider returned 503.',
    });
  });
});
