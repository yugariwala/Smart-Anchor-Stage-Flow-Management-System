import type { EventState } from "@cuepilot/domain";

type Translate = (
  source: string,
  variables?: Record<string, string | number>,
) => string;
/** Display formatting only: the published phase and timestamps remain authoritative. */
export const eventTimingLabel = (
  state: EventState,
  nowMs: number,
  t: Translate = (source, variables = {}) =>
    source.replace(/\{(\w+)\}/g, (_, key: string) =>
      String(variables[key] ?? `{${key}}`),
    ),
): string => {
  if (state.phase === "ended") return t("Event complete");
  if (state.mode === "rehearsal")
    return state.currentCueId
      ? t("Rehearsal in progress")
      : t("Rehearsal · scenario clock");
  if (state.currentCueId) return t("Running now");
  const minutes = Math.ceil((Date.parse(state.startsAt) - nowMs) / 60_000);
  if (minutes > 0)
    return t("Starts in {time}", {
      time: `${minutes >= 60 ? `${Math.floor(minutes / 60)}h ` : ""}${minutes % 60}m`,
    });
  return state.phase === "draft"
    ? t("Scheduled start reached · unpublished")
    : t("Between cues");
};
