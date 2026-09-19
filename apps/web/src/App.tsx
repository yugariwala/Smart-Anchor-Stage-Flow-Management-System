/**
 * Shell: anonymous sign-in, then hash routing to one of the screens.
 *
 * Sign-in happens once, before any screen renders, because every authenticated call needs a
 * token and a screen that renders first would fire a burst of 401s.
 */

import { useEffect, useState } from 'react';

import { errorCopy } from './lib/api';
import { signIn } from './lib/auth';
import { useRoute } from './lib/route';
import { AnchorView } from './screens/AnchorView';
import { JoinScreen } from './screens/JoinScreen';
import { Landing } from './screens/Landing';
import { OrganizerConsole } from './screens/OrganizerConsole';
import { SetupScreen } from './screens/SetupScreen';

export function App() {
  const route = useRoute();
  const [uid, setUid] = useState<string | null>(null);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await signIn();
        if (!cancelled) setUid(user.uid);
      } catch (cause) {
        if (!cancelled) setAuthError(errorCopy(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (authError !== '') {
    return (
      <div className="page">
        <h1>CuePilot</h1>
        <p className="notice notice-bad" role="alert">
          Could not sign in: {authError}
        </p>
        <p className="small muted">
          Check that anonymous authentication is enabled for the Firebase project and that this
          origin is an authorized domain.
        </p>
      </div>
    );
  }

  if (uid === null) {
    return (
      <div className="page">
        <h1>CuePilot</h1>
        <p role="status">Signing in{'…'}</p>
      </div>
    );
  }

  switch (route.kind) {
    case 'anchor':
      return <AnchorView eventId={route.eventId} />;
    case 'join':
      return <JoinScreen eventId={route.eventId} />;
    case 'console':
      return <OrganizerConsole eventId={route.eventId} uid={uid} />;
    case 'setup':
      return <SetupScreen eventId={route.eventId} />;
    case 'landing':
    default:
      return <Landing uid={uid} />;
  }
}
