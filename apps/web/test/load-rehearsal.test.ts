import { describe, expect, it } from "vitest";
import type { EventState } from "@cuepilot/domain";
import fixture from "../../../fixtures/college-demo-v1.json";
import {
  planLoadRehearsal,
  rehearsalClockIso,
} from "../src/lib/loadRehearsal";

const base = fixture as EventState;

const pendingState = (overrides: Partial<EventState> = {}): EventState => ({
  ...base,
  phase: "draft",
  revision: 1,
  currentCueId: null,
  activeForecastEndMin: null,
  scenarioNowAt: base.startsAt,
  cues: base.cues.map((cue) => ({
    ...cue,
    status: "pending" as const,
    actualStartAt: null,
    actualEndAt: null,
    actualTimeSource: null,
  })),
  ...overrides,
});

describe("load rehearsal at keynote", () => {
  it("plans only the normal commands for a pristine seeded draft", () => {
    expect(planLoadRehearsal(pendingState())).toEqual([
      { kind: "publish" },
      { kind: "start", cueId: "opening" },
      { kind: "clock", targetMin: 5 },
      { kind: "complete", cueId: "opening" },
      { kind: "start", cueId: "keynote" },
      { kind: "clock", targetMin: 25 },
    ]);
  });

  it("resumes mid-sequence: after publish, with the opening active", () => {
    const state = pendingState({
      phase: "running",
      scenarioNowAt: new Date(
        Date.parse(base.startsAt) + 2 * 60_000,
      ).toISOString(),
      cues: base.cues.map((cue) =>
        cue.id === "opening"
          ? {
              ...cue,
              status: "active" as const,
              actualStartAt: base.startsAt,
              actualTimeSource: "rehearsal_clock" as const,
            }
          : { ...cue, status: "pending" as const },
      ),
    });
    expect(planLoadRehearsal(state)).toEqual([
      { kind: "clock", targetMin: 5 },
      { kind: "complete", cueId: "opening" },
      { kind: "start", cueId: "keynote" },
      { kind: "clock", targetMin: 25 },
    ]);
  });

  it("resumes after the opening is completed", () => {
    const state = pendingState({
      phase: "running",
      scenarioNowAt: new Date(
        Date.parse(base.startsAt) + 5 * 60_000,
      ).toISOString(),
      cues: base.cues.map((cue) =>
        cue.id === "opening"
          ? { ...cue, status: "completed" as const }
          : { ...cue, status: "pending" as const },
      ),
    });
    expect(planLoadRehearsal(state)).toEqual([
      { kind: "start", cueId: "keynote" },
      { kind: "clock", targetMin: 25 },
    ]);
  });

  it("has nothing to plan once the keynote is active or the event is live/ended", () => {
    expect(planLoadRehearsal(base)).toEqual([]);
    expect(planLoadRehearsal(pendingState({ mode: "live" }))).toEqual([]);
    expect(
      planLoadRehearsal(pendingState({ phase: "ended" as const })),
    ).toEqual([]);
  });

  it("renders a minute offset as an absolute scenario instant", () => {
    expect(rehearsalClockIso(base.startsAt, 5)).toBe("2026-09-19T04:35:00Z");
    expect(rehearsalClockIso(base.startsAt, 25)).toBe("2026-09-19T04:55:00Z");
  });
});
