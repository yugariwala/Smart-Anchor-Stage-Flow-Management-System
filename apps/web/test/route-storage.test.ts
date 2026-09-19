import { beforeEach, describe, expect, it } from "vitest";
import { parseRoute, consumeInviteCode } from "../src/lib/route";
import {
  clearLocalData,
  readStored,
  setStorageIdentity,
  writeStored,
} from "../src/lib/storage";

beforeEach(() => {
  localStorage.clear();
  setStorageIdentity("owner");
});
describe("navigation boundaries", () => {
  it("recognizes every event route and rejects malformed paths", () => {
    for (const kind of [
      "setup",
      "console",
      "speakers",
      "scripts",
      "announcements",
      "history",
      "settings",
    ]) {
      expect(parseRoute(`#/event/test-event/${kind}`)).toEqual({
        kind,
        eventId: "test-event",
      });
    }
    for (const path of [
      "#/event/a/console/extra",
      "#/event/a/wrong",
      "#/anchor/a/extra",
      "#/unknown",
      "#/event/%2F/console",
    ])
      expect(parseRoute(path).kind).toBe("notfound");
    expect(parseRoute("#/")).toEqual({ kind: "landing" });
  });
  it("consumes the invite secret once while preserving the route", () => {
    history.replaceState(null, "", "/#/join/event-1?code=private&other=ok");
    expect(consumeInviteCode()).toBe("private");
    expect(window.location.hash).toBe("#/join/event-1?other=ok");
    expect(consumeInviteCode()).toBeNull();
  });
});
describe("identity-scoped local data", () => {
  it("never exposes another identity’s cache", () => {
    writeStored("snapshot:a", { secret: "owner data" });
    setStorageIdentity("anchor");
    expect(readStored("snapshot:a", null)).toBeNull();
    setStorageIdentity("owner");
    expect(readStored("snapshot:a", null)).toEqual({ secret: "owner data" });
  });
  it("clears CuePilot data on logout but preserves unrelated application storage", () => {
    writeStored("events", ["a"]);
    localStorage.setItem("other-app", "retained");
    clearLocalData();
    expect(readStored("events", [])).toEqual([]);
    expect(localStorage.getItem("other-app")).toBe("retained");
  });
  it("survives malformed storage", () => {
    localStorage.setItem("cuepilot:owner:events", "{broken");
    expect(readStored("events", [])).toEqual([]);
  });
});
