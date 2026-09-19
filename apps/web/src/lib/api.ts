/**
 * Typed client for the CuePilot Worker.
 *
 * Every mutation carries `Idempotency-Key`, and the server error shape from §12 is surfaced
 * as a typed `ApiCallError` so the UI can branch on `code` rather than on a message string.
 * `NOT_PUBLISHED` in particular is a legitimate waiting state, not a failure.
 */

import type { EventState } from '@cuepilot/domain';

import { idToken } from './auth';
import { config } from './env';

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
    super(body?.error.message ?? fallback);
    this.name = 'ApiCallError';
    this.status = status;
    this.code = body?.error.code ?? 'UNKNOWN';
    this.currentRevision = body?.error.currentRevision;
    this.retryable = body?.error.retryable ?? false;
  }
}

type RequestOptions = {
  method?: 'GET' | 'PUT' | 'POST' | 'DELETE';
  body?: unknown;
  /** Required for every mutation. Reuse the same key when retrying the same intent. */
  idempotencyKey?: string;
  /** Treat 204 as a valid empty result instead of an error (used by the snapshot poll). */
  allowNoContent?: boolean;
};

/** `null` means the server replied 204: nothing changed. */
const call = async <T>(path: string, options: RequestOptions = {}): Promise<T | null> => {
  const headers: Record<string, string> = { Authorization: `Bearer ${await idToken()}` };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey !== undefined) headers['Idempotency-Key'] = options.idempotencyKey;

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? null : JSON.stringify(options.body),
  });

  if (response.status === 204) {
    if (options.allowNoContent === true) return null;
    return null;
  }
  const text = await response.text();
  const parsed: unknown = text.length === 0 ? null : JSON.parse(text);

  if (!response.ok) {
    throw new ApiCallError(response.status, parsed as ApiErrorBody | null, response.statusText);
  }
  return parsed as T;
};

export type Health = { ok: true; buildCommit: string };

/** Public: the only endpoint that needs no token. */
export const health = async (): Promise<Health> => {
  const response = await fetch(`${config.apiBaseUrl}/health`);
  if (!response.ok) throw new ApiCallError(response.status, null, 'health check failed');
  return (await response.json()) as Health;
};

export type EventEnvelope = {
  state: EventState;
  publishedRevision: number | null;
  serverNow: string;
  acknowledgments: Array<{ uid: string; revision: number; acknowledgedAt: string }>;
};

export const getEvent = (eventId: string): Promise<EventEnvelope | null> =>
  call<EventEnvelope>(`/events/${eventId}`);

export const createEvent = (
  eventId: string,
  body: { name: string; startsAt: string; hardEndMin: number; mode: 'rehearsal' | 'live'; seed: 'blank' },
  idempotencyKey: string,
): Promise<{ eventId: string; revision: number; state: EventState } | null> =>
  call(`/events/${eventId}`, { method: 'PUT', body, idempotencyKey });

export type PublishedSnapshot = {
  state: EventState;
  publishedRevision: number;
  serverNow: string;
};

/** `null` means 204: the caller's `afterRevision` is already current. */
export const getPublished = (
  eventId: string,
  afterRevision: number | null,
): Promise<PublishedSnapshot | null> =>
  call<PublishedSnapshot>(
    `/events/${eventId}/published${afterRevision === null ? '' : `?afterRevision=${afterRevision}`}`,
    { allowNoContent: true },
  );

/** Everything beyond the M0b connectivity probe. */
export const organizerConsole = (): never => {
  throw new Error('not implemented: Milestone 4');
};
