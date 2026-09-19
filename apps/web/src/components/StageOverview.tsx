import {
  renderOperationalCue,
  type EventState,
  type Speaker,
} from "@cuepilot/domain";
import { localTime } from "../lib/format";
import { FreshnessChip } from "./Freshness";
import type { Freshness } from "../lib/useSnapshotPoll";

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
      aria-label="Live stage overview"
    >
      <div className="stage-person">
        <span className="stage-eyebrow">ON STAGE</span>
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
            (view.current ? "Event host" : "Stage standby")}
        </h2>
        {speaker?.role && <p className="small muted">{speaker.role}</p>}
        {speaker?.pronunciationHint && (
          <p className="stage-pronunciation">
            <span>Pronunciation</span>
            {speaker.pronunciationHint}
          </p>
        )}
        <span className="small muted">
          {speaker ? "Assigned to the current cue" : "No speaker assigned"}
        </span>
      </div>
      <div className="stage-activity">
        <div className="row spread">
          <span className="stage-eyebrow">CURRENT ACTIVITY</span>
          <span className={`chip ${view.current ? "chip-ok" : "chip-info"}`}>
            {view.current
              ? "ACTIVE"
              : state.phase === "ended"
                ? "COMPLETE"
                : "STANDBY"}
          </span>
        </div>
        <h2 className="stage-cue-title">
          {view.current?.title ??
            (state.phase === "ended"
              ? "That’s a wrap."
              : state.phase === "draft"
                ? "Ready when you are."
                : "Between cues")}
        </h2>
        <p className="stage-window">
          {view.current
            ? `${view.current.startsAtLocal}–${view.current.endsAtLocal} IST · actual start / forecast end`
            : state.phase === "draft"
              ? "Review and publish your agenda to begin."
              : "Waiting for the next cue."}
        </p>
        {view.current && (
          <p className="small muted">
            Planned window:{" "}
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
          <span className="stage-eyebrow">UP NEXT</span>
          <strong>{view.next?.title ?? "Nothing further scheduled"}</strong>
          {view.next && (
            <p>
              {nextSpeaker?.displayName ?? "Event host"}{" "}
              <span>· {view.next.startsAtLocal} IST</span>
            </p>
          )}
        </div>
      </div>
      <div className="stage-timing">
        <span className="stage-eyebrow">
          {seconds !== null && seconds < 0
            ? "PAST FORECAST END"
            : "TIME REMAINING"}
        </span>
        <div
          className={`stage-countdown ${seconds !== null && seconds < 0 ? "is-overdue" : ""}`}
          aria-hidden="true"
        >
          {seconds === null ? "—:—" : countdown(seconds)}
        </div>
        <p className="small muted">
          {state.mode === "rehearsal"
            ? "Scenario clock · advances manually"
            : freshness !== "live"
              ? "Offline estimate · updates paused"
              : "Synced to the server clock"}
        </p>
        <dl className="stage-finishes">
          <div>
            <dt>Projected finish</dt>
            <dd>
              {view.projectedFinishLocal ?? "—"} <small>IST</small>
            </dd>
          </div>
          <div>
            <dt>Hard finish</dt>
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
