/**
 * Landing. Anonymous sign-in, then create a personal rehearsal event.
 *
 * §13: expiry and demo-capacity limits are shown before an organizer invests any work, and
 * the anonymous-identity caveat is stated rather than buried.
 */

import { useState } from 'react';

import { createEvent, errorCopy, health, type Health } from '../lib/api';
import { navigate } from '../lib/route';
import { useCommand } from '../lib/useCommand';

/** 10:00 IST on the fixture's date, expressed in UTC. */
const FIXTURE_START = '2026-09-19T04:30:00Z';

export function Landing({ uid }: { uid: string }) {
  const command = useCommand();
  const [status, setStatus] = useState<Health | null>(null);
  const [checked, setChecked] = useState(false);
  const [healthError, setHealthError] = useState('');
  const [joinUrl, setJoinUrl] = useState('');

  const checkHealth = async (): Promise<void> => {
    setChecked(false);
    setHealthError('');
    try {
      setStatus(await health());
    } catch (cause) {
      setHealthError(errorCopy(cause));
    } finally {
      setChecked(true);
    }
  };

  const create = async (): Promise<void> => {
    const eventId = crypto.randomUUID();
    const result = await command.run(`create:${eventId}`, (key) =>
      createEvent(
        eventId,
        {
          name: 'TechFest 2026 — Inaugural Session',
          startsAt: FIXTURE_START,
          hardEndMin: 60,
          mode: 'rehearsal',
          seed: 'blank',
        },
        key,
      ),
    );
    if (result !== null) navigate(`#/event/${eventId}/setup`);
  };

  const openJoinLink = (): void => {
    const trimmed = joinUrl.trim();
    if (trimmed.length === 0) return;
    const hash = trimmed.includes('#') ? trimmed.slice(trimmed.indexOf('#')) : trimmed;
    window.location.hash = hash;
  };

  return (
    <div className="page">
      <h1>CuePilot</h1>
      <p>
        When a segment overruns, CuePilot calculates a plan that protects fixed commitments and
        the hard finish, explains it, and publishes one approved revision to every screen at
        once {'—'} or refuses, with the shortage quantified.
      </p>

      <div className="card">
        <h2>Try the fictional rehearsal</h2>
        <p className="small muted">
          Signed in anonymously as <span className="mono">{uid}</span>.
        </p>
        <ul className="small">
          <li>The event, speakers and agenda are fictional. The clock is a scenario clock.</li>
          <li>Demo data is deleted automatically after 72 hours.</li>
          <li>
            Capacity limits apply: two new events per identity per day, and a shared project
            cap. A limit message is a real limit, not a failure.
          </li>
          <li>
            Anonymous identity is not a durable account. Clearing browser storage loses access
            to events it created. Do not use a shared device.
          </li>
        </ul>
        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() => void create()}
            disabled={command.status === 'pending'}
          >
            {command.status === 'pending' ? 'Creating…' : 'Create a rehearsal event'}
          </button>
          <button type="button" onClick={() => void checkHealth()}>
            Check API
          </button>
        </div>
        {command.message === '' ? null : (
          <p className="notice notice-bad small" role="alert">
            {command.message}
          </p>
        )}
        {!checked ? null : healthError !== '' ? (
          <p className="notice notice-bad small" role="status">
            {healthError}
          </p>
        ) : (
          <p className="notice small" role="status">
            API reachable {'·'} build <span className="mono">{status?.buildCommit}</span>
          </p>
        )}
      </div>

      <div className="card">
        <h2>Joining as an anchor?</h2>
        <p className="small muted">
          Paste the invitation link the organizer sent you. The secret travels in the link
          fragment and is never sent to the server.
        </p>
        <div className="field">
          <label htmlFor="joinUrl">Invitation link</label>
          <input
            id="joinUrl"
            type="text"
            value={joinUrl}
            onChange={(e) => setJoinUrl(e.target.value)}
            placeholder="https://.../#/join/..."
          />
        </div>
        <button type="button" onClick={openJoinLink} disabled={joinUrl.trim().length === 0}>
          Open invitation
        </button>
      </div>
    </div>
  );
}
