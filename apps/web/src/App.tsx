import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "@radix-ui/themes";
import { errorCopy } from "./lib/api";
import { signIn, signOut, watchUser } from "./lib/auth";
import { missingConfig } from "./lib/env";
import { useRoute, navigate } from "./lib/route";
import { clearLocalData, setStorageIdentity } from "./lib/storage";
import { Shell } from "./components/Shell";
import { EmptyState, ErrorBoundary, Loading } from "./components/UI";
const AnchorView = lazy(() => import('./screens/AnchorView').then(module => ({ default: module.AnchorView })));
const JoinScreen = lazy(() => import('./screens/JoinScreen').then(module => ({ default: module.JoinScreen })));
const Landing = lazy(() => import('./screens/Landing').then(module => ({ default: module.Landing })));
const OrganizerConsole = lazy(() => import('./screens/OrganizerConsole').then(module => ({ default: module.OrganizerConsole })));
const SetupScreen = lazy(() => import('./screens/SetupScreen').then(module => ({ default: module.SetupScreen })));
const EventPages = lazy(() => import('./screens/EventPages').then(module => ({ default: module.EventPages })));
const Help = lazy(() => import('./screens/Help').then(module => ({ default: module.Help })));

export function App() {
  const route = useRoute();
  const [uid, setUid] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(missingConfig.length === 0);
  const [signedOut, setSignedOut] = useState(false);
  const login = useCallback(async () => {
    setLoading(true);
    setAuthError("");
    try {
      const user = await signIn();
      setStorageIdentity(user.uid);
      setUid(user.uid);
      setSignedOut(false);
    } catch (cause) {
      setAuthError(errorCopy(cause));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (missingConfig.length) return;
    // Firebase is an external system; restore it before mounting data pages.
    // oxlint-disable-next-line react/set-state-in-effect
    void login();
    return watchUser((user) => {
      if (user) {
        setStorageIdentity(user.uid);
        setUid(user.uid);
      } else setUid(null);
    });
  }, [login]);
  const logout = async () => {
    await signOut();
    clearLocalData();
    setStorageIdentity("");
    setUid(null);
    setSignedOut(true);
    navigate("#/session");
  };
  if (missingConfig.length)
    return (
      <div className="auth-page">
        <div className="auth-card">
          <a className="brand" href="#/">
            CuePilot<span className="brand-beta">SETUP</span>
          </a>
          <h1>Connect your workspace.</h1>
          <p className="muted">
            Firebase and API configuration are required before your event data
            can load.
          </p>
          <div className="notice notice-warn">
            <strong>Missing public configuration</strong>
            <ul>
              {missingConfig.map((name) => (
                <li className="mono small" key={name}>
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <p>
            Copy <code>apps/web/.env.example</code> to{" "}
            <code>apps/web/.env.local</code>, enter your project values, then
            restart Vite.
          </p>
          <p className="small muted">
            Enable Firebase anonymous authentication and authorize this domain.
            Server secrets do not belong in frontend configuration.
          </p>
          <button onClick={() => window.location.reload()}>
            Check configuration again
          </button>
        </div>
      </div>
    );
  if (loading)
    return (
      <div className="auth-page">
        <Loading label="Restoring your secure session" />
      </div>
    );
  if (!uid)
    return (
      <div className="auth-page">
        <div className="auth-card">
          <span className="brand">CuePilot</span>
          <h1>{signedOut ? "You’re signed out." : "Your stage awaits."}</h1>
          <p className="muted">
            {signedOut
              ? "Local event shortcuts and offline snapshots have been cleared."
              : "Continue with an anonymous browser identity to create or join an event."}
          </p>
          {authError && (
            <p className="notice notice-bad" role="alert">
              {authError}
            </p>
          )}
          <Button size="3" onClick={() => void login()}>
            {authError ? "Retry sign-in" : "Start a new session"}
          </Button>
          <p className="small muted">
            Anonymous sessions cannot be recovered after sign-out. No email or
            password is required.
          </p>
        </div>
      </div>
    );
  const key = `${uid}:${route.kind}:${"eventId" in route ? route.eventId : ""}`;
  let content;
  switch (route.kind) {
    case "anchor":
      content = <AnchorView eventId={route.eventId} uid={uid} />;
      break;
    case "join":
      content = <JoinScreen eventId={route.eventId} />;
      break;
    case "console":
      content = <OrganizerConsole eventId={route.eventId} uid={uid} />;
      break;
    case "setup":
      content = <SetupScreen eventId={route.eventId} />;
      break;
    case "speakers":
    case "scripts":
    case "announcements":
    case "history":
    case "settings":
      content = <EventPages eventId={route.eventId} page={route.kind} />;
      break;
    case "help":
      content = <Help />;
      break;
    case "session":
      content = (
        <div className="page">
          <EmptyState
            title="Your session is active"
            description="You’re using an anonymous browser identity. Use Sign out in navigation to leave this workspace."
            action={
              <a className="button-link" href="#/">
                Go to your events
              </a>
            }
          />
        </div>
      );
      break;
    case "notfound":
      content = (
        <div className="page">
          <EmptyState
            title="We couldn’t find that page."
            description="The link may be incomplete. Return to your workspace or open an invitation from your organizer."
            action={
              <a className="button-link" href="#/">
                Back to your events
              </a>
            }
          />
        </div>
      );
      break;
    default:
      content = <Landing uid={uid} />;
  }
  return (
    <Shell route={route} uid={uid} onSignOut={logout}>
      <ErrorBoundary key={key}><Suspense fallback={<Loading label="Opening page" />}>{content}</Suspense></ErrorBoundary>
    </Shell>
  );
}
