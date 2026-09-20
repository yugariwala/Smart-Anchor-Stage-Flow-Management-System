import {
  renderOperationalCue,
  type EventState,
  type Speaker,
} from "@cuepilot/domain";
import { localTime } from "../lib/format";
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
  freshness,
  lastSyncAt = null,
  stage = false,
}: {
  state: EventState;
  nowAt: string;
  freshness: Freshness;
  /** When the snapshot behind these numbers last arrived, for the "as of" line. */
  lastSyncAt?: number | null;
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

  const currentCue = state.cues.find((c) => c.id === view.current?.cueId);
  const plannedStartLocal =
    view.current === null
      ? ""
      : localTime(
          state.startsAt,
          currentCue?.plannedStartMin ?? view.current.startMin,
        );
  const plannedEndLocal =
    view.current === null
      ? ""
      : localTime(
          state.startsAt,
          currentCue?.plannedEndMin ?? view.current.endMin,
        );
  const plannedDiffers =
    view.current !== null &&
    (plannedStartLocal !== view.current.startsAtLocal ||
      plannedEndLocal !== view.current.endsAtLocal);

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
            (view.current ? "Event host" : "Nobody on stage")}
        </h2>
        {speaker?.role && <p className="small muted">{speaker.role}</p>}
        {speaker?.pronunciationHint && (
          <p className="stage-pronunciation">
            <span>Pronunciation</span>
            {speaker.pronunciationHint}
          </p>
        )}
        {/*
          Saying "No speaker assigned" directly beneath a name read as a
          contradiction. With a session running but no named speaker, the heading
          above already says who has the stage.
        */}
        <span className="small muted">
          {speaker
            ? "Speaking now"
            : view.current
              ? "Hosted by your anchor"
              : "Waiting to start"}
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
                : "Nothing on stage yet")}
        </h2>
        <p className="stage-window">
          {view.current
            ? `${view.current.startsAtLocal}–${view.current.endsAtLocal} IST · started / expected to end`
            : state.phase === "draft"
              ? "Review and publish your agenda to begin."
              : "Waiting for the next session."}
        </p>
        {/*
          The planned window is only worth a line when it DIFFERS from what is actually
          happening. Printing the same two times twice under different labels was noise
          on a phone held at arm's length.
        */}
        {plannedDiffers && (
          <p className="small muted">
            Planned: {plannedStartLocal}–{plannedEndLocal} IST
          </p>
        )}
      </div>
      {/*
        `up next` is a sibling of the activity block rather than a child of it, so the
        mobile stack can place the countdown between them. On a 390-wide phone the
        countdown was previously clipped at the fold — it is the single thing an anchor
        checks most often.
      */}
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
      <div className="stage-timing">
        <span className="stage-eyebrow">
          {seconds !== null && seconds < 0 ? "RUNNING OVER" : "TIME REMAINING"}
        </span>
        <div
          className={`stage-countdown ${seconds !== null && seconds < 0 ? "is-overdue" : ""}`}
          aria-hidden="true"
        >
          {seconds === null ? "—:—" : countdown(seconds)}
        </div>
        <p className="small muted">
          {state.mode === "rehearsal"
            ? "Practice clock — you move it"
            : freshness !== "live"
              ? "Offline estimate · updates paused"
              : "Synced to the server clock"}
        </p>
        {/*
          "Is this current?" was answerable only by hunting for the chip at the top of the
          page. This answers it where the eye already is, in words rather than a colour.
        */}
        {lastSyncAt === null ? null : (
          <p className="small muted stage-asof">
            {freshness === "live" ? "Updated" : "Last updated"}{" "}
            {new Date(lastSyncAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        )}
        <dl className="stage-finishes">
          <div>
            <dt>Projected finish</dt>
            <dd>
              {view.projectedFinishLocal ?? "—"} <small>IST</small>
            </dd>
          </div>
          <div>
            <dt>Must finish by</dt>
            <dd>
              {localTime(state.startsAt, state.hardEndMin)} <small>IST</small>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
