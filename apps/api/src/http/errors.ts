/**
 * §12 error contract. One error shape, one status mapping, no ad-hoc responses.
 *
 * Common shape:
 *   { "error": { "code", "message", "currentRevision"?, "retryable" } }
 *
 * Status mapping (§12): 400 malformed JSON; 401 invalid/expired token; 403 insufficient
 * role; 404 absent or inaccessible event; 409 revision/mode/state/idempotency conflict;
 * 422 invalid rules/body; 429 application/provider capacity; 503 provider unavailable.
 *
 * `currentRevision` is only ever attached for a caller who is already a member, so a
 * non-member can never learn another event's revision.
 */

export type ErrorCode =
  | 'MALFORMED_JSON'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN_ROLE'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'IDEMPOTENCY_MISMATCH'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'WRONG_PHASE'
  | 'NOT_PUBLISHED'
  | 'PLAN_TIME_STALE'
  | 'PROPOSAL_EXPIRED'
  | 'PROPOSAL_STALE'
  | 'PROPOSAL_RESULT_DIVERGED'
  | 'PROPOSAL_INFEASIBLE'
  | 'PROPOSAL_ALREADY_APPLIED'
  | 'CUE_ORDER_VIOLATION'
  | 'CLOCK_NOT_MONOTONIC'
  | 'CLOCK_FORBIDDEN_IN_LIVE'
  | 'ALREADY_EXISTS'
  | 'INVITATION_INVALID'
  | 'ACK_INVALID'
  | 'VALIDATION_FAILED'
  | 'NOT_IMPLEMENTED'
  | 'DEMO_CAPACITY'
  | 'PAYLOAD_TOO_LARGE'
  | 'ORIGIN_NOT_ALLOWED'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  MALFORMED_JSON: 400,
  PAYLOAD_TOO_LARGE: 400,
  ORIGIN_NOT_ALLOWED: 403,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ROLE: 403,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  IDEMPOTENCY_MISMATCH: 409,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  WRONG_PHASE: 409,
  NOT_PUBLISHED: 409,
  // Time advanced enough that the previewed plan is no longer reachable. Retryable after a
  // fresh preview, which is a different user action from a revision conflict.
  PLAN_TIME_STALE: 409,
  PROPOSAL_EXPIRED: 409,
  PROPOSAL_STALE: 409,
  // The stored preview is not what a fresh solve produces. Recoverable by previewing again.
  PROPOSAL_RESULT_DIVERGED: 409,
  PROPOSAL_INFEASIBLE: 422,
  PROPOSAL_ALREADY_APPLIED: 409,
  CUE_ORDER_VIOLATION: 409,
  CLOCK_NOT_MONOTONIC: 409,
  CLOCK_FORBIDDEN_IN_LIVE: 409,
  ALREADY_EXISTS: 409,
  INVITATION_INVALID: 409,
  ACK_INVALID: 409,
  VALIDATION_FAILED: 422,
  NOT_IMPLEMENTED: 422,
  DEMO_CAPACITY: 429,
  INTERNAL: 500,
};

const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  // An anchor waiting for the organizer's first publish is in a legitimate waiting state,
  // not a failure. The UI renders "waiting for the organizer to publish" and polls again.
  'NOT_PUBLISHED',
  'DEMO_CAPACITY',
]);

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly currentRevision: number | undefined;

  constructor(code: ErrorCode, message: string, currentRevision?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.currentRevision = currentRevision;
  }

  get status(): number {
    return STATUS[this.code];
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }

  toBody(): {
    error: { code: ErrorCode; message: string; currentRevision?: number; retryable: boolean };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.currentRevision === undefined ? {} : { currentRevision: this.currentRevision }),
        retryable: this.retryable,
      },
    };
  }
}

/**
 * A Durable Object RPC call cannot carry a custom Error subclass across the boundary, so
 * `ApiError` is serialised into the message and rebuilt on the Worker side.
 */
const WIRE_PREFIX = 'CUEPILOT_API_ERROR:';

export const encodeApiError = (err: ApiError): string =>
  `${WIRE_PREFIX}${JSON.stringify({
    code: err.code,
    message: err.message,
    currentRevision: err.currentRevision ?? null,
  })}`;

export const decodeApiError = (err: unknown): ApiError | null => {
  const message = err instanceof Error ? err.message : String(err);
  const at = message.indexOf(WIRE_PREFIX);
  if (at === -1) return null;
  try {
    const parsed = JSON.parse(message.slice(at + WIRE_PREFIX.length)) as {
      code: ErrorCode;
      message: string;
      currentRevision: number | null;
    };
    return new ApiError(parsed.code, parsed.message, parsed.currentRevision ?? undefined);
  } catch {
    return null;
  }
};

/**
 * Throw from inside a Durable Object so the Worker can rebuild the typed error.
 *
 * The variable carries an explicit function TYPE rather than just a `: never` return
 * annotation — TypeScript only narrows control flow through a never-returning call when the
 * callee's type is declared this way.
 */
export const throwApi: (code: ErrorCode, message: string, currentRevision?: number) => never = (
  code,
  message,
  currentRevision,
) => {
  throw new Error(encodeApiError(new ApiError(code, message, currentRevision)));
};
