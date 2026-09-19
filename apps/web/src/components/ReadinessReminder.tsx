import { useState } from "react";
import { ClockIcon } from "@radix-ui/react-icons";
import type { EventState } from "@cuepilot/domain";
import type { Freshness } from "../lib/useSnapshotPoll";

/** Display-only threshold over published timestamps. Never writes a readiness or schedule state. */
export function ReadinessReminder({
  state,
  nowAt,
  freshness,
  onReplan,
}: {
  state: EventState;
  nowAt: string;
  freshness: Freshness;
  onReplan?: (cueId: string) => void;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const cue = state.cues
    .slice()
    .sort((a, b) => a.order - b.order)
    .find((item) => item.status === "pending");
  if (!cue || state.phase !== "running" || freshness !== "live") return null;
  const remaining =
    Date.parse(state.startsAt) +
    cue.plannedStartMin * 60_000 -
    Date.parse(nowAt);
  // The time forms part of the key, so a newly published change to this cue reopens its reminder.
  const reminderId = `${cue.id}:${cue.plannedStartMin}`;
  if (remaining <= 0 || remaining > 300_000 || dismissed === reminderId)
    return null;
  const minutes = Math.ceil(remaining / 60_000);
  const speaker = state.speakers.find((person) => person.id === cue.speakerId);
  return (
    <aside
      className="readiness-reminder no-print"
      aria-label="Upcoming cue reminder"
    >
      <ClockIcon />
      <div>
        <strong>
          {cue.title} starts in {minutes} {minutes === 1 ? "minute" : "minutes"}
          .
        </strong>
        <p>
          {speaker
            ? `Check that ${speaker.displayName} is ready.`
            : "Check that your host is ready."}{" "}
          This is a timing reminder; shared readiness responses are not
          available yet.
        </p>
        <div className="row">
          {onReplan ? (
            <button onClick={() => onReplan(cue.id)}>
              Review recovery options
            </button>
          ) : (
            <span className="small muted">
              If they are not ready, tell the organizer before the cue starts.
            </span>
          )}
          <button
            className="text-button"
            onClick={() => setDismissed(reminderId)}
          >
            Dismiss on this screen
          </button>
        </div>
      </div>
    </aside>
  );
}
