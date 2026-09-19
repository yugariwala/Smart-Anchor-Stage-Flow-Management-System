/**
 * Organizer Console (§14). Desktop grid.
 *
 * Polling strategy: this screen polls `/published?afterRevision=N` for the cheap 204, and
 * refetches the full owner envelope ONLY when the published revision moves or after its own
 * mutation. Acknowledgements are the exception — §12 deliberately keeps them out of the
 * revision stream, so they can never arrive via revision-based polling and get their own slow
 * 10 s poll. See docs/decisions.md.
 *
 * Nothing here computes a schedule. The delay box translates "+N minutes" into the absolute
 * forecast end the API expects, always from the CURRENTLY PUBLISHED forecast, never from a
 * previously computed value — so re-previewing cannot stack the delay.
 */

import { renderOperationalCue } from "@cuepilot/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@radix-ui/themes";
import {
  ArrowTopRightIcon,
  ClockIcon,
  PersonIcon,
  CheckCircledIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

import {
  approveRepair,
  completeCueCommand,
  createInvitation,
  errorCopy,
  getEvent,
  proposeRepair,
  publishEvent,
  setRehearsalClock,
  startCueCommand,
  type EventEnvelope,
  type ProposalResponse,
} from "../lib/api";
import { localTime, localTimeOf, signedMinutes } from "../lib/format";
import { inviteLink, navigate } from "../lib/route";
import { useCommand } from "../lib/useCommand";
import { useSnapshotPoll } from "../lib/useSnapshotPoll";
import { FreshnessChip, StaleSnapshotNotice } from "../components/Freshness";
import { RehearsalBanner } from "../components/RehearsalBanner";
import { RepairPreviewPanel } from "../components/RepairPreview";
import { Modal, CommandNotice, Loading, PageHeading } from "../components/UI";

const ACK_POLL_MS = 10_000;

export function OrganizerConsole({
  eventId,
  uid,
}: {
  eventId: string;
  uid: string;
}) {
  const poll = useSnapshotPoll(eventId);
  const command = useCommand();
  const [envelope, setEnvelope] = useState<EventEnvelope | null>(null);
  const [loadError, setLoadError] = useState("");
  const [delayMinutes, setDelayMinutes] = useState("12");
  const [proposal, setProposal] = useState<ProposalResponse | null>(null);
  const [invite, setInvite] = useState<{
    inviteCode: string;
    expiresAt: string;
  } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [releaseCue, setReleaseCue] = useState("");
  const [releaseMinute, setReleaseMinute] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const lastEnvelopeRevision = useRef<number | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const result = await getEvent(eventId);
      if (result !== null) {
        setEnvelope(result);
        lastEnvelopeRevision.current = result.state.revision;
        setLoadError("");
      }
    } catch (cause) {
      setLoadError(errorCopy(cause));
    }
  }, [eventId]);

  // Fetch on mount. This IS synchronising with an external system, which the rule permits,
  // but the check cannot see through the async boundary into `reload`.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void reload();
  }, [reload]);

  // Refetch the owner envelope when the published revision moves past what we hold.
  const publishedRevision = poll.snapshot?.publishedRevision ?? null;
  useEffect(() => {
    if (publishedRevision === null) return;
    if (
      lastEnvelopeRevision.current !== null &&
      publishedRevision <= lastEnvelopeRevision.current
    ) {
      return;
    }
    void reload();
  }, [publishedRevision, reload]);

  // Acknowledgements are auxiliary records and never bump the revision, so a revision-driven
  // refetch cannot surface them. Separate slow poll, console only.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, ACK_POLL_MS);
    return () => window.clearInterval(id);
  }, [reload]);

  const state = envelope?.state ?? null;

  const view = useMemo(() => {
    if (state === null) return null;
    const nowAt =
      state.mode === "rehearsal" && state.scenarioNowAt !== null
        ? state.scenarioNowAt
        : poll.serverNowIso;
    return renderOperationalCue(state, nowAt);
  }, [state, poll.serverNowIso]);

  if (state === null || view === null) {
    return (
      <div className="page">
        <h1>Organizer console</h1>
        {loadError === "" ? (
          <Loading label="Loading stage console" />
        ) : (
          <>
            <p className="notice notice-bad" role="alert">
              {loadError}
            </p>
            <button type="button" onClick={() => navigate("#/")}>
              Back to start
            </button>
          </>
        )}
      </div>
    );
  }

  const ordered = state.cues.slice().sort((a, b) => a.order - b.order);
  const activeCue = ordered.find((c) => c.status === "active") ?? null;
  const firstPending = ordered.find((c) => c.status === "pending") ?? null;
  const revision = state.revision;
  const busy = command.status === "pending" || command.status === "unknown";
  const readOnly =
    busy ||
    loadError !== "" ||
    (state.phase !== "draft" && poll.freshness === "stale");

  const run = async (
    intent: string,
    fn: (key: string) => Promise<unknown>,
  ): Promise<void> => {
    const result = await command.run(intent, fn);
    if (result !== null) {
      await reload();
      poll.refresh();
    }
  };

  const onPublish = async (): Promise<void> => {
    const result = await command.run(`publish:${revision}`, (key) =>
      publishEvent(eventId, revision, key),
    );
    if (result) {
      setPublishOpen(false);
      await reload();
      poll.refresh();
    }
  };

  const onStart = (cueId: string): Promise<void> =>
    run(`start:${cueId}:${revision}`, (key) =>
      startCueCommand(eventId, cueId, revision, key),
    );

  const onComplete = (cueId: string): Promise<void> =>
    run(`complete:${cueId}:${revision}`, (key) =>
      completeCueCommand(eventId, cueId, revision, key),
    );

  const advanceClock = (byMinutes: number): Promise<void> => {
    const base = state.scenarioNowAt ?? state.startsAt;
    const nowAt = new Date(Date.parse(base) + byMinutes * 60_000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");
    return run(`clock:${nowAt}:${revision}`, (key) =>
      setRehearsalClock(eventId, revision, nowAt, key),
    );
  };

  const onPreview = async (): Promise<void> => {
    const delta = Number(delayMinutes);
    if (
      !Number.isInteger(delta) ||
      delta < 0 ||
      delta > 240 ||
      delayMinutes.trim() === ""
    )
      return;
    // Absolute forecast end, derived once from the CURRENT published forecast. Re-previewing
    // recomputes from the same base, so the delay can never accumulate.
    const activeForecastEndMin =
      state.activeForecastEndMin === null
        ? null
        : state.activeForecastEndMin + delta;
    const result = await command.run(`preview:${revision}:${delta}`, (key) =>
      proposeRepair(
        eventId,
        {
          expectedRevision: revision,
          activeForecastEndMin,
          releaseUpdates:
            releaseCue && releaseMinute !== ""
              ? [{ cueId: releaseCue, notBeforeMin: Number(releaseMinute) }]
              : [],
        },
        key,
      ),
    );
    if (result !== null) setProposal(result);
  };

  const onApprove = async (): Promise<void> => {
    if (proposal === null) return;
    const result = await command.run(`approve:${proposal.proposalId}`, (key) =>
      approveRepair(
        eventId,
        proposal.proposalId,
        proposal.result.baseRevision,
        key,
      ),
    );
    if (result !== null) {
      setProposal(null);
      await reload();
      poll.refresh();
    }
  };

  const onInvite = async (): Promise<void> => {
    const result = await command.run(
      `invite:${revision}:${Date.now()}`,
      (key) => createInvitation(eventId, key),
    );
    if (result !== null) {
      setInvite(result);
      setInviteOpen(true);
      setCopyMessage("");
    }
  };

  const acks = envelope?.acknowledgments ?? [];
  const currentAck = acks.find(
    (a) => a.revision === (envelope?.publishedRevision ?? -1),
  );

  return (
    <div>
      <RehearsalBanner mode={state.mode} />
      <div className="page">
        <PageHeading
          title={state.name}
          description="Stage console · Every cue and every change in one place."
          actions={
            <>
              <button
                className="icon-button"
                aria-label="Refresh console"
                onClick={() => {
                  void reload();
                  poll.refresh();
                }}
              >
                <ReloadIcon />
              </button>
              <a className="button-link" href={`#/anchor/${eventId}`}>
                Anchor view
                <ArrowTopRightIcon />
              </a>
            </>
          }
        />
        <div className="row spread">
          <div className="row">
            <FreshnessChip
              freshness={poll.freshness}
              revision={envelope?.publishedRevision ?? null}
            />
            <span className="chip chip-info">revision {revision}</span>
            <span
              className={`chip ${state.scheduleHealth === "valid" ? "chip-ok" : "chip-warn"}`}
            >
              {state.scheduleHealth === "valid"
                ? "Schedule valid"
                : "Needs repair"}
            </span>
            <span className="chip chip-info">{state.phase}</span>
          </div>
        </div>

        <div className="console-metrics">
          <div>
            <ClockIcon />
            <span>Event clock</span>
            <strong>
              {state.scenarioNowAt
                ? localTimeOf(state.startsAt, state.scenarioNowAt)
                : localTimeOf(state.startsAt, poll.serverNowIso)}
              <small> IST</small>
            </strong>
          </div>
          <div>
            <CheckCircledIcon />
            <span>Cues completed</span>
            <strong>
              {ordered.filter((c) => c.status === "completed").length}
              <small> / {ordered.length}</small>
            </strong>
          </div>
          <div>
            <ClockIcon />
            <span>Hard finish</span>
            <strong>
              {localTime(state.startsAt, state.hardEndMin)}
              <small> IST</small>
            </strong>
          </div>
          <div>
            <PersonIcon />
            <span>Anchor handoff</span>
            <strong className="metric-word">
              {currentAck ? "Received" : "Awaiting ack"}
            </strong>
          </div>
        </div>

        <StaleSnapshotNotice
          freshness={poll.freshness}
          revision={envelope?.publishedRevision ?? null}
          lastSyncAt={poll.lastSyncAt}
        />

        <CommandNotice
          {...command}
          retry={() => {
            void command
              .retry<Record<string, unknown>>()
              .then(async (result) => {
                if (!result) return;
                if ("result" in result && "proposalId" in result)
                  setProposal(result as unknown as ProposalResponse);
                if (
                  "inviteCode" in result &&
                  typeof result.inviteCode === "string"
                ) {
                  setInvite(
                    result as unknown as {
                      inviteCode: string;
                      expiresAt: string;
                    },
                  );
                  setInviteOpen(true);
                }
                if ("state" in result) {
                  setProposal(null);
                  setPublishOpen(false);
                }
                await reload();
                poll.refresh();
              });
          }}
        />
        {loadError && (
          <p className="notice notice-bad" role="alert">
            {loadError} <button onClick={() => void reload()}>Reconnect</button>
          </p>
        )}
        {command.status === "pending" ? (
          <p className="notice notice-warn" role="alert">
            Waiting for the server to confirm this action…
          </p>
        ) : null}

        <div className="console-grid">
          <div>
            <div className="card console-now">
              <div className="row spread">
                <h2>
                  {state.phase === "ended" ? "Event complete" : "On stage"}
                </h2>
                <span className="chip chip-info">
                  {activeCue ? "Current cue" : "Between cues"}
                </span>
              </div>
              <h3 className="current-cue-title">
                {activeCue?.title ??
                  (state.phase === "draft"
                    ? "Your stage is taking shape."
                    : state.phase === "ended"
                      ? "That’s a wrap."
                      : "Ready for the next cue.")}
              </h3>
              <p className="anchor-line">{view.line}</p>
              <div className="row small muted">
                <span>
                  Scenario clock{" "}
                  <strong>
                    {state.scenarioNowAt === null
                      ? "live"
                      : localTimeOf(state.startsAt, state.scenarioNowAt)}
                  </strong>
                </span>
                <span>
                  Projected finish{" "}
                  <strong>{view.projectedFinishLocal ?? "—"}</strong>
                </span>
                <span>
                  Hard finish{" "}
                  <strong>{localTime(state.startsAt, state.hardEndMin)}</strong>
                </span>
              </div>
            </div>

            <div className="card">
              <h2>Agenda</h2>
              <div
                className="table-scroll"
                role="region"
                aria-label="Event agenda"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Cue</th>
                      <th scope="col">Planned</th>
                      <th scope="col">Actual / forecast</th>
                      <th scope="col" className="num">
                        Pref / min
                      </th>
                      <th scope="col" className="num">
                        Rules
                      </th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((cue) => (
                      <tr
                        key={cue.id}
                        className={
                          cue.status === "active"
                            ? "is-active"
                            : cue.status === "completed"
                              ? "is-completed"
                              : ""
                        }
                      >
                        <th scope="row">{cue.title}</th>
                        <td>
                          {localTime(state.startsAt, cue.plannedStartMin)}
                          {"–"}
                          {localTime(state.startsAt, cue.plannedEndMin)}
                        </td>
                        <td>
                          {cue.actualStartAt === null
                            ? "—"
                            : `${localTimeOf(state.startsAt, cue.actualStartAt)}–${
                                cue.actualEndAt !== null
                                  ? localTimeOf(state.startsAt, cue.actualEndAt)
                                  : state.activeForecastEndMin !== null &&
                                      cue.status === "active"
                                    ? `${localTime(state.startsAt, state.activeForecastEndMin)} (forecast)`
                                    : "…"
                              }`}
                          {cue.actualTimeSource === "rehearsal_clock" ? (
                            <span className="small muted">
                              {" "}
                              rehearsal clock
                            </span>
                          ) : cue.actualTimeSource === "server_clock" ? (
                            <span className="small muted"> server clock</span>
                          ) : null}
                        </td>
                        <td className="num">
                          {cue.preferredDurationMin}/{cue.minDurationMin}
                        </td>
                        <td className="num small">
                          {cue.fixedStartMin !== null
                            ? `fixed ${localTime(state.startsAt, cue.fixedStartMin)}`
                            : cue.notBeforeMin !== null
                              ? `from ${localTime(state.startsAt, cue.notBeforeMin)}`
                              : cue.bufferBeforeMin > 0
                                ? `buffer ${cue.bufferBeforeMin}`
                                : "—"}
                        </td>
                        <td>{cue.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {state.cues.length === 0 ? (
                <p className="muted small">
                  No cues yet. Add the agenda on the setup screen before
                  publishing.
                </p>
              ) : null}
            </div>
          </div>

          <div>
            {state.phase === "draft" ? (
              <div className="card">
                <h2>Publish the runbook</h2>
                <p className="small muted">
                  Publishing validates the full draft and makes it visible to
                  anchors. It does not start the first cue.
                </p>
                <div className="row">
                  <button
                    type="button"
                    onClick={() => navigate(`#/event/${eventId}/setup`)}
                  >
                    Edit agenda
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setPublishOpen(true)}
                    disabled={readOnly || state.cues.length === 0}
                  >
                    {busy ? "Publishing…" : "Validate and publish"}
                  </button>
                </div>
              </div>
            ) : null}

            {state.phase === "running" ? (
              <>
                <div className="card">
                  <h2>Run the stage</h2>
                  <div className="row">
                    {activeCue === null ? (
                      <button
                        type="button"
                        className="primary"
                        onClick={() =>
                          firstPending !== null && void onStart(firstPending.id)
                        }
                        disabled={readOnly || firstPending === null}
                      >
                        {firstPending === null
                          ? "No cues left"
                          : `Start ${firstPending.title}`}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void onComplete(activeCue.id)}
                        disabled={readOnly}
                      >
                        Complete {activeCue.title}
                      </button>
                    )}
                  </div>
                  {state.mode === "rehearsal" ? (
                    <>
                      <h3 className="small">Scenario clock</h3>
                      <p className="small muted">
                        The scenario clock advances only forward. Actual times
                        recorded while it is in use are labelled as
                        rehearsal-clock times.
                      </p>
                      <div className="row">
                        {[1, 5, 10].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => void advanceClock(n)}
                            disabled={readOnly}
                          >
                            +{n} min
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="card">
                  <h2>Report an overrun</h2>
                  {activeCue === null ? (
                    <p className="small muted">
                      A repair can be previewed between cues as well; with no
                      active cue the plan is rebuilt from the current scenario
                      minute.
                    </p>
                  ) : (
                    <p className="small muted">
                      {activeCue.title} currently forecasts{" "}
                      {state.activeForecastEndMin === null
                        ? "—"
                        : localTime(state.startsAt, state.activeForecastEndMin)}
                      . Entering a delay sends a new absolute forecast end, so
                      re-previewing never stacks the delay.
                    </p>
                  )}
                  <div className="field">
                    <label htmlFor="delay">Delay in minutes</label>
                    <input
                      id="delay"
                      type="number"
                      inputMode="numeric"
                      value={delayMinutes}
                      onChange={(e) => setDelayMinutes(e.target.value)}
                      step={1}
                      min={0}
                      max={240}
                      disabled={readOnly || activeCue === null}
                    />
                    {state.activeForecastEndMin !== null &&
                    Number.isInteger(Number(delayMinutes)) ? (
                      <span className="small muted">
                        New forecast end{" "}
                        {localTime(
                          state.startsAt,
                          state.activeForecastEndMin + Number(delayMinutes),
                        )}{" "}
                        ({signedMinutes(Number(delayMinutes))} min)
                      </span>
                    ) : null}
                  </div>
                  <details className="release-controls">
                    <summary>Speaker arriving late?</summary>
                    <div className="field">
                      <label htmlFor="releaseCue">Pending cue</label>
                      <select
                        id="releaseCue"
                        value={releaseCue}
                        onChange={(e) => setReleaseCue(e.target.value)}
                        disabled={readOnly}
                      >
                        <option value="">No availability update</option>
                        {ordered
                          .filter((c) => c.status === "pending")
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                      </select>
                    </div>
                    {releaseCue && (
                      <div className="field">
                        <label htmlFor="releaseMinute">
                          Available from minute after start
                        </label>
                        <input
                          id="releaseMinute"
                          type="number"
                          min={0}
                          max={240}
                          step={1}
                          value={releaseMinute}
                          disabled={readOnly}
                          onChange={(e) => setReleaseMinute(e.target.value)}
                        />
                      </div>
                    )}
                  </details>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void onPreview()}
                    disabled={
                      readOnly ||
                      !Number.isInteger(Number(delayMinutes)) ||
                      Number(delayMinutes) < 0 ||
                      Number(delayMinutes) > 240 ||
                      delayMinutes.trim() === "" ||
                      (!!releaseCue &&
                        (releaseMinute === "" ||
                          !Number.isInteger(Number(releaseMinute)) ||
                          Number(releaseMinute) < 0 ||
                          Number(releaseMinute) > 240))
                    }
                  >
                    {busy ? "Calculating…" : "Preview recovery plan"}
                  </button>
                </div>
              </>
            ) : null}

            <div className="card">
              <h2>Anchor</h2>
              <p className="small muted">
                Published revision{" "}
                <strong>
                  {envelope?.publishedRevision ?? "not published"}
                </strong>
              </p>
              {acks.length === 0 ? (
                <p className="small muted">No acknowledgements yet.</p>
              ) : (
                <ul className="small">
                  {acks.map((a) => (
                    <li key={a.uid}>
                      <span
                        className={`chip ${
                          a.revision === envelope?.publishedRevision
                            ? "chip-ok"
                            : "chip-warn"
                        }`}
                      >
                        {a.revision === envelope?.publishedRevision
                          ? "current"
                          : "behind"}
                      </span>{" "}
                      revision {a.revision} at{" "}
                      {new Date(a.acknowledgedAt).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              )}
              <p className="small muted">
                {currentAck === undefined
                  ? "Publication success and acknowledgement are separate: the anchor may not have seen this revision yet."
                  : "The anchor has acknowledged receiving this revision. That is not confirmation the words were spoken."}
              </p>
              <div className="row">
                <button
                  type="button"
                  onClick={() => void onInvite()}
                  disabled={readOnly}
                >
                  Invite an anchor
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`#/anchor/${eventId}`)}
                >
                  Preview anchor view
                </button>
              </div>
              {invite === null ? null : (
                <button onClick={() => setInviteOpen(true)}>
                  Show invitation
                </button>
              )}
              <Modal
                open={inviteOpen}
                onClose={() => setInviteOpen(false)}
                title="Invite your anchor"
                description="A private, single-use invitation. Valid for one hour."
              >
                {invite === null ? null : (
                  <div className="notice small">
                    <p>
                      Single-use invitation, valid one hour. Shown once {"—"}{" "}
                      copy it now.
                    </p>
                    <p className="mono" style={{ overflowWrap: "anywhere" }}>
                      {inviteLink(eventId, invite.inviteCode)}
                    </p>
                    <p className="muted">
                      Open it in a different browser profile or an incognito
                      window: the same profile would join as you, the owner.
                    </p>
                    <button
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(inviteLink(eventId, invite.inviteCode))
                          .then(() => setCopyMessage("Invitation copied."))
                          .catch(() =>
                            setCopyMessage(
                              "Copy unavailable. Select and copy the link above.",
                            ),
                          );
                      }}
                    >
                      Copy invitation link
                    </button>
                    <p role="status">{copyMessage}</p>
                  </div>
                )}
              </Modal>
            </div>

            <p className="small muted">
              Signed in as <span className="mono">{uid}</span>. Demo data
              expires {new Date(state.expiresAt).toLocaleString()}.
            </p>
          </div>
        </div>

        <Modal
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          title="Publish the runbook?"
          description="This validates your draft and shares the approved agenda with your anchor. Direct agenda and fact editing closes after publication."
          busy={busy}
        >
          <p>
            {ordered.length} cues · Hard finish{" "}
            {localTime(state.startsAt, state.hardEndMin)} IST
          </p>
          <div className="row end">
            <button disabled={busy} onClick={() => setPublishOpen(false)}>
              Keep reviewing
            </button>
            <Button disabled={busy} onClick={() => void onPublish()}>
              {command.status === "pending"
                ? "Publishing…"
                : "Validate and publish"}
            </Button>
          </div>
          {command.message && (
            <p role="alert" className="notice notice-warn">
              {command.message}
            </p>
          )}
          {command.status === "unknown" && (
            <button
              onClick={() =>
                void command.retry().then(async (result) => {
                  if (result) {
                    setPublishOpen(false);
                    await reload();
                    poll.refresh();
                  }
                })
              }
            >
              Retry original request
            </button>
          )}
        </Modal>
        <Modal
          open={proposal !== null}
          onClose={() => {
            if (!busy) {
              setProposal(null);
              command.reset();
            }
          }}
          title="Review the recovery plan"
          description="Check every timing change before publishing a new revision."
          busy={busy}
        >
          {proposal === null ? null : (
            <RepairPreviewPanel
              state={state}
              result={proposal.result}
              expiresAt={proposal.expiresAt}
              approving={busy || readOnly}
              approveMessage={
                command.status === "failed" ? command.message : ""
              }
              onApprove={() => void onApprove()}
              onDiscard={() => {
                setProposal(null);
                command.reset();
              }}
            />
          )}
          {command.status === "unknown" && (
            <button
              onClick={() =>
                void command.retry().then(async (result) => {
                  if (result) {
                    setProposal(null);
                    await reload();
                    poll.refresh();
                  }
                })
              }
            >
              Retry original request
            </button>
          )}
        </Modal>
      </div>
    </div>
  );
}
