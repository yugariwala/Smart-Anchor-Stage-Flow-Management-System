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
export const errorCopy = (error: unknown): string => {
  if (!(error instanceof ApiCallError)) {
    return error instanceof Error ? error.message : "Something went wrong.";
  }
  switch (error.code) {
    case "REVISION_CONFLICT":
      return `The event changed${error.currentRevision === undefined ? "" : ` (now revision ${error.currentRevision})`}. Refresh and preview again.`;
    case "PROPOSAL_EXPIRED":
      return "This preview expired after ten minutes. Generate a new one.";
    case "PROPOSAL_STALE":
      return "The event moved on since this preview. Generate a new one.";
    case "PLAN_TIME_STALE":
      return "Time advanced and this plan is no longer reachable. Generate a new preview.";
    case "PROPOSAL_RESULT_DIVERGED":
      return "The plan changed since this preview. Generate a new one.";
    case "PROPOSAL_INFEASIBLE":
      return "This plan is not feasible and cannot be published.";
    case "PROPOSAL_ALREADY_APPLIED":
      return "That plan has already been published.";
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
    case "VALIDATION_FAILED":
      return error.message;
    case "NETWORK":
      return "Cannot reach the server.";
    default:
      return error.message;
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
