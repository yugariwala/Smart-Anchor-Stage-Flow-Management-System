/**
 * Anonymous Firebase identity.
 *
 * §15: clearing browser storage can lose access to an anonymous owner's event. This is a
 * short-lived demonstration identity, not a secure permanent account system, and the UI says
 * so before an organizer invests work in an event.
 *
 * TWO RACES this module has to avoid, both of which silently create a SECOND anonymous user
 * and therefore lose the organizer's event on a plain page refresh:
 *
 *  1. `auth.currentUser` is null immediately after `getAuth()` even when a user IS persisted,
 *     because Firebase restores the session asynchronously. Checking it directly and finding
 *     null means "not restored yet", not "no user". `authStateReady()` is the wait.
 *  2. React StrictMode double-invokes mount effects, so two concurrent callers can both pass
 *     the check and both call `signInAnonymously`. The in-flight promise is shared so a
 *     concurrent caller joins the same sign-in instead of starting another.
 *
 * Found by a live browser run: a reload was producing a new uid and orphaning the event.
 */

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from "firebase/auth";

import { config } from "./env";

let app: FirebaseApp | null = null;
let pending: Promise<User> | null = null;

const firebaseAuth = (): Auth => {
  app ??= initializeApp(config.firebase);
  return getAuth(app);
};

const doSignIn = async (): Promise<User> => {
  const auth = firebaseAuth();
  // Wait for the persisted session to be restored before deciding whether to create one.
  await auth.authStateReady();
  if (auth.currentUser !== null) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
};

/** Signs in anonymously, reusing the persisted session when the browser already has one. */
export const signIn = async (): Promise<User> => {
  pending ??= doSignIn().finally(() => {
    // Deduplicate in-flight sign-ins, but recheck Firebase after cross-tab session changes.
    pending = null;
  });
  return pending;
};

export const watchUser = (
  onChange: (user: User | null) => void,
): (() => void) => onAuthStateChanged(firebaseAuth(), onChange);

/**
 * A fresh ID token for the Authorization header.
 *
 * Never cached by this module: the Firebase SDK already refreshes it, and holding a copy is
 * how a stale token ends up producing a confusing 401.
 */
export const idToken = async (): Promise<string> => {
  const user = await signIn();
  return user.getIdToken();
};

export const signOut = async (): Promise<void> => {
  await firebaseSignOut(firebaseAuth());
  pending = null;
};
