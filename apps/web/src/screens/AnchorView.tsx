/**
 * Anchor View. Read-only, mobile portrait, dark, large type.
 *
 * Everything on screen comes from `renderOperationalCue` over the published snapshot — the
 * one domain function the frontend is allowed to call, because it derives current/up-next
 * from structured state and never parses generated prose (§24).
 *
 * The countdown is local, from the server-clock offset, and is `aria-hidden` so a screen
 * reader is not told the time every second (§20). A separate polite live region announces
 * only revision changes.
 */

import { renderOperationalCue } from '@cuepilot/domain';
import { useEffect, useRef, useState } from 'react';

import { acknowledge, errorCopy } from '../lib/api';
import { useSnapshotPoll } from '../lib/useSnapshotPoll';
import { FreshnessChip, StaleSnapshotNotice } from '../components/Freshness';
import { RehearsalBanner } from '../components/RehearsalBanner';

const mmss = (totalSeconds: number): string => {
  const sign = totalSeconds < 0 ? '-' : '';
  const s = Math.abs(totalSeconds);
  const m = Math.floor(s / 60);
  return `${sign}${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function AnchorView({ eventId }: { eventId: string }) {
  const poll = useSnapshotPoll(eventId);
  const [ackedRevision, setAckedRevision] = useState<number | null>(null);
  const [ackError, setAckError] = useState<string>('');
  const [ackPending, setAckPending] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const lastAnnounced = useRef<number | null>(null);

  const snapshot = poll.snapshot;
  const revision = snapshot?.publishedRevision ?? null;

  // Polite announcement on a NEW revision only — never a per-second timer (§20).
  useEffect(() => {
    if (revision === null || lastAnnounced.current === revision) return;
    const first = lastAnnounced.current === null;
    lastAnnounced.current = revision;
    setAnnouncement(
      first ? `Runbook loaded, revision ${revision}.` : `Updated: revision ${revision} published.`,
    );
  }, [revision]);

  if (snapshot === null) {
    return (
      <main className="anchor">
        <h1 className="anchor-title">CuePilot</h1>
        {poll.notPublished ? (
          <p className="anchor-line" role="status">
            Waiting for the organizer to publish the runbook.
          </p>
        ) : poll.error !== null ? (
          <p className="anchor-line" role="status">
            {errorCopy(poll.error)}
          </p>
        ) : (
          <p className="anchor-line" role="status">
            Loading the published runbook{'…'}
          </p>
        )}
      </main>
    );
  }

  const state = snapshot.state;
  // The scenario clock in rehearsal, otherwise the server clock estimated locally.
  const nowAt =
    state.mode === 'rehearsal' && state.scenarioNowAt !== null
      ? state.scenarioNowAt
      : poll.serverNowIso;
  const view = renderOperationalCue(state, nowAt);

  const secondsLeft =
    view.current === null ? null : (view.current.endMin - view.nowMin) * 60;
  const behind = ackedRevision !== null && ackedRevision < snapshot.publishedRevision;

  const onAcknowledge = async (): Promise<void> => {
    setAckPending(true);
    setAckError('');
    try {
      const result = await acknowledge(eventId, snapshot.publishedRevision);
      if (result !== null) setAckedRevision(result.acknowledgedRevision);
    } catch (cause) {
      setAckError(errorCopy(cause));
    } finally {
      setAckPending(false);
    }
  };

  return (
    <main className="anchor">
      <RehearsalBanner mode={state.mode} />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="row spread">
        <FreshnessChip freshness={poll.freshness} revision={snapshot.publishedRevision} />
        {view.scheduleHealth === 'needs_repair' ? (
          <span className="chip chip-warn">Schedule needs repair</span>
        ) : null}
        {poll.fromCache ? <span className="chip chip-bad">Cached copy</span> : null}
      </div>

      <StaleSnapshotNotice
        freshness={poll.freshness}
        revision={snapshot.publishedRevision}
        lastSyncAt={poll.lastSyncAt}
      />

      <section className="anchor-now">
        <p className="anchor-label">Now</p>
        {view.current === null ? (
          <>
            <h1 className="anchor-title">{state.phase === 'ended' ? 'Event complete' : 'Between cues'}</h1>
            {state.phase === 'ended' ? null : (
              <p className="anchor-time muted">Waiting for the organizer to start the next cue.</p>
            )}
          </>
        ) : (
          <>
            <h1 className="anchor-title">{view.current.title}</h1>
            <p className="anchor-time">
              {view.current.startsAtLocal}{'–'}{view.current.endsAtLocal}
              {secondsLeft === null ? null : (
                <>
                  {' '}
                  <span aria-hidden="true">({mmss(secondsLeft)} left)</span>
                </>
              )}
            </p>
          </>
        )}
      </section>

      <section className="anchor-now anchor-next">
        <p className="anchor-label">Up next</p>
        {view.next === null ? (
          <h2 className="anchor-title">Nothing further scheduled</h2>
        ) : (
          <>
            <h2 className="anchor-title">{view.next.title}</h2>
            <p className="anchor-time">from {view.next.startsAtLocal}</p>
          </>
        )}
      </section>

      <p className="anchor-line">{view.line}</p>

      <section className="anchor-now">
        <p className="anchor-label">Approved script</p>
        <p className="muted">
          Approved host copy appears here once the organizer reviews and approves it.
        </p>
      </section>

      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => void onAcknowledge()}
          disabled={ackPending || ackedRevision === snapshot.publishedRevision}
        >
          {ackPending
            ? 'Acknowledging…'
            : ackedRevision === snapshot.publishedRevision
              ? `Acknowledged revision ${snapshot.publishedRevision}`
              : `Acknowledge revision ${snapshot.publishedRevision}`}
        </button>
        {behind ? (
          <span className="chip chip-warn">
            Behind: you acknowledged revision {ackedRevision}
          </span>
        ) : null}
      </div>
      {ackError === '' ? null : (
        <p className="notice notice-bad small" role="alert">
          {ackError}
        </p>
      )}

      <p className="muted small">
        Acknowledgement confirms you received this revision. It does not confirm the words have
        been spoken.
      </p>
    </main>
  );
}
