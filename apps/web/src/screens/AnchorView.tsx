/**
 * Anchor View. Read-only, mobile portrait, dark, large type.
 *
 * Everything on screen comes from `renderOperationalCue` over the published snapshot — the
 * one domain function the frontend is allowed to call, because it derives current/up-next
 * from structured state and never parses generated prose (§24).
 *
 * The countdown is local, from the server-clock offset, and is `aria-hidden` so a screen
 * reader is not told the time every second (§20). A separate polite live region announces
 * only revision changes.
 */

import { renderOperationalCue } from "@cuepilot/domain";
import { useEffect, useRef, useState } from "react";
import {
  FileTextIcon,
  ReloadIcon,
  EnterFullScreenIcon,
} from "@radix-ui/react-icons";

import { acknowledge, errorCopy } from "../lib/api";
import { useSnapshotPoll } from "../lib/useSnapshotPoll";
import { FreshnessChip, StaleSnapshotNotice } from "../components/Freshness";
import { RehearsalBanner } from "../components/RehearsalBanner";
import { rememberEvent } from "../lib/storage";
import { RunbookTable } from "./EventPages";
import { StageOverview } from "../components/StageOverview";
import { ReadinessReminder } from "../components/ReadinessReminder";
import { VoiceAssistant } from "../components/VoiceAssistant";
import { useI18n } from "../lib/i18n";

