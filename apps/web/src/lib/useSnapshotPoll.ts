/**
 * Published-snapshot polling, freshness, and the local read-only cache.
 *
 * §20 governs all of it:
 *  - two seconds, VISIBLE views only; stop on hidden, refresh immediately on focus
 *  - a 204 is a successful sync and updates freshness, it just carries no new revision
 *  - back off after errors, reset on success
 *  - cache ONLY the latest published snapshot; clear it on deletion or sign-out
 *  - the offline countdown is an estimate and must not imply live coordination
 *
 * Freshness derives from `lastSyncAt`, never from whether a request is in flight: a pending
 * request that never resolves must still age into amber and then red.
 *
 * This hook owns the clock. `nowMs` is state advanced by a one-second ticker, so no component
 * calls `Date.now()` during render — which would be impure and could produce a different
 * countdown on every re-render.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiCallError, getPublished, type PublishedSnapshot } from './api';

const POLL_MS = 2_000;
const AMBER_MS = 5_000;
const RED_MS = 15_000;
const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const;

export type Freshness = 'live' | 'amber' | 'stale';

export type SnapshotState = {
  snapshot: PublishedSnapshot | null;
  /** True while `snapshot` came from localStorage and no successful sync has landed yet. */
  fromCache: boolean;
  /** Set when the organizer has not published yet. A waiting state, not an error. */
  notPublished: boolean;
  error: ApiCallError | null;
  lastSyncAt: number | null;
  freshness: Freshness;
  /** Local estimate of the server clock, as an ISO instant. Never written anywhere. */
  serverNowIso: string;
  refresh: () => void;
};

const cacheKey = (eventId: string): string => `cuepilot:snapshot:${eventId}`;

const readCache = (eventId: string): PublishedSnapshot | null => {
  try {
    const raw = localStorage.getItem(cacheKey(eventId));
    return raw === null ? null : (JSON.parse(raw) as PublishedSnapshot);
  } catch {
    return null;
  }
};

const writeCache = (eventId: string, snapshot: PublishedSnapshot): void => {
  try {
    localStorage.setItem(cacheKey(eventId), JSON.stringify(snapshot));
  } catch {
    // A full or blocked store must not break the live view.
  }
};

export const clearSnapshotCache = (eventId: string): void => {
  try {
    localStorage.removeItem(cacheKey(eventId));
  } catch {
    /* nothing to do */
  }
};

const isoOf = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

export const useSnapshotPoll = (eventId: string | null, enabled = true): SnapshotState => {
  // Read the cache once, in a lazy initializer, so the labelled stale view is on screen
  // before the first sync without an effect that immediately sets state.
  const [initialCache] = useState<PublishedSnapshot | null>(() =>
    eventId === null ? null : readCache(eventId),
  );

  const [snapshot, setSnapshot] = useState<PublishedSnapshot | null>(initialCache);
  const [fromCache, setFromCache] = useState<boolean>(initialCache !== null);
  const [notPublished, setNotPublished] = useState(false);
  const [error, setError] = useState<ApiCallError | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const revisionRef = useRef<number | null>(initialCache?.publishedRevision ?? null);
  const failuresRef = useRef(0);
  const inFlightRef = useRef(false);

  const poll = useCallback(async (): Promise<void> => {
    if (eventId === null || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await getPublished(eventId, revisionRef.current);
      // A 204 (null) is a successful sync: freshness updates, the revision does not.
      if (result !== null) {
        revisionRef.current = result.publishedRevision;
        setSnapshot(result);
        setFromCache(false);
        writeCache(eventId, result);
        setClockOffsetMs(Date.parse(result.serverNow) - Date.now());
      }
      setNotPublished(false);
      setError(null);
      setLastSyncAt(Date.now());
      failuresRef.current = 0;
    } catch (cause) {
      if (cause instanceof ApiCallError && cause.code === 'NOT_PUBLISHED') {
        // Reaching the server and being told "not yet" IS a successful sync.
        setNotPublished(true);
        setError(null);
        setLastSyncAt(Date.now());
        failuresRef.current = 0;
      } else {
        setError(cause instanceof ApiCallError ? cause : new ApiCallError(0, null, 'Sync failed.'));
        failuresRef.current += 1;
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [eventId]);

  // The polling loop. Rescheduled after each attempt, so a slow response cannot stack calls.
  useEffect(() => {
    if (eventId === null || !enabled) return;
    let cancelled = false;
    let timer: number | null = null;

    const schedule = (): void => {
      if (cancelled) return;
      const failures = failuresRef.current;
      const delay =
        failures === 0
          ? POLL_MS
          : (BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)] ?? POLL_MS);
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (document.visibilityState === 'hidden') {
          // Hidden tabs do not poll at all (§16).
          schedule();
          return;
        }
        void poll().finally(schedule);
      }, delay);
    };

    void poll().finally(schedule);

    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      // Refresh immediately on focus rather than waiting out the interval.
      failuresRef.current = 0;
      void poll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [eventId, enabled, poll]);

  // One-second display ticker: the only clock source the UI reads. Local, no request, no write.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [enabled]);

  const age = lastSyncAt === null ? Number.POSITIVE_INFINITY : nowMs - lastSyncAt;
  const freshness: Freshness = age < AMBER_MS ? 'live' : age < RED_MS ? 'amber' : 'stale';

  return {
    snapshot,
    fromCache,
    notPublished,
    error,
    lastSyncAt,
    freshness,
    serverNowIso: isoOf(nowMs + clockOffsetMs),
    refresh: () => {
      failuresRef.current = 0;
      void poll();
    },
  };
};
