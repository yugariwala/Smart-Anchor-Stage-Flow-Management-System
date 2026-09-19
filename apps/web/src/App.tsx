/**
 * Milestone 0b: a connectivity probe, not product UI.
 *
 * It proves three things end to end: anonymous Firebase sign-in works, the public health
 * endpoint is reachable, and an authenticated request is accepted with the server-verified
 * uid. No styling, no organizer console — those are M4.
 */

import { useCallback, useEffect, useState } from 'react';

import { ApiCallError, getEvent, health, type Health } from './lib/api';
import { signIn } from './lib/auth';

type Probe = { label: string; status: 'pending' | 'ok' | 'failed'; detail: string };

const initial: Probe[] = [
  { label: 'Anonymous Firebase sign-in', status: 'pending', detail: '' },
  { label: 'GET /v1/health (public)', status: 'pending', detail: '' },
  { label: 'Authenticated request (token verified server-side)', status: 'pending', detail: '' },
];

export function App() {
  const [probes, setProbes] = useState<Probe[]>(initial);
  const [running, setRunning] = useState(false);

  const update = (index: number, status: Probe['status'], detail: string): void => {
    setProbes((current) =>
      current.map((p, i) => (i === index ? { ...p, status, detail } : p)),
    );
  };

  const run = useCallback(async () => {
    setRunning(true);
    setProbes(initial);

    let uid: string | null = null;
    try {
      const user = await signIn();
      uid = user.uid;
      update(0, 'ok', `uid ${user.uid}`);
    } catch (cause) {
      update(0, 'failed', cause instanceof Error ? cause.message : 'unknown error');
      setRunning(false);
      return;
    }

    try {
      const result: Health = await health();
      update(1, 'ok', `buildCommit ${result.buildCommit}`);
    } catch (cause) {
      update(1, 'failed', cause instanceof Error ? cause.message : 'unknown error');
    }

    // A deliberately absent event id. A 404 proves the token was VERIFIED and the caller is
    // simply not a member; a 401 would mean verification failed. This is the authenticated
    // probe §12's endpoint inventory has no dedicated endpoint for.
    try {
      await getEvent(`probe-${crypto.randomUUID()}`);
      update(2, 'failed', 'expected 404 for an absent event, got a result');
    } catch (cause) {
      if (cause instanceof ApiCallError && cause.status === 404) {
        update(2, 'ok', `404 NOT_FOUND for an absent event, so the token verified as uid ${uid}`);
      } else if (cause instanceof ApiCallError && cause.status === 401) {
        update(2, 'failed', `401 ${cause.code}: the server rejected the token`);
      } else {
        update(2, 'failed', cause instanceof Error ? cause.message : 'unknown error');
      }
    }
    setRunning(false);
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <main>
      <h1>CuePilot</h1>
      <p>
        <strong>REHEARSAL &middot; fictional event and speakers &middot; scenario clock.</strong>
      </p>
      <p>
        Milestone 0b connectivity probe. This page is not the product; it exists to prove the
        browser can authenticate and reach the API.
      </p>
      <ul>
        {probes.map((probe) => (
          <li key={probe.label}>
            <code>
              {probe.status === 'pending' ? '...' : probe.status === 'ok' ? 'PASS' : 'FAIL'}
            </code>{' '}
            {probe.label}
            {probe.detail === '' ? null : <div>{probe.detail}</div>}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => void run()} disabled={running}>
        {running ? 'Running...' : 'Run again'}
      </button>
      <p>
        <small>
          Anonymous identity is a short-lived demonstration account. Clearing browser storage
          loses access to events it created. Demo data expires after 72 hours.
        </small>
      </p>
    </main>
  );
}
