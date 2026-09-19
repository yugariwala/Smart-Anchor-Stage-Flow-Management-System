/**
 * Test harness. The only thing substituted is the JWKS source: tests sign with a locally
 * generated RSA key pair and hand `createLocalJWKSet` to the SAME `createTokenVerifier`
 * the deployed Worker uses. Signature, `iss`, `aud`, `sub`, `exp`/`iat` and the pinned
 * `RS256` are all still asserted.
 *
 * This is a key-source seam, not an auth bypass: there is no flag, no APP_ENV branch and
 * no code path that skips verification.
 */

import { env, runInDurableObject } from 'cloudflare:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';

import { createTokenVerifier } from '../../../apps/api/src/auth/verifyFirebaseToken';
import worker, { __setVerifierForTests } from '../../../apps/api/src/index';

type Env = Parameters<typeof worker.fetch>[1];

/** `.dev.vars` can override miniflare bindings, so read the project id rather than assume. */
export const PROJECT_ID = (env as unknown as { FIREBASE_PROJECT_ID: string }).FIREBASE_PROJECT_ID;
export const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

let signingKey: CryptoKey;
let kid: string;
let otherSigningKey: CryptoKey;

/** Installs the local key set into the Worker's verifier. Call once per suite. */
export const installLocalKeys = async (): Promise<void> => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  const other = await generateKeyPair('RS256', { extractable: true });
  signingKey = pair.privateKey;
  otherSigningKey = other.privateKey;

  const publicJwk = (await exportJWK(pair.publicKey)) as JWK;
  kid = 'test-key-1';
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  // NOTE: `other`'s public key is deliberately NOT published, so a token signed with it
  // fails signature verification rather than being rejected for an unknown kid.
  __setVerifierForTests(
    createTokenVerifier(PROJECT_ID, createLocalJWKSet({ keys: [publicJwk] })),
    PROJECT_ID,
  );
};

export type TokenOverrides = {
  sub?: string | undefined;
  issuer?: string;
  audience?: string;
  expiresIn?: string;
  issuedAt?: number;
  signWithUnpublishedKey?: boolean;
  omitSub?: boolean;
};

export const mintToken = async (uid: string, overrides: TokenOverrides = {}): Promise<string> => {
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? PROJECT_ID)
    .setIssuedAt(overrides.issuedAt)
    .setExpirationTime(overrides.expiresIn ?? '1h');
  if (overrides.omitSub !== true) jwt.setSubject(overrides.sub ?? uid);
  return jwt.sign(overrides.signWithUnpublishedKey === true ? otherSigningKey : signingKey);
};

const BASE = 'https://api.test';

export type CallOptions = {
  token?: string | undefined;
  body?: unknown;
  idempotencyKey?: string | undefined;
  headers?: Record<string, string>;
};

export const call = async (
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<Response> => {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token !== undefined) headers.Authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey !== undefined) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  return worker.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers,
      body: options.body === undefined ? null : JSON.stringify(options.body),
    }),
    env as Env,
  );
};

export const json = async <T = Record<string, unknown>>(res: Response): Promise<T> =>
  (await res.json()) as T;

export const errorCode = async (res: Response): Promise<string> => {
  const body = await json<{ error?: { code?: string } }>(res);
  return body.error?.code ?? '(no error body)';
};

/** A fresh event id per test, so suites never share Durable Object state. */
let counter = 0;
export const freshEventId = (): string => `evt-${Date.now().toString(36)}-${counter++}`;

export const uuid = (): string => crypto.randomUUID();

/** Six cues mirroring the §5 fixture shape, as valid draft INPUT (no runtime fields). */
export const draftCues = (): Array<Record<string, unknown>> => [
  { id: 'opening', order: 0, title: 'Opening remarks', speakerId: null, preferredDurationMin: 5, minDurationMin: 5, compressionPenalty: 1, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: null },
  { id: 'keynote', order: 1, title: 'Keynote', speakerId: 'spk-mehta', preferredDurationMin: 20, minDurationMin: 20, compressionPenalty: 1, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: null },
  { id: 'qa', order: 2, title: 'Audience Q&A', speakerId: 'spk-mehta', preferredDurationMin: 10, minDurationMin: 4, compressionPenalty: 3, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: null },
  { id: 'community', order: 3, title: 'Community interaction', speakerId: null, preferredDurationMin: 10, minDurationMin: 4, compressionPenalty: 1, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: null },
  { id: 'sponsor', order: 4, title: 'Sponsor address', speakerId: null, preferredDurationMin: 10, minDurationMin: 10, compressionPenalty: 1, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: 45 },
  { id: 'closing', order: 5, title: 'Closing', speakerId: null, preferredDurationMin: 5, minDurationMin: 5, compressionPenalty: 1, bufferBeforeMin: 0, notBeforeMin: null, fixedStartMin: null },
];

