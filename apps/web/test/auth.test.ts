import { beforeEach, expect, test, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  auth: {
    currentUser: null as null | {
      uid: string;
      getIdToken: () => Promise<string>;
    },
    authStateReady: vi.fn(),
  },
  signInAnonymously: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("firebase/app", () => ({ initializeApp: vi.fn() }));
vi.mock("firebase/auth", () => ({
  getAuth: () => firebase.auth,
  signInAnonymously: firebase.signInAnonymously,
  signOut: firebase.signOut,
  onAuthStateChanged: vi.fn(),
}));
vi.mock("../src/lib/env", () => ({ config: { firebase: {} } }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  firebase.auth.currentUser = null;
  firebase.auth.authStateReady.mockResolvedValue(undefined);
});

test("concurrent callers share one anonymous sign-in after session restoration", async () => {
  const user = { uid: "first", getIdToken: async () => "token" };
  firebase.signInAnonymously.mockImplementation(async () => {
    firebase.auth.currentUser = user;
    return { user };
  });
  const { signIn } = await import("../src/lib/auth");
  expect(await Promise.all([signIn(), signIn(), signIn()])).toEqual([
    user,
    user,
    user,
  ]);
  expect(firebase.signInAnonymously).toHaveBeenCalledTimes(1);
});

test("uses the restored identity and rechecks a later cross-tab identity change", async () => {
  const first = { uid: "first", getIdToken: async () => "first-token" };
  const second = { uid: "second", getIdToken: async () => "second-token" };
  firebase.auth.authStateReady.mockImplementation(async () => {
    firebase.auth.currentUser ??= first;
  });
  const { idToken } = await import("../src/lib/auth");
  expect(await idToken()).toBe("first-token");
  firebase.auth.currentUser = second;
  expect(await idToken()).toBe("second-token");
  expect(firebase.signInAnonymously).not.toHaveBeenCalled();
});

test("a failed sign-in does not poison the next attempt", async () => {
  firebase.signInAnonymously.mockRejectedValueOnce(
    new Error("network unavailable"),
  );
  const { signIn } = await import("../src/lib/auth");
  await expect(signIn()).rejects.toThrow("network unavailable");
  const user = { uid: "retry", getIdToken: async () => "token" };
  firebase.signInAnonymously.mockResolvedValueOnce({ user });
  expect(await signIn()).toEqual(user);
});
