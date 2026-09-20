import {
  renderOperationalCue,
  type EventState,
  type Speaker,
} from "@cuepilot/domain";
import { localTime } from "../lib/format";
import { FreshnessChip } from "./Freshness";
import type { Freshness } from "../lib/useSnapshotPoll";
import { useI18n } from "../lib/i18n";

// Presentation contract only. The current backend does not supply photos or roles.
type StageSpeaker = Speaker & { photoUrl?: string; role?: string };
const countdown = (seconds: number) => {
  const value = Math.abs(seconds);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};
export function StageOverview({
  state,
  nowAt,
  revision,
  freshness,
  stage = false,
}: {
  state: EventState;
  nowAt: string;
  revision: number | null;
  freshness: Freshness;
  stage?: boolean;
}) {
  const { t } = useI18n();
  const view = renderOperationalCue(state, nowAt);
  const speaker = state.speakers.find(
    (person) => person.id === view.current?.speakerId,
  ) as StageSpeaker | undefined;
  const nextSpeaker = state.speakers.find(
    (person) => person.id === view.next?.speakerId,
  );
  const seconds = view.current
    ? Math.ceil(
        (Date.parse(state.startsAt) +
          view.current.endMin * 60_000 -
          Date.parse(nowAt)) /
          1000,
      )
    : null;
  const initials =
    speaker?.displayName
      .split(/\s+/)
      .map((word) => word[0])
      .slice(0, 2)
      .join("") ?? "CP";
  const photo =
    speaker?.photoUrl && /^https?:\/\//.test(speaker.photoUrl)
      ? speaker.photoUrl
      : null;
  return (
    <section
      className={`stage-overview ${stage ? "stage-overview-dark" : ""}`}
      aria-label={t("Live stage overview")}
    >
      <div className="stage-person">
        <span className="stage-eyebrow">{t("ON STAGE")}</span>
        {photo ? (
          <img
            className="stage-portrait"
            src={photo}
            alt={speaker?.displayName ?? ""}
          />
        ) : (
          <span className="stage-initials" aria-hidden="true">
            {initials}
          </span>
        )}
        <h2>
          {speaker?.displayName ??
            (view.current ? t("Event host") : t("Stage standby"))}
        </h2>
        {speaker?.role && <p className="small muted">{speaker.role}</p>}
        {speaker?.pronunciationHint && (
          <p className="stage-pronunciation">
            <span>{t("Pronunciation")}</span>
            {speaker.pronunciationHint}
          </p>
        )}
        <span className="small muted">
          {speaker
            ? t("Assigned to the current cue")
            : t("No speaker assigned")}
        </span>
      </div>
      <div className="stage-activity">
        <div className="row spread">
          <span className="stage-eyebrow">{t("CURRENT ACTIVITY")}</span>
          <span className={`chip ${view.current ? "chip-ok" : "chip-info"}`}>
            {view.current
              ? t("ACTIVE")
              : state.phase === "ended"
                ? t("COMPLETE")
                : t("STANDBY")}
          </span>
        </div>
        <h2 className="stage-cue-title">
          {view.current?.title ??
            (state.phase === "ended"
              ? t("That’s a wrap.")
              : state.phase === "draft"
                ? t("Ready when you are.")
                : t("Between cues"))}
        </h2>
        <p className="stage-window">
          {view.current
            ? t("{start}–{end} IST · actual start / forecast end", {
                start: view.current.startsAtLocal,
                end: view.current.endsAtLocal,
              })
            : state.phase === "draft"
              ? t("Review and publish your agenda to begin.")
              : t("Waiting for the next cue.")}
        </p>
        {view.current && (
          <p className="small muted">
            {t("Planned window:")}{" "}
            {localTime(
              state.startsAt,
              state.cues.find((c) => c.id === view.current?.cueId)
                ?.plannedStartMin ?? view.current.startMin,
            )}
            –
            {localTime(
              state.startsAt,
              state.cues.find((c) => c.id === view.current?.cueId)
                ?.plannedEndMin ?? view.current.endMin,
            )}{" "}
            IST
          </p>
        )}
        <div className="stage-up-next">
          <span className="stage-eyebrow">{t("UP NEXT")}</span>
          <strong>{view.next?.title ?? t("Nothing further scheduled")}</strong>
          {view.next && (
            <p>
              {nextSpeaker?.displayName ?? t("Event host")}{" "}
              <span>· {view.next.startsAtLocal} IST</span>
            </p>
          )}
        </div>
      </div>
      <div className="stage-timing">
        <span className="stage-eyebrow">
          {seconds !== null && seconds < 0
            ? t("PAST FORECAST END")
            : t("TIME REMAINING")}
        </span>
        <div
          className={`stage-countdown ${seconds !== null && seconds < 0 ? "is-overdue" : ""}`}
          aria-hidden="true"
        >
          {seconds === null ? "—:—" : countdown(seconds)}
        </div>
        <p className="small muted">
          {state.mode === "rehearsal"
            ? t("Scenario clock · advances manually")
            : freshness !== "live"
              ? t("Offline estimate · updates paused")
              : t("Synced to the server clock")}
        </p>
        <dl className="stage-finishes">
          <div>
            <dt>{t("Projected finish")}</dt>
            <dd>
              {view.projectedFinishLocal ?? "—"} <small>IST</small>
            </dd>
          </div>
          <div>
            <dt>{t("Hard finish")}</dt>
            <dd>
              {localTime(state.startsAt, state.hardEndMin)} <small>IST</small>
            </dd>
          </div>
        </dl>
        <FreshnessChip freshness={freshness} revision={revision} />
      </div>
    </section>
  );
}
