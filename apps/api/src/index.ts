/**
 * CuePilot Worker: a small explicit router, no framework.
 *
 * Thin by design — the free Workers plan allows 10 ms CPU per request, so this layer does
 * CORS, a request id, token verification, a body cap and routing. Every scheduling rule and
 * every transaction lives in the Durable Object. CORS is not authorization (§15).
 *
 * Logs carry request id, method, path, status and duration. Never a biography, a script
 * body, a JWT or an invite token.
 */

import { ApiError, decodeApiError, type ErrorCode } from './http/errors';
import { canonicalJson, requestHash, sha256Hex } from './http/canonicalJson';
import {
  createTokenVerifier,
  remoteGoogleKeys,
  TokenVerificationError,
  type TokenVerifier,
} from './auth/verifyFirebaseToken';
import { EventRoom, type Env, type MutationEnvelope } from './objects/EventRoom';
import { QuotaRoom } from './objects/QuotaRoom';

export { EventRoom, QuotaRoom };

/** 128 KB, matching the maximum state body (§12). */
const MAX_BODY_BYTES = 128 * 1024;

/** Invite secrets are 256 bits — comfortably above the 128-bit floor (§12). */
const INVITE_SECRET_BYTES = 32;
const INVITATION_TTL_MS = 60 * 60 * 1000;

const nowIso = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ───────────────────────────────── CORS ────────────────────────────────────────────────

const allowedOrigins = (env: Env): string[] =>
  env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter((o) => o.length > 0);

