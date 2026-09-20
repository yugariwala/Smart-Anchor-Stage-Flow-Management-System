import { useState } from "react";
import { ClockIcon } from "@radix-ui/react-icons";
import type { EventState } from "@cuepilot/domain";
import type { Freshness } from "../lib/useSnapshotPoll";
import { useI18n } from "../lib/i18n";

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
  const { t } = useI18n();
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
      aria-label={t("Upcoming cue reminder")}
    >
      <ClockIcon />
      <div>
        <strong>
          {t("{cue} starts in {minutes} {unit}.", {
            cue: cue.title,
            minutes,
            unit: t(minutes === 1 ? "minute" : "minutes"),
          })}
        </strong>
        <p>
          {speaker
            ? t("Check that {speaker} is ready.", {
                speaker: speaker.displayName,
              })
            : t("Check that your host is ready.")}{" "}
          {t(
            "This is a timing reminder; shared readiness responses are not available yet.",
          )}
        </p>
        <div className="row">
          {onReplan ? (
            <button onClick={() => onReplan(cue.id)}>
              {t("Review recovery options")}
            </button>
          ) : (
            <span className="small muted">
              {t(
                "If they are not ready, tell the organizer before the cue starts.",
              )}
            </span>
          )}
          <button
            className="text-button"
            onClick={() => setDismissed(reminderId)}
          >
            {t("Hide this")}
          </button>
        </div>
      </div>
    </aside>
  );
}