export const draftBody = (expectedRevision: number): Record<string, unknown> => ({
  expectedRevision,
  config: {
    name: 'TechFest 2026 Inaugural',
    startsAt: '2026-09-19T04:30:00Z',
    hardEndMin: 60,
  },
  speakers: [
    {
      id: 'spk-mehta',
      displayName: 'Dr. Ananya Mehta',
      pronunciationHint: 'uh-NAHN-yuh MEH-tah',
      facts: [{ id: 'fact-1', text: 'Fictional: heads a fictional applied systems lab.' }],
    },
  ],
  // Organizer facts use generated ids. `event:` and `speaker:` are reserved for
  // server-created source records and are refused at this boundary (§12).
  eventFacts: [{ id: 'fact-event-1', text: 'Fictional inaugural session.' }],
  cues: draftCues(),
});

export const createBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'TechFest 2026 Inaugural',
  startsAt: '2026-09-19T04:30:00Z',
  hardEndMin: 60,
  mode: 'rehearsal',
  seed: 'blank',
  ...overrides,
});

/** Creates an event owned by `token`'s uid and returns its id. */
export const createEvent = async (token: string, id = freshEventId()): Promise<string> => {
  const res = await call('PUT', `/v1/events/${id}`, {
    token,
    body: createBody(),
    idempotencyKey: uuid(),
  });
  if (res.status !== 201) {
    throw new Error(`createEvent failed: ${res.status} ${await res.text()}`);
  }
  return id;
};

/** Creates an event, saves a valid draft and publishes it. Returns id and revision. */
export const createPublishedEvent = async (
  token: string,
): Promise<{ eventId: string; revision: number }> => {
  const eventId = await createEvent(token);
  const draft = await call('PUT', `/v1/events/${eventId}/draft`, {
    token,
    body: draftBody(1),
    idempotencyKey: uuid(),
  });
  if (draft.status !== 200) throw new Error(`draft failed: ${draft.status} ${await draft.text()}`);
  const published = await call('POST', `/v1/events/${eventId}/publish`, {
    token,
    body: { expectedRevision: 2 },
    idempotencyKey: uuid(),
  });
  if (published.status !== 200) {
    throw new Error(`publish failed: ${published.status} ${await published.text()}`);
  }
  const body = await json<{ revision: number }>(published);
  return { eventId, revision: body.revision };
};

/** Owner mints an invite, anchor consumes it. Returns the anchor's token. */
export const addAnchor = async (ownerToken: string, eventId: string): Promise<string> => {
  const invite = await call('POST', `/v1/events/${eventId}/invitations`, {
    token: ownerToken,
    body: { role: 'anchor' },
    idempotencyKey: uuid(),
  });
  if (invite.status !== 201) throw new Error(`invite failed: ${invite.status}`);
  const { inviteCode } = await json<{ inviteCode: string }>(invite);
  const anchorToken = await mintToken(`anchor-${counter++}`);
  const joined = await call('POST', `/v1/events/${eventId}/join`, {
    token: anchorToken,
    body: { inviteCode },
    idempotencyKey: uuid(),
  });
  if (joined.status !== 200) throw new Error(`join failed: ${joined.status} ${await joined.text()}`);
  return anchorToken;
};

/**
 * Clears the shared QuotaRoom counters.
 *
 * The §12 defaults (100 events/project/day, 2/uid/day) are real production caps, not test
 * knobs, so they stay as they are. But every suite shares one QuotaRoom, and the project
 * cap would eventually make an unrelated test fail with 429 as the suite grows. Resetting
 * the counter keeps that failure honest: a 429 in a test then means that test's own uid cap.
 */
export const resetQuotas = async (): Promise<void> => {
  const ns = (env as unknown as { QUOTA_ROOMS: DurableObjectNamespace }).QUOTA_ROOMS;
  await runInDurableObject(ns.get(ns.idFromName('global')), (_instance, state) => {
    state.storage.sql.exec('DELETE FROM counters');
  });
};
