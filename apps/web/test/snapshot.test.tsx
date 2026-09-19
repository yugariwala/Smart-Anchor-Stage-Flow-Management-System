import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/lib/auth", () => ({ idToken: vi.fn() }));
vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, getPublished: vi.fn() };
});
import {
  ApiCallError,
  getPublished,
  type PublishedSnapshot,
} from "../src/lib/api";
import {
  setStorageIdentity,
  writeStored,
  storageKey,
} from "../src/lib/storage";
import { useSnapshotPoll } from "../src/lib/useSnapshotPoll";
const snapshot = (): PublishedSnapshot => ({
  publishedRevision: 4,
  serverNow: new Date().toISOString(),
  state: {
    id: "event",
    ownerUid: "owner",
    name: "Test",
    revision: 4,
    cues: [],
    speakers: [],
    approvedScripts: [],
    announcements: [],
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
  } as PublishedSnapshot["state"],
});
beforeEach(() => {
  localStorage.clear();
  setStorageIdentity("owner");
  vi.mocked(getPublished).mockReset();
});
afterEach(cleanup);
it("fetches full state on cached mount, then treats 204 as a live sync", async () => {
  const value = snapshot();
  writeStored("snapshot:event", value);
  vi.mocked(getPublished).mockResolvedValueOnce(value).mockResolvedValue(null);
  const { result } = renderHook(() => useSnapshotPoll("event"));
  await waitFor(() => expect(result.current.fromCache).toBe(false));
  expect(getPublished).toHaveBeenNthCalledWith(1, "event", null);
  await act(async () => {
    result.current.refresh();
  });
  await waitFor(() => expect(getPublished).toHaveBeenCalledTimes(2));
  expect(getPublished).toHaveBeenLastCalledWith("event", 4);
  expect(result.current.snapshot?.publishedRevision).toBe(4);
  expect(result.current.freshness).toBe("live");
});
it("removes stale data when access is revoked", async () => {
  writeStored("snapshot:event", snapshot());
  vi.mocked(getPublished).mockRejectedValue(
    new ApiCallError(
      404,
      {
        error: { code: "NOT_FOUND", message: "Unavailable", retryable: false },
      },
      "",
    ),
  );
  const { result } = renderHook(() => useSnapshotPoll("event"));
  await waitFor(() => expect(result.current.snapshot).toBeNull());
  expect(localStorage.getItem(storageKey("snapshot:event"))).toBeNull();
  expect(result.current.error?.code).toBe("NOT_FOUND");
});
it("keeps a cache read-only during transport failure", async () => {
  const value = snapshot();
  value.serverNow = new Date(Date.now() - 20_000).toISOString();
  writeStored("snapshot:event", value);
  vi.mocked(getPublished).mockRejectedValue(
    new ApiCallError(0, null, "Network"),
  );
  const { result } = renderHook(() => useSnapshotPoll("event"));
  await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.snapshot?.publishedRevision).toBe(4);
  expect(result.current.fromCache).toBe(true);
  expect(result.current.freshness).toBe("stale");
});
it("does not poll a hidden document and refreshes on visibility recovery", async () => {
  let visible = false;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    visible ? "visible" : "hidden",
  );
  vi.mocked(getPublished).mockResolvedValue(snapshot());
  renderHook(() => useSnapshotPoll("event"));
  expect(getPublished).not.toHaveBeenCalled();
  await act(async () => {
    visible = true;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await waitFor(() => expect(getPublished).toHaveBeenCalledTimes(1));
});