const corsHeaders = (env: Env, origin: string | null): Record<string, string> => {
  if (origin === null || !allowedOrigins(env).includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Idempotency-Key',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
};

// ─────────────────────────────── responses ─────────────────────────────────────────────

type Ctx = {
  readonly env: Env;
  readonly requestId: string;
  readonly origin: string | null;
  readonly serverNow: string;
};

const respond = (ctx: Ctx, status: number, body: unknown): Response => {
  const headers: Record<string, string> = {
    'X-Request-Id': ctx.requestId,
    'X-Server-Now': ctx.serverNow,
    'Cache-Control': 'no-store',
    ...corsHeaders(ctx.env, ctx.origin),
  };
  if (status === 204 || body === null) return new Response(null, { status, headers });
  headers['Content-Type'] = 'application/json';
  return new Response(JSON.stringify(body), { status, headers });
};

const fail = (ctx: Ctx, err: ApiError): Response => respond(ctx, err.status, err.toBody());

const apiError = (code: ErrorCode, message: string, currentRevision?: number): ApiError =>
  new ApiError(code, message, currentRevision);

// ──────────────────────────────── helpers ──────────────────────────────────────────────

const readJsonBody = async (request: Request): Promise<unknown> => {
  const declared = request.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    throw apiError('PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw apiError('PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw apiError('MALFORMED_JSON', 'Request body is not valid JSON.');
  }
};

const requireIdempotencyKey = (request: Request): string => {
  const key = request.headers.get('Idempotency-Key');
  if (key === null || key.trim().length === 0) {
    throw apiError('IDEMPOTENCY_KEY_REQUIRED', 'This request requires an Idempotency-Key header.');
  }
  return key.trim();
};

const requireBearer = async (request: Request, verifier: TokenVerifier): Promise<string> => {
  const header = request.headers.get('Authorization');
  if (header === null || !header.startsWith('Bearer ')) {
    throw apiError('UNAUTHENTICATED', 'A Firebase ID token is required.');
  }
  try {
    const { uid } = await verifier.verify(header.slice('Bearer '.length).trim());
    return uid;
  } catch (cause) {
    if (cause instanceof TokenVerificationError) {
      throw apiError('UNAUTHENTICATED', 'Invalid or expired token.');
    }
    throw cause;
  }
};

const room = (env: Env, eventId: string): DurableObjectStub<EventRoom> =>
  env.EVENT_ROOMS.get(env.EVENT_ROOMS.idFromName(eventId));

const quotaRoom = (env: Env): DurableObjectStub =>
  env.QUOTA_ROOMS.get(env.QUOTA_ROOMS.idFromName('global'));

const envelope = async (
  request: Request,
  uid: string,
  path: string,
  body: unknown,
  serverNow: string,
): Promise<MutationEnvelope> => ({
  uid,
  idempotencyKey: requireIdempotencyKey(request),
  requestHash: await requestHash(request.method, path, body),
  nowIso: serverNow,
});

type CommandResponse = { status: number; body: unknown };

/** Rebuilds a typed ApiError that crossed the Durable Object RPC boundary. */
const viaRoom = async (call: Promise<CommandResponse>): Promise<CommandResponse> => {
  try {
    return await call;
  } catch (cause) {
    const decoded = decodeApiError(cause);
    if (decoded !== null) throw decoded;
    throw cause;
  }
};

// ───────────────────────────────── routing ─────────────────────────────────────────────

/** One verifier per isolate, so the JWKS cache is actually reused. */
let cachedVerifier: { projectId: string; verifier: TokenVerifier } | null = null;
const verifierFor = (env: Env): TokenVerifier => {
  if (cachedVerifier === null || cachedVerifier.projectId !== env.FIREBASE_PROJECT_ID) {
    cachedVerifier = {
      projectId: env.FIREBASE_PROJECT_ID,
      verifier: createTokenVerifier(env.FIREBASE_PROJECT_ID, remoteGoogleKeys()),
    };
  }
  return cachedVerifier.verifier;
};

/** Overridable for tests: they inject a local key set, never a bypass. */
export const __setVerifierForTests = (verifier: TokenVerifier | null, projectId: string): void => {
  cachedVerifier = verifier === null ? null : { projectId, verifier };
};

const route = async (request: Request, ctx: Ctx, verifier: TokenVerifier): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const segments = path.split('/').filter((s) => s.length > 0);
  const { env, serverNow } = ctx;

  // /v1/health — public, leaks nothing.
  if (request.method === 'GET' && path === '/v1/health') {
    return respond(ctx, 200, { ok: true, buildCommit: env.BUILD_COMMIT });
  }

  if (segments[0] !== 'v1' || segments[1] !== 'events') {
    return fail(ctx, apiError('NOT_FOUND', 'No such endpoint.'));
  }

  const uid = await requireBearer(request, verifier);
  const eventId = segments[2];
  if (eventId === undefined || eventId.length === 0 || eventId.length > 128) {
    return fail(ctx, apiError('NOT_FOUND', 'No such endpoint.'));
  }
  const stub = room(env, eventId);
  const tail = segments.slice(3);

  // PUT /v1/events/{uuid}
  if (request.method === 'PUT' && tail.length === 0) {
    const body = await readJsonBody(request);
    const env0 = await envelope(request, uid, path, body, serverNow);
    // Admission before creation. Reserved even if creation then fails, by design.
    await (quotaRoom(env) as unknown as { admitEventCreation(uid: string, nowIso: string): Promise<void> })
      .admitEventCreation(uid, serverNow)
      .catch((cause: unknown) => {
        const decoded = decodeApiError(cause);
        throw decoded ?? cause;
      });
    const out = await viaRoom(stub.create({ ...env0, eventId, body }));
    if (out.status === 201) {
      const state = (out.body as { state: { expiresAt: string } }).state;
      await stub.scheduleExpiry(state.expiresAt);
    }
    return respond(ctx, out.status, out.body);
  }

  // GET /v1/events/{id}
  if (request.method === 'GET' && tail.length === 0) {
    const out = await viaRoom(stub.getForOwner(uid, serverNow));
    return respond(ctx, out.status, out.body);
  }

  // PUT /v1/events/{id}/draft
  if (request.method === 'PUT' && tail.length === 1 && tail[0] === 'draft') {
    const body = await readJsonBody(request);
    const out = await viaRoom(stub.saveDraft({ ...(await envelope(request, uid, path, body, serverNow)), body }));
    return respond(ctx, out.status, out.body);
  }

  // POST /v1/events/{id}/publish
  if (request.method === 'POST' && tail.length === 1 && tail[0] === 'publish') {
    const body = await readJsonBody(request);
    const out = await viaRoom(stub.publish({ ...(await envelope(request, uid, path, body, serverNow)), body }));
    return respond(ctx, out.status, out.body);
  }

  // GET /v1/events/{id}/published?afterRevision=N
  if (request.method === 'GET' && tail.length === 1 && tail[0] === 'published') {
    const raw = url.searchParams.get('afterRevision');
    const after = raw === null ? null : Number(raw);
    if (after !== null && !Number.isInteger(after)) {
      return fail(ctx, apiError('VALIDATION_FAILED', 'afterRevision must be an integer.'));
    }
    const out = await viaRoom(stub.getPublished(uid, after, serverNow));
    return respond(ctx, out.status, out.body);
  }

  // POST /v1/events/{id}/invitations
  if (request.method === 'POST' && tail.length === 1 && tail[0] === 'invitations') {
    const body = await readJsonBody(request);
    const env0 = await envelope(request, uid, path, body, serverNow);
    const secret = base64url(crypto.getRandomValues(new Uint8Array(INVITE_SECRET_BYTES)));
    const tokenHash = await sha256Hex(secret);
    const expiresAt = new Date(Date.parse(serverNow) + INVITATION_TTL_MS)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    const out = await viaRoom(stub.createInvitation(env0, tokenHash, expiresAt));
    // Plaintext returned exactly once, never stored and never logged.
    const withCode =
      out.status === 201 ? { ...(out.body as object), inviteCode: secret } : out.body;
    return respond(ctx, out.status, withCode);
  }

  // POST /v1/events/{id}/join
  if (request.method === 'POST' && tail.length === 1 && tail[0] === 'join') {
    const body = await readJsonBody(request);
    const code = (body as { inviteCode?: unknown }).inviteCode;
    if (typeof code !== 'string' || code.length === 0) {
      return fail(ctx, apiError('VALIDATION_FAILED', 'inviteCode is required.'));
    }
    // Hash the secret here so it never reaches the object or a log.
    const inviteCodeHash = await sha256Hex(code);
    const env0 = await envelope(request, uid, path, { inviteCode: '<redacted>' }, serverNow);
    const out = await viaRoom(stub.join({ ...env0, inviteCodeHash }));
    return respond(ctx, out.status, out.body);
  }

  // POST /v1/events/{id}/ack
  if (request.method === 'POST' && tail.length === 1 && tail[0] === 'ack') {
    const body = await readJsonBody(request);
    const rev = (body as { publishedRevision?: unknown }).publishedRevision;
    if (!Number.isInteger(rev)) {
      return fail(ctx, apiError('VALIDATION_FAILED', 'publishedRevision must be an integer.'));
    }
    const out = await viaRoom(stub.acknowledge(uid, rev as number, serverNow));
    return respond(ctx, out.status, out.body);
  }


  // POST /v1/events/{id}/repair-proposals
  if (request.method === 'POST' && tail.length === 1 && tail[0] === 'repair-proposals') {
    const body = await readJsonBody(request);
    const env0 = await envelope(request, uid, path, body, serverNow);
    // The proposal id is minted here so a retried request replays the SAME proposal from the
    // ledger rather than creating a second one.
    const out = await viaRoom(stub.proposeRepair({ ...env0, body, proposalId: crypto.randomUUID() }));
    return respond(ctx, out.status, out.body);
  }

  // POST /v1/events/{id}/repair-proposals/{pid}/approve
  if (
    request.method === 'POST' &&
    tail.length === 3 &&
    tail[0] === 'repair-proposals' &&
    tail[2] === 'approve'
  ) {
    const body = await readJsonBody(request);
    const env0 = await envelope(request, uid, path, body, serverNow);
    const out = await viaRoom(stub.approveRepair({ ...env0, body, proposalId: tail[1] as string }));
    return respond(ctx, out.status, out.body);
  }

  // GET /v1/events/{id}/repair-proposals/{pid}
  if (request.method === 'GET' && tail.length === 2 && tail[0] === 'repair-proposals') {
    const out = await viaRoom(stub.getProposal(uid, tail[1] as string, serverNow));
    return respond(ctx, out.status, out.body);
  }


  // POST /v1/events/{id}/script-proposals
  if (request.method === 'POST' && tail.length === 1 && tail[0] === 'script-proposals') {
    const body = await readJsonBody(request);
    const env0 = await envelope(request, uid, path, body, serverNow);
    // Project cap first, so an event is never charged a per-event unit only to be refused by
    // a project-wide condition. See docs/decisions.md for the over-admission trade.
    await (
      quotaRoom(env) as unknown as { admitAiAttempt(nowIso: string): Promise<void> }
    )
      .admitAiAttempt(serverNow)
      .catch((cause: unknown) => {
        throw decodeApiError(cause) ?? cause;
      });
    const out = await viaRoom(
      stub.proposeScript({ ...env0, body, proposalId: crypto.randomUUID() }),
    );
    return respond(ctx, out.status, out.body);
  }

  // POST /v1/events/{id}/script-proposals/{pid}/approve
  if (
    request.method === 'POST' &&
    tail.length === 3 &&
    tail[0] === 'script-proposals' &&
    tail[2] === 'approve'
  ) {
    const body = await readJsonBody(request);
    const env0 = await envelope(request, uid, path, body, serverNow);
    // §12 requires an inputHash on the stored script. Hashing is async, so it happens here,
    // outside the transaction, exactly like the idempotency hash.
    const inputHash = await sha256Hex(canonicalJson({ proposalId: tail[1], body }));
    const out = await viaRoom(
      stub.approveScript({ ...env0, body, proposalId: tail[1] as string, inputHash }),
    );
    return respond(ctx, out.status, out.body);
  }

  // POST /v1/events/{id}/announcements
  if (request.method === 'POST' && tail.length === 1 && tail[0] === 'announcements') {
    const body = await readJsonBody(request);
    const env0 = await envelope(request, uid, path, body, serverNow);
    const out = await viaRoom(
      stub.publishAnnouncement({ ...env0, body, announcementId: crypto.randomUUID() }),
    );
    return respond(ctx, out.status, out.body);
  }

  // POST /v1/events/{id}/announcements/{aid}/dismiss
  if (
    request.method === 'POST' &&
    tail.length === 3 &&
    tail[0] === 'announcements' &&
    tail[2] === 'dismiss'
  ) {
    const body = await readJsonBody(request);
    const env0 = await envelope(request, uid, path, body, serverNow);
    const out = await viaRoom(
      stub.dismissAnnouncement({ ...env0, body, announcementId: tail[1] as string }),
    );
    return respond(ctx, out.status, out.body);
  }

  // POST /v1/events/{id}/cues/{cid}/start  and  /complete
  if (request.method === 'POST' && tail.length === 3 && tail[0] === 'cues') {
    const cueId = tail[1] as string;
    const verb = tail[2];
    if (verb === 'start' || verb === 'complete') {
      const body = await readJsonBody(request);
      const env0 = await envelope(request, uid, path, body, serverNow);
      const out = await viaRoom(
        verb === 'start'
          ? stub.startCueCommand({ ...env0, body, cueId })
          : stub.completeCueCommand({ ...env0, body, cueId }),
      );
      return respond(ctx, out.status, out.body);
    }
  }

  // POST /v1/events/{id}/rehearsal-clock
  if (request.method === 'POST' && tail.length === 1 && tail[0] === 'rehearsal-clock') {
    const body = await readJsonBody(request);
    const env0 = await envelope(request, uid, path, body, serverNow);
    const out = await viaRoom(stub.rehearsalClockCommand({ ...env0, body }));
    return respond(ctx, out.status, out.body);
  }

  // GET /v1/events/{id}/revisions and /revisions/{rev}
  if (request.method === 'GET' && tail[0] === 'revisions') {
    if (tail.length === 1) {
      const beforeRaw = url.searchParams.get('before');
      const limitRaw = url.searchParams.get('limit');
      const before = beforeRaw === null ? null : Number(beforeRaw);
      const limit = limitRaw === null ? 20 : Number(limitRaw);
      // `Number('abc')` is NaN; passing that to SQLite is a 500, not a page. Validate here
      // so a malformed query is a documented 422 and the storage layer never sees it.
      if (
        (before !== null && (!Number.isInteger(before) || before < 1)) ||
        !Number.isInteger(limit) ||
        limit < 1
      ) {
        return fail(ctx, apiError('VALIDATION_FAILED', 'before and limit must be positive integers.'));
      }
      const out = await viaRoom(
        stub.listRevisions(uid, before, limit, serverNow),
      );
      return respond(ctx, out.status, out.body);
    }
    if (tail.length === 2) {
      const rev = Number(tail[1]);
      if (!Number.isInteger(rev)) {
        return fail(ctx, apiError('NOT_FOUND', 'No such revision.'));
      }
      const out = await viaRoom(stub.getRevision(uid, rev, serverNow));
      return respond(ctx, out.status, out.body);
    }
  }

  // DELETE /v1/events/{id}
  if (request.method === 'DELETE' && tail.length === 0) {
    const body = await readJsonBody(request);
    const out = await viaRoom(stub.destroy({ ...(await envelope(request, uid, path, body, serverNow)), body }));
    return respond(ctx, out.status, out.body);
  }

  return fail(ctx, apiError('NOT_FOUND', 'No such endpoint.'));
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const started = Date.now();
    const ctx: Ctx = {
      env,
      requestId: crypto.randomUUID(),
      origin: request.headers.get('Origin'),
      serverNow: nowIso(),
    };
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { 'X-Request-Id': ctx.requestId, ...corsHeaders(env, ctx.origin) },
      });
    }

    let response: Response;
    try {
      response = await route(request, ctx, verifierFor(env));
    } catch (cause) {
      const known = cause instanceof ApiError ? cause : decodeApiError(cause);
      response = known !== null
        ? fail(ctx, known)
        : fail(ctx, apiError('INTERNAL', 'Unexpected server error.'));
      if (known === null) {
        // Sanitized: message only, never a body, a token or speaker content.
        console.error(
          JSON.stringify({
            requestId: ctx.requestId,
            method: request.method,
            path: url.pathname,
            error: cause instanceof Error ? cause.message : 'unknown',
          }),
        );
      }
    }

    console.log(
      JSON.stringify({
        requestId: ctx.requestId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs: Date.now() - started,
      }),
    );
    return response;
  },
};
