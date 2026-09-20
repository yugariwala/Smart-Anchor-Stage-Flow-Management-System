import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventState } from "@cuepilot/domain";
import fixture from "../../../fixtures/college-demo-v1.json";
import { StageOverview } from "../src/components/StageOverview";
import { ReadinessReminder } from "../src/components/ReadinessReminder";
import { eventTimingLabel } from "../src/lib/displayTime";
afterEach(cleanup);
const state = fixture as EventState;
const at = (minute: number) =>
  new Date(Date.parse(state.startsAt) + minute * 60_000).toISOString();
describe("stage display", () => {
  it("renders the actual speaker and an aria-hidden countdown without changing the schedule", () => {
    const before = JSON.stringify(state);
    const { container } = render(
      <StageOverview state={state} nowAt={at(20)} freshness="live" />,
    );
    expect(
      screen.getByRole("heading", {
        name: state.speakers.find((s) => s.id === "spk-mehta")!.displayName,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Keynote")).toBeTruthy();
    expect(screen.getByText("Audience Q&A")).toBeTruthy();
    expect(
      container.querySelector(".stage-countdown")?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(JSON.stringify(state)).toBe(before);
  });
  it("uses a fallback when no speaker is assigned", () => {
    const value = {
      ...state,
      cues: state.cues.map((cue) => ({ ...cue, speakerId: null })),
    };
    render(<StageOverview state={value} nowAt={at(20)} freshness="live" />);
    expect(screen.getByRole("heading", { name: "Event host" })).toBeTruthy();
    expect(screen.getByText("Hosted by your anchor")).toBeTruthy();
  });
});
describe("five-minute timing reminder", () => {
  it("uses the rehearsal clock and offers recovery without invoking an API", () => {
    const callback = vi.fn();
    render(
      <ReadinessReminder
        state={state}
        nowAt={at(20)}
        freshness="live"
        onReplan={callback}
      />,
    );
    expect(screen.getByText("Audience Q&A starts in 5 minutes.")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Review recovery options" }),
    );
    expect(callback).toHaveBeenCalledWith("qa");
    fireEvent.click(screen.getByRole("button", { name: "Hide this" }));
    expect(screen.queryByRole("complementary")).toBeNull();
  });
  it("does not show a reminder outside the window or from stale data", () => {
    const { rerender } = render(
      <ReadinessReminder state={state} nowAt={at(19)} freshness="live" />,
    );
    expect(screen.queryByRole("complementary")).toBeNull();
    rerender(
      <ReadinessReminder state={state} nowAt={at(20)} freshness="stale" />,
    );
    expect(screen.queryByRole("complementary")).toBeNull();
    rerender(
      <ReadinessReminder state={state} nowAt={at(25)} freshness="live" />,
    );
    expect(screen.queryByRole("complementary")).toBeNull();
  });
  it("reopens a dismissed reminder when a published repair moves the cue", () => {
    const { rerender } = render(
      <ReadinessReminder state={state} nowAt={at(20)} freshness="live" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide this" }));
    const repaired = {
      ...state,
      cues: state.cues.map((c) =>
        c.id === "qa" ? { ...c, plannedStartMin: 26 } : c,
      ),
    };
    rerender(
      <ReadinessReminder state={repaired} nowAt={at(21)} freshness="live" />,
    );
    expect(screen.getByRole("complementary")).toBeTruthy();
  });
});
describe("event card timing labels", () => {
  it("shows real start countdowns without confusing a rehearsal with live operation", () => {
    const future = {
      ...state,
      phase: "draft" as const,
      mode: "live" as const,
      currentCueId: null,
    };
    expect(eventTimingLabel(future, Date.parse(at(-134)))).toBe(
      "Starts in 2h 14m",
    );
    expect(eventTimingLabel(state, Date.parse(at(99)))).toBe(
      "Rehearsal in progress",
    );
    expect(
      eventTimingLabel({ ...state, mode: "live" }, Date.parse(at(20))),
    ).toBe("Running now");
    expect(
      eventTimingLabel({ ...state, phase: "ended" }, Date.parse(at(20))),
    ).toBe("Event complete");
  });
});
