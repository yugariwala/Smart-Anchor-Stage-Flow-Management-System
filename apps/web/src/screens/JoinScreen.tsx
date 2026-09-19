/**
 * Invitation landing. Reads the secret out of the fragment, strips it from the address bar,
 * then consumes it once against the server (§12).
 *
 * The secret is read exactly once on mount and held in a ref, because `consumeInviteCode`
 * mutates the URL — a second read would find nothing and look like an invalid invitation.
 */

import { useEffect, useRef, useState } from 'react';

import { errorCopy, joinEvent } from '../lib/api';
import { consumeInviteCode, navigate } from '../lib/route';

export function JoinScreen({ eventId }: { eventId: string }) {
  const [message, setMessage] = useState('Joining the event…');
  const [failed, setFailed] = useState(false);
  const code = useRef<string | null | undefined>(undefined);
  const started = useRef(false);

  if (code.current === undefined) code.current = consumeInviteCode();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const secret = code.current;
    if (secret === null || secret === undefined) {
      setFailed(true);
      setMessage('That link has no invitation code. Ask the organizer for a new link.');
      return;
    }
    void (async () => {
      try {
        const result = await joinEvent(eventId, secret, crypto.randomUUID());
        if (result === null) {
          setFailed(true);
          setMessage('The server did not confirm the join. Ask the organizer for a new link.');
          return;
        }
        navigate(`#/anchor/${eventId}`);
      } catch (cause) {
        setFailed(true);
        setMessage(errorCopy(cause));
      }
    })();
  }, [eventId]);

  return (
    <div className="page">
      <h1>Joining as anchor</h1>
      <p className={failed ? 'notice notice-bad' : 'notice'} role="status">
        {message}
      </p>
      {failed ? (
        <>
          <p className="small muted">
            An invitation is single-use and valid for one hour. If someone else already used it,
            or it expired, the organizer needs to issue a new one.
          </p>
          <button type="button" onClick={() => navigate('#/')}>
            Back to start
          </button>
        </>
      ) : null}
    </div>
  );
}