export function AnchorView({ eventId, uid }: { eventId: string; uid: string }) {
  const { t } = useI18n();
  const poll = useSnapshotPoll(eventId);
  const [ackedRevision, setAckedRevision] = useState<number | null>(null);
  const [ackError, setAckError] = useState<string>("");
  const [ackPending, setAckPending] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const lastAnnounced = useRef<number | null>(null);
  const [displayError, setDisplayError] = useState("");

  const snapshot = poll.snapshot;
  const revision = snapshot?.publishedRevision ?? null;
  useEffect(() => {
    if (snapshot)
      rememberEvent(
        snapshot.state,
        snapshot.state.ownerUid === uid ? "owner" : "anchor",
      );
  }, [snapshot, uid]);

  // Polite announcement on a NEW revision only — never a per-second timer (§20).
  useEffect(() => {
    if (revision === null || lastAnnounced.current === revision) return;
    const first = lastAnnounced.current === null;
    lastAnnounced.current = revision;
    setAnnouncement(
      first
        ? t("Runbook loaded, revision {revision}.", { revision })
        : t("Updated: revision {revision} published.", { revision }),
    );
  }, [revision, t]);

  if (snapshot === null) {
    return (
      <div className="anchor">
        <h1 className="anchor-title">CuePilot</h1>
        {poll.notPublished ? (
          <p className="anchor-line" role="status">
            {t("Waiting for the organizer to publish the runbook.")}
          </p>
        ) : poll.error !== null ? (
          <p className="anchor-line" role="status">
            {errorCopy(poll.error)}
          </p>
        ) : (
          <p className="anchor-line" role="status">
            {t("Loading the published runbook…")}
          </p>
        )}
        <div className="row">
          <button onClick={poll.refresh}>{t("Retry connection")}</button>
          <a className="button-link" href="#/">
            {t("Back to events")}
          </a>
        </div>
      </div>
    );
  }

  const state = snapshot.state;
  // The scenario clock in rehearsal, otherwise the server clock estimated locally.
  const nowAt =
    state.mode === "rehearsal" && state.scenarioNowAt !== null
      ? state.scenarioNowAt
      : poll.serverNowIso;
  const view = renderOperationalCue(state, nowAt);

  const behind =
    ackedRevision !== null && ackedRevision < snapshot.publishedRevision;

  const onAcknowledge = async (): Promise<void> => {
    setAckPending(true);
    setAckError("");
    try {
      const result = await acknowledge(eventId, snapshot.publishedRevision);
      if (result !== null) setAckedRevision(result.acknowledgedRevision);
    } catch (cause) {
      setAckError(errorCopy(cause));
    } finally {
      setAckPending(false);
    }
  };

  return (
    <div className="anchor">
      <RehearsalBanner mode={state.mode} />
      <header className="anchor-header">
        <div>
          <p className="anchor-label">{t("ANCHOR RUNBOOK")}</p>
          <h2>{state.name}</h2>
        </div>
        <div className="row no-print">
          {/*
            Labelled, not icon-only: an anchor backstage will not guess what the middle
            glyph does, and the accessible name now matches what is on screen.
          */}
          <button className="labelled-icon" onClick={poll.refresh}>
            <ReloadIcon />
            {t("Refresh")}
          </button>
          <button className="labelled-icon" onClick={() => window.print()}>
            <FileTextIcon />
            {t("Print")}
          </button>
          <button
            className="labelled-icon"
            onClick={() => {
              const action = document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen();
              void action.catch(() =>
                setDisplayError(
                  t("Fullscreen is unavailable in this browser."),
                ),
              );
            }}
          >
            <EnterFullScreenIcon />
            {t("Full screen")}
          </button>
        </div>
      </header>
      {state.ownerUid === uid && (
        <p className="notice small no-print">
          {t(
            "Organizer preview. Only an invited anchor can acknowledge this runbook.",
          )}{" "}
          <a href={`#/event/${eventId}/console`}>{t("Return to console")}</a>
        </p>
      )}
      {displayError && <p role="status">{displayError}</p>}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="row spread">
        <FreshnessChip
          freshness={poll.freshness}
          revision={snapshot.publishedRevision}
        />
        {view.scheduleHealth === "needs_repair" ? (
          <span className="chip chip-warn">{t("Schedule needs repair")}</span>
        ) : null}
        {poll.fromCache ? (
          <span className="chip chip-bad">{t("Cached copy")}</span>
        ) : null}
      </div>

      <StaleSnapshotNotice
        freshness={poll.freshness}
        revision={snapshot.publishedRevision}
        lastSyncAt={poll.lastSyncAt}
      />

      <StageOverview
        state={state}
        nowAt={nowAt}
        freshness={poll.freshness}
        lastSyncAt={poll.lastSyncAt}
        stage
      />
      <ReadinessReminder
        state={state}
        nowAt={nowAt}
        freshness={poll.freshness}
      />
      <VoiceAssistant
        context={{
          currentTitle: view.current?.title ?? null,
          nextTitle: view.next?.title ?? null,
          remainingMinutes:
            view.current === null
              ? null
              : Math.ceil(view.current.endMin - view.nowMin),
        }}
        enabled={poll.freshness === "live" && !poll.fromCache}
      />
      <p className="anchor-line">{view.line}</p>

      <section className="anchor-now">
        <p className="anchor-label">{t("Approved script")}</p>
        {state.approvedScripts.filter(
          (script) =>
            script.cueId === null ||
            script.cueId === view.current?.cueId ||
            (view.current === null && script.cueId === view.next?.cueId),
        ).length === 0 ? (
          <p className="muted">
            {t(
              "No approved copy for this cue yet. The organizer drafts and approves host copy from the Scripts page; it appears here once approved.",
            )}
          </p>
        ) : (
          state.approvedScripts
            .filter(
              (script) =>
                script.cueId === null ||
                script.cueId === view.current?.cueId ||
                (view.current === null && script.cueId === view.next?.cueId),
            )
            .map((script) => (
              <article key={script.id}>
                <p className="script-body" lang={script.language}>
                  {script.body}
                </p>
                <p className="small muted">
                  {script.source === "template"
                    ? "Template fallback — AI unavailable."
                    : script.source === "gemini"
                      ? t("AI-generated copy · reviewed and approved")
                      : t("Human-written copy")}{" "}
                  · {script.language.toUpperCase()}
                </p>
              </article>
            ))
        )}
      </section>

      {state.announcements
        .filter((a) => a.dismissedAt === null)
        .map((a) => (
          <section className="anchor-now announcement-banner" key={a.id}>
            <p className="anchor-label">{t("Announcement")}</p>
            <p lang={a.language} className="script-body">
              {a.text}
            </p>
          </section>
        ))}

      <div className="row no-print">
        <button
          type="button"
          className="primary"
          onClick={() => void onAcknowledge()}
          disabled={
            ackPending ||
            ackedRevision === snapshot.publishedRevision ||
            poll.freshness !== "live" ||
            poll.fromCache ||
            state.ownerUid === uid
          }
        >
          {ackPending
            ? t("Acknowledging…")
            : ackedRevision === snapshot.publishedRevision
              ? t("Got it — version {revision}", {
                  revision: snapshot.publishedRevision,
                })
              : t("I’ve got the update (version {revision})", {
                  revision: snapshot.publishedRevision,
                })}
        </button>
        {behind ? (
          <span className="chip chip-warn">
            {t("Behind: you acknowledged revision {revision}", {
              revision: ackedRevision,
            })}
          </span>
        ) : null}
      </div>
      {ackError === "" ? null : (
        <p className="notice notice-bad small" role="alert">
          {ackError}
        </p>
      )}

      <p className="muted small">
        {t(
          "Confirming means you received this update. It does not confirm the words have been spoken.",
        )}
      </p>
      <section className="anchor-now runbook-full">
        <p className="anchor-label">{t("Complete published agenda")}</p>
        <RunbookTable state={state} />
      </section>
      <section className="print-only">
        <h2>{t("All approved host copy")}</h2>
        {state.approvedScripts.map((script) => (
          <article key={script.id}>
            <h3>
              {state.cues.find((cue) => cue.id === script.cueId)?.title ??
                script.kind}
            </h3>
            <p className="script-body" lang={script.language}>
              {script.body}
            </p>
            <p>
              {script.source} ·{" "}
              {t("Approved {time}", { time: script.approvedAt })}
            </p>
          </article>
        ))}
        <h2>{t("Speaker pronunciation & facts")}</h2>
        {state.speakers.map((speaker) => (
          <article key={speaker.id}>
            <h3>{speaker.displayName}</h3>
            <p>{speaker.pronunciationHint}</p>
            <ul>
              {speaker.facts.map((fact) => (
                <li key={fact.id}>{fact.text}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <footer className="small muted">
        {t(
          "Published revision {revision} · Last synced {time} · Times in IST. Printed copies do not update.",
          {
            revision: snapshot.publishedRevision,
            time: poll.lastSyncAt
              ? new Date(poll.lastSyncAt).toLocaleString()
              : t("not synced"),
          },
        )}
      </footer>
    </div>
  );
}
