/**
 * The only module that talks to the Worker. Every call goes through here.
 *
 * The §12 error shape is surfaced as a typed `ApiCallError` so the UI branches on `code`,
 * never on a message string. Six conflict codes demand six different user actions, so
 * `errorCopy` keeps that mapping in one place.
 */

import type { EventState, RepairResult } from "@cuepilot/domain";

import { idToken } from "./auth";
import { config } from "./env";
import { getStorageIdentity, rememberEvent } from "./storage";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    currentRevision?: number;
    retryable: boolean;
  };
};

export class ApiCallError extends Error {
  readonly status: number;
  readonly code: string;
  readonly currentRevision: number | undefined;
  readonly retryable: boolean;

  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    super(body?.error?.message ?? fallback);
    this.name = "ApiCallError";
    this.status = status;
    this.code = body?.error?.code ?? "NETWORK";
    this.currentRevision = body?.error?.currentRevision;
    this.retryable = body?.error?.retryable ?? false;
  }
}

/**
 * One sentence per code, because each demands a different action from the organizer.
 * `NOT_PUBLISHED` is deliberately absent: it is a waiting state the UI renders as such, not
 * an error, and callers check for it explicitly.
 */
/**
 * Rule identifiers and schema paths are how the server talks to itself. They are precise
 * and worth keeping in logs, but `contiguous_order(qa)` is not an answer to a person, so
 * the few that can actually reach a screen are translated on the way out.
 */
const RULE_COPY: Record<string, string> = {
  contiguous_order: "two sessions would overlap",
  minimum_durations: "a session would drop below its shortest length",
  fixed_start: "a session with a fixed start time would move",
  hard_end: "the event would run past its finish time",
  buffer: "a gap before a session would be lost",
  not_before: "a speaker would be needed before they are available",
  candidate_covers_pending: "a remaining session would have no slot",
  completed_immutable: "a finished session would change",
  active_immutable: "the session on stage would change",
  integer_minutes: "a time would not land on a whole minute",
  active_forecast_after_now: "the session on stage is already past this plan",
};

const humanize = (message: string): string => {
  const rules = message.match(/([a-z_]+)\([^)]*\)|(?<=: )[a-z_]+$/g) ?? [];
  const named = [
    ...new Set(
      rules
        .map((token) => RULE_COPY[token.replace(/\(.*\)$/, "")])
        .filter((copy): copy is string => copy !== undefined),
    ),
  ];
  if (named.length > 0) {
    return `This cannot be published because ${named.join(", and ")}. Adjust the agenda and try again.`;
  }
  // Zod uses the same "Too big" / "Too small" shape for strings and numbers, so the
  // message has to be read before it is rewritten — a number over its maximum is not
  // "text that is too long".
  if (/Too big/.test(message)) {
    const limit = message.match(/<=(\d+)/)?.[1];
    if (/expected number/.test(message)) {
      return `That number is too large${limit === undefined ? "" : ` — the maximum is ${limit}`}.`;
    }
    return `That text is too long${limit === undefined ? "" : ` — keep it under ${limit} characters`}.`;
  }
  if (/Too small/.test(message)) {
    const limit = message.match(/>=(\d+)/)?.[1];
    if (/expected number/.test(message)) {
      return `That number is too small${limit === undefined ? "" : ` — the minimum is ${limit}`}.`;
    }
    return "This cannot be left empty.";
  }
  if (message === "No such cue.") {
    return "That session no longer exists. Refresh and try again.";
  }
  if (/publication requires at least one cue/.test(message)) {
    return "Add at least one session before publishing.";
  }
  if (/Unrecognized key/.test(message)) {
    return "Some of this event's data is in an unexpected shape. Reload the page and try again.";
  }
  // Anything still carrying a schema path is developer-facing; do not show the path.
  if (/^Invalid \w+: \S*\./.test(message)) {
    return "Some details could not be saved. Check the highlighted fields and try again.";
  }
  return message;
};

