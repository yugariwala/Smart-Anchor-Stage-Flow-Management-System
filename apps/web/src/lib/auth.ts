/**
 * Anonymous Firebase identity.
 *
 * §15: clearing browser storage can lose access to an anonymous owner's event. This is a
 * short-lived demonstration identity, not a secure permanent account system, and the UI must
 * say so before an organizer invests work in an event.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth, type User } from 'firebase/auth';

import { config } from './env';

let app: FirebaseApp | null = null;

const firebaseAuth = (): Auth => {
  app ??= initializeApp(config.firebase);
  return getAuth(app);
};

/** Signs in anonymously, reusing the existing session when the browser already has one. */
export const signIn = async (): Promise<User> => {
  const auth = firebaseAuth();
  if (auth.currentUser !== null) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
};

export const watchUser = (onChange: (user: User | null) => void): (() => void) =>
  onAuthStateChanged(firebaseAuth(), onChange);

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
