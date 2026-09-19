import type { EventState } from "@cuepilot/domain";
/** Display formatting only: the published phase and timestamps remain authoritative. */
export const eventTimingLabel = (state: EventState, nowMs: number): string => {
  if (state.phase === "ended") return "Event complete";
  if (state.mode === "rehearsal")
    return state.currentCueId
      ? "Rehearsal in progress"
      : "Rehearsal · scenario clock";
  if (state.currentCueId) return "Running now";
  const minutes = Math.ceil((Date.parse(state.startsAt) - nowMs) / 60_000);
  if (minutes > 0)
    return `Starts in ${minutes >= 60 ? `${Math.floor(minutes / 60)}h ` : ""}${minutes % 60}m`;
  return state.phase === "draft"
    ? "Scheduled start reached · unpublished"
    : "Between cues";
};