export const errorCopy = (error: unknown): string => {
  if (!(error instanceof ApiCallError)) {
    return error instanceof Error ? error.message : "Something went wrong.";
  }
  switch (error.code) {
    case "REVISION_CONFLICT":
      return `Someone else changed this event${error.currentRevision === undefined ? "" : ` (now version ${error.currentRevision})`}. Refresh to see the latest, then try again.`;
    case "PROPOSAL_EXPIRED":
      return "This plan is more than 10 minutes old. Preview again for current times.";
    case "PROPOSAL_STALE":
      return "The event has moved on since you previewed. Preview again.";
    case "PLAN_TIME_STALE":
      return "Too much time has passed — this plan cannot be reached any more. Preview again.";
    case "PROPOSAL_RESULT_DIVERGED":
      return "Something changed, so this is no longer the best plan. Preview again.";
    case "PROPOSAL_INFEASIBLE":
      return "This will not fit, so there is nothing to publish.";
    case "PROPOSAL_ALREADY_APPLIED":
      return "That plan is already published.";
    case "IDEMPOTENCY_MISMATCH":
      return "That action was already sent with different content. Reload and try again.";
    case "CUE_ORDER_VIOLATION":
      return "Cues run in order. Start or complete the cue the console highlights.";
    case "CLOCK_NOT_MONOTONIC":
      return "The scenario clock only moves forward.";
    case "CLOCK_FORBIDDEN_IN_LIVE":
      return "The scenario clock is only available in rehearsal mode.";
    case "WRONG_PHASE":
      return "That action does not apply at this stage of the event.";
    case "FORBIDDEN_ROLE":
      return "Only the event owner can do that.";
    case "NOT_FOUND":
      return "This event is not available to you. It may have been deleted or expired.";
    case "UNAUTHENTICATED":
      return "Your session expired. Reload the page to sign in again.";
    case "DEMO_CAPACITY":
      return "This demo has reached its daily capacity. Try again tomorrow.";
    case "VOICE_NOT_CONFIGURED":
      return "Voice reminders are not configured yet.";
    case "VOICE_PROVIDER_UNAVAILABLE":
      return "The voice provider is unavailable. Try a new call later.";
    case "VALIDATION_FAILED":
      return humanize(error.message);
    case "NETWORK":
      return "Cannot reach the server.";
    default:
      return humanize(error.message);
  }
};

type RequestOptions = {
  method?: "GET" | "PUT" | "POST" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
};

/** `null` means the server replied 204: a successful sync with nothing new. */
const call = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<T | null> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await idToken()}`,
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey !== undefined)
    headers["Idempotency-Key"] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? null : JSON.stringify(options.body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // A transport failure is not an HTTP status. Surfaced as NETWORK so freshness can go red
    // rather than the UI claiming a live sync.
    throw new ApiCallError(0, null, "Cannot reach the server.");
  }

  if (response.status === 204) return null;

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ApiCallError(
      0,
      null,
      "The connection ended before the response was received.",
    );
  }
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiCallError(
        response.status,
        null,
        "The server sent an unreadable response.",
      );
    }
  }
  if (!response.ok) {
    throw new ApiCallError(
      response.status,
      parsed as ApiErrorBody | null,
      response.statusText,
    );
  }
  return parsed as T;
};

// ─────────────────────────────── shapes ──────────────────────────────────────────────────

export type Health = { ok: true; buildCommit: string };

export type EventEnvelope = {
  state: EventState;
  publishedRevision: number | null;
  serverNow: string;
  acknowledgments: Array<{
    uid: string;
    revision: number;
    acknowledgedAt: string;
  }>;
};

export type PublishedSnapshot = {
  state: EventState;
  publishedRevision: number;
  serverNow: string;
};

export type RevisionMutation = {
  revision: number;
  publishedRevision: number | null;
  state: EventState;
};

export type ProposalResponse = {
  proposalId: string;
  expiresAt: string;
  result: RepairResult;
};

export type CreateBody = {
  name: string;
  startsAt: string;
  hardEndMin: number;
  mode: "rehearsal" | "live";
  /**
   * `blank` starts empty; `college-demo-v1` seeds the committed six-cue rehearsal scenario
   * as a draft. Reaching the running keynote state still happens through normal commands.
   */
  seed: "blank" | "college-demo-v1";
};

export type DraftCueInputBody = {
  id: string;
  order: number;
  title: string;
  speakerId: string | null;
  preferredDurationMin: number;
  minDurationMin: number;
  compressionPenalty: number;
  bufferBeforeMin: number;
  notBeforeMin: number | null;
  fixedStartMin: number | null;
};

export type DraftBody = {
  expectedRevision: number;
  config: { name: string; startsAt: string; hardEndMin: number };
  speakers: Array<{
    id: string;
    displayName: string;
    pronunciationHint: string;
    phoneE164?: string | undefined;
    facts: Array<{ id: string; text: string }>;
  }>;
  eventFacts: Array<{ id: string; text: string }>;
  cues: DraftCueInputBody[];
};

// ─────────────────────────────── endpoints ───────────────────────────────────────────────

/** Public: the only endpoint that needs no token. */
export const health = async (): Promise<Health> => {
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/health`);
  } catch {
    throw new ApiCallError(0, null, "Cannot reach the server.");
  }
  if (!response.ok)
    throw new ApiCallError(response.status, null, "Health check failed.");
  return (await response.json()) as Health;
};

