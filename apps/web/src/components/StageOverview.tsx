import {
  renderOperationalCue,
  type EventState,
  type Speaker,
} from "@cuepilot/domain";
import { localTime } from "../lib/format";
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
  const { t } = useI18n();
  const view = renderOperationalCue(state, nowAt);
  const speaker = state.speakers.find(
    (person) => person.id === view.current?.speakerId,
  ) as StageSpeaker | undefined;
  const nextSpeaker = state.speakers.find(
    (person) => person.id === view.next?.speakerId,
  );
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
            (view.current ? t("Event host") : t("Nobody on stage"))}
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
            ? t("Speaking now")
            : view.current
              ? t("Hosted by your anchor")
              : t("Waiting to start")}
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
                : t("Nothing on stage yet"))}
        </h2>
        <p className="stage-window">
          {view.current
            ? t("{start}–{end} IST · started / expected to end", {
                start: view.current.startsAtLocal,
                end: view.current.endsAtLocal,
              })
            : state.phase === "draft"
              ? t("Review and publish your agenda to begin.")
              : t("Waiting for the next session.")}
        </p>
        {/*
          The planned window is only worth a line when it DIFFERS from what is actually
          happening. Printing the same two times twice under different labels was noise
          on a phone held at arm's length.
        */}
        {plannedDiffers && (
          <p className="small muted">
            {t("Planned:")} {plannedStartLocal}–{plannedEndLocal} IST
          </p>
        )}
      </div>
      {/*
        `up next` is a sibling of the activity block rather than a child, so the mobile
        stack can place the countdown between them. On a 390-wide phone the countdown was
        previously clipped at the fold — the one thing an anchor checks most often.
      */}
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
      <div className="stage-timing">
        <span className="stage-eyebrow">
          {seconds !== null && seconds < 0
            ? t("RUNNING OVER")
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
            ? t("Practice clock — you move it")
            : freshness !== "live"
              ? t("Offline estimate · updates paused")
              : t("Synced to the server clock")}
        </p>
        {/*
          "Is this current?" was answerable only by hunting for the chip at the top of
          the page. This answers it where the eye already is, in words not a colour.
        */}
        {lastSyncAt === null ? null : (
          <p className="small muted stage-asof">
            {freshness === "live" ? t("Updated") : t("Last updated")}{" "}
            {new Date(lastSyncAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        )}
        <dl className="stage-finishes">
          <div>
            <dt>{t("Projected finish")}</dt>
            <dd>
              {view.projectedFinishLocal ?? "—"} <small>IST</small>
            </dd>
          </div>
          <div>
            <dt>{t("Must finish by")}</dt>
            <dd>
              {localTime(state.startsAt, state.hardEndMin)} <small>IST</small>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
