/** Minimal Twilio REST adapter for organizer-approved, one-way speaker reminders. */

const CALLS_API = 'https://api.twilio.com/2010-04-01/Accounts';
const E164 = /^\+[1-9]\d{7,14}$/;

export type VoiceEnv = {
  VOICE_REMINDERS_ENABLED?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
};

export type ReminderCall = {
  to: string;
  speakerName: string;
  eventName: string;
  cueTitle: string;
};

export class VoiceProviderError extends Error {
  readonly kind: 'not_configured' | 'unavailable';

  constructor(kind: VoiceProviderError['kind'], message: string) {
    super(message);
    this.name = 'VoiceProviderError';
    this.kind = kind;
  }
}

const xml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

export const reminderTwiML = (call: Omit<ReminderCall, 'to'>): string =>
  `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Hello ${xml(call.speakerName)}. This is an automated CuePilot reminder for ${xml(call.eventName)}. Your segment, ${xml(call.cueTitle)}, is coming up. Please contact the organizer now to confirm you are ready. This call cannot receive a response.</Say></Response>`;

export const placeReminderCall = async (
  call: ReminderCall,
  env: VoiceEnv,
  doFetch: typeof fetch = fetch,
): Promise<{ callSid: string }> => {
  const accountSid = env.TWILIO_ACCOUNT_SID ?? '';
  const authToken = env.TWILIO_AUTH_TOKEN ?? '';
  const from = env.TWILIO_FROM_NUMBER ?? '';
  if (
    env.VOICE_REMINDERS_ENABLED !== 'true' ||
    !/^AC[0-9a-fA-F]{32}$/.test(accountSid) ||
    authToken === '' ||
    !E164.test(from)
  ) {
    throw new VoiceProviderError('not_configured', 'Voice reminders are not configured.');
  }
  if (!E164.test(call.to)) {
    throw new VoiceProviderError(
      'not_configured',
      'The speaker does not have a valid E.164 phone number.',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let response: Response;
  try {
    response = await doFetch(`${CALLS_API}/${accountSid}/Calls.json`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: call.to,
        From: from,
        Twiml: reminderTwiML(call),
      }),
    });
  } catch {
    throw new VoiceProviderError('unavailable', 'The voice provider could not be reached.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new VoiceProviderError('unavailable', `The voice provider returned ${response.status}.`);
  }
  try {
    const payload = (await response.json()) as { sid?: unknown };
    if (typeof payload.sid === 'string' && /^CA[0-9a-fA-F]{32}$/.test(payload.sid))
      return { callSid: payload.sid };
  } catch {
    // Provider bodies can contain request details; never include them in an error or log.
  }
  throw new VoiceProviderError(
    'unavailable',
    'The voice provider returned an unreadable response.',
  );
};