export const createEvent = (
  eventId: string,
  body: CreateBody,
  idempotencyKey: string,
): Promise<{ eventId: string; revision: number; state: EventState } | null> =>
  call(`/events/${eventId}`, { method: "PUT", body, idempotencyKey });

export const getEvent = async (
  eventId: string,
): Promise<EventEnvelope | null> => {
  const requestingIdentity = getStorageIdentity();
  const result = await call<EventEnvelope>(`/events/${eventId}`);
  if (
    result &&
    requestingIdentity &&
    getStorageIdentity() === requestingIdentity
  )
    rememberEvent(result.state, "owner");
  return result;
};

export const saveDraft = (
  eventId: string,
  body: DraftBody,
  idempotencyKey: string,
): Promise<RevisionMutation | null> =>
  call(`/events/${eventId}/draft`, { method: "PUT", body, idempotencyKey });

export const publishEvent = (
  eventId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<RevisionMutation | null> =>
  call(`/events/${eventId}/publish`, {
    method: "POST",
    body: { expectedRevision },
    idempotencyKey,
  });

/** `null` means 204: `afterRevision` is already current. Still a successful sync. */
export const getPublished = (
  eventId: string,
  afterRevision: number | null,
): Promise<PublishedSnapshot | null> =>
  call<PublishedSnapshot>(
    `/events/${eventId}/published${afterRevision === null ? "" : `?afterRevision=${afterRevision}`}`,
  );

export const startCueCommand = (
  eventId: string,
  cueId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<RevisionMutation | null> =>
  call(`/events/${eventId}/cues/${cueId}/start`, {
    method: "POST",
    body: { expectedRevision },
    idempotencyKey,
  });

export const completeCueCommand = (
  eventId: string,
  cueId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<RevisionMutation | null> =>
  call(`/events/${eventId}/cues/${cueId}/complete`, {
    method: "POST",
    body: { expectedRevision },
    idempotencyKey,
  });

export const setRehearsalClock = (
  eventId: string,
  expectedRevision: number,
  nowAt: string,
  idempotencyKey: string,
): Promise<RevisionMutation | null> =>
  call(`/events/${eventId}/rehearsal-clock`, {
    method: "POST",
    body: { expectedRevision, nowAt },
    idempotencyKey,
  });

export const proposeRepair = (
  eventId: string,
  body: {
    expectedRevision: number;
    activeForecastEndMin: number | null;
    releaseUpdates: Array<{ cueId: string; notBeforeMin: number }>;
  },
  idempotencyKey: string,
): Promise<ProposalResponse | null> =>
  call(`/events/${eventId}/repair-proposals`, {
    method: "POST",
    body,
    idempotencyKey,
  });

export const approveRepair = (
  eventId: string,
  proposalId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<RevisionMutation | null> =>
  call(`/events/${eventId}/repair-proposals/${proposalId}/approve`, {
    method: "POST",
    body: { expectedRevision },
    idempotencyKey,
  });

export const createInvitation = (
  eventId: string,
  idempotencyKey: string,
): Promise<{ inviteCode: string; expiresAt: string } | null> =>
  call(`/events/${eventId}/invitations`, {
    method: "POST",
    body: { role: "anchor" },
    idempotencyKey,
  });

export const joinEvent = (
  eventId: string,
  inviteCode: string,
  idempotencyKey: string,
): Promise<{ role: "anchor"; eventId: string } | null> =>
  call(`/events/${eventId}/join`, {
    method: "POST",
    body: { inviteCode },
    idempotencyKey,
  });

export const acknowledge = (
  eventId: string,
  publishedRevision: number,
): Promise<{ acknowledgedRevision: number; acknowledgedAt: string } | null> =>
  call(`/events/${eventId}/ack`, {
    method: "POST",
    body: { publishedRevision },
  });

export const placeSpeakerReminderCall = (
  eventId: string,
  speakerId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<{ speakerId: string; queued: boolean } | null> =>
  call(`/events/${eventId}/speakers/${speakerId}/reminder-call`, {
    method: "POST",
    body: { expectedRevision },
    idempotencyKey,
  });

/** Approved script copy for the anchor. */
export type ScriptDraftResponse = {
  proposalId: string;
  baseRevision: number;
  body: string;
  usedFactIds: string[];
  warnings: string[];
  /** Which pipeline produced the words. `template` is never an AI success. */
  source: "gemini" | "template";
  model: string | null;
  /** Why a template stood in, when it did. */
  fallbackReason: string | null;
  /** Exactly the facts the server gave the model, including its own reserved records. */
  approvedFacts: Array<{ id: string; text: string }>;
  expiresAt: string;
};

export const proposeScript = (
  eventId: string,
  body: {
    expectedRevision: number;
    kind:
      "opening" | "introduction" | "transition" | "closing" | "announcement";
    cueId: string | null;
    language: "en" | "hi" | "gu";
  },
  idempotencyKey: string,
): Promise<ScriptDraftResponse | null> =>
  call(`/events/${eventId}/script-proposals`, {
    method: "POST",
    body,
    idempotencyKey,
  });

export const approveScript = (
  eventId: string,
  proposalId: string,
  body: { expectedRevision: number; body: string; usedFactIds: string[] },
  idempotencyKey: string,
): Promise<{
  revision: number;
  scriptId: string;
  publishedRevision: number | null;
} | null> =>
  call(`/events/${eventId}/script-proposals/${proposalId}/approve`, {
    method: "POST",
    body,
    idempotencyKey,
  });

export const publishAnnouncement = (
  eventId: string,
  body: {
    expectedRevision: number;
    text: string;
    language: "en" | "hi" | "gu";
  },
  idempotencyKey: string,
): Promise<{
  revision: number;
  announcementId: string;
  publishedRevision: number | null;
} | null> =>
  call(`/events/${eventId}/announcements`, {
    method: "POST",
    body,
    idempotencyKey,
  });

export const dismissAnnouncement = (
  eventId: string,
  announcementId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<{ revision: number; publishedRevision: number | null } | null> =>
  call(`/events/${eventId}/announcements/${announcementId}/dismiss`, {
    method: "POST",
    body: { expectedRevision },
    idempotencyKey,
  });

export type RevisionEntry = {
  revision: number;
  action: string;
  actorUid: string;
  createdAt: string;
};
export type RevisionPage = {
  items: RevisionEntry[];
  nextBefore: number | null;
};
export const listRevisions = (
  eventId: string,
  before: number | null = null,
): Promise<RevisionPage | null> =>
  call(
    `/events/${eventId}/revisions?limit=20${before === null ? "" : `&before=${before}`}`,
  );
export const getRevision = (
  eventId: string,
  revision: number,
): Promise<{ revision: number; state: EventState } | null> =>
  call(`/events/${eventId}/revisions/${revision}`);
export const deleteEvent = async (
  eventId: string,
  expectedRevision: number,
  idempotencyKey: string,
): Promise<true> => {
  await call(`/events/${eventId}`, {
    method: "DELETE",
    body: { expectedRevision },
    idempotencyKey,
  });
  return true;
};
