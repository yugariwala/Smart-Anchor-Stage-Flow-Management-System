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

export function AnchorView({ eventId, uid }: { eventId: string; uid: string }) {
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
        ? `Runbook loaded, revision ${revision}.`
        : `Updated: revision ${revision} published.`,
    );
  }, [revision]);

  if (snapshot === null) {
    return (
      <div className="anchor">
        <h1 className="anchor-title">CuePilot</h1>
        {poll.notPublished ? (
          <p className="anchor-line" role="status">
            Waiting for the organizer to publish the runbook.
          </p>
        ) : poll.error !== null ? (
          <p className="anchor-line" role="status">
            {errorCopy(poll.error)}
          </p>
        ) : (
          <p className="anchor-line" role="status">
            Loading the published runbook{"…"}
          </p>
        )}
        <div className="row">
          <button onClick={poll.refresh}>Retry connection</button>
          <a className="button-link" href="#/">
            Back to events
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
          <p className="anchor-label">ANCHOR RUNBOOK</p>
          <h2>{state.name}</h2>
        </div>
        <div className="row no-print">
          {/*
            Labelled, not just icon-only: an anchor backstage will not guess what the
            middle glyph does, and the accessible name now matches what is on screen.
          */}
          <button className="labelled-icon" onClick={poll.refresh}>
            <ReloadIcon />
            Refresh
          </button>
          <button className="labelled-icon" onClick={() => window.print()}>
            <FileTextIcon />
            Print
          </button>
          <button
            className="labelled-icon"
            onClick={() => {
              const action = document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen();
              void action.catch(() =>
                setDisplayError("Fullscreen is unavailable in this browser."),
              );
            }}
          >
            <EnterFullScreenIcon />
            Full screen
          </button>
        </div>
      </header>
      {state.ownerUid === uid && (
        <p className="notice small no-print">
          Organizer preview. Only an invited anchor can acknowledge this
          runbook. <a href={`#/event/${eventId}/console`}>Return to console</a>
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
          <span className="chip chip-warn">Schedule needs repair</span>
        ) : null}
        {poll.fromCache ? (
          <span className="chip chip-bad">Cached copy</span>
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
      <p className="anchor-line">{view.line}</p>

      <section className="anchor-now">
        <p className="anchor-label">Approved script</p>
        {state.approvedScripts.filter(
          (script) =>
            script.cueId === null ||
            script.cueId === view.current?.cueId ||
            (view.current === null && script.cueId === view.next?.cueId),
        ).length === 0 ? (
          <p className="muted">
            No approved copy for this cue yet. The organizer drafts and approves
            host copy from the Scripts page; it appears here once approved.
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
                      ? "AI-generated copy · reviewed and approved"
                      : "Human-written copy"}{" "}
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
            <p className="anchor-label">Announcement</p>
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
            ? "Acknowledging…"
            : ackedRevision === snapshot.publishedRevision
              ? `Got it — version ${snapshot.publishedRevision}`
              : `I’ve got the update (version ${snapshot.publishedRevision})`}
        </button>
        {behind ? (
          <span className="chip chip-warn">
            Behind: you acknowledged revision {ackedRevision}
          </span>
        ) : null}
      </div>
      {ackError === "" ? null : (
        <p className="notice notice-bad small" role="alert">
          {ackError}
        </p>
      )}

      <p className="muted small">
        Confirming means you received this update. It does not confirm the words
        have been spoken.
      </p>
      <section className="anchor-now runbook-full">
        <p className="anchor-label">Complete published agenda</p>
        <RunbookTable state={state} />
      </section>
      <section className="print-only">
        <h2>All approved host copy</h2>
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
              {script.source} · Approved {script.approvedAt}
            </p>
          </article>
        ))}
        <h2>Speaker pronunciation & facts</h2>
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
        Published revision {snapshot.publishedRevision} · Last synced{" "}
        {poll.lastSyncAt
          ? new Date(poll.lastSyncAt).toLocaleString()
          : "not synced"}{" "}
        · Times in IST. Printed copies do not update.
      </footer>
    </div>
  );
}
