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
  type RevisionMutation,
} from "../lib/api";
import { planLoadRehearsal, rehearsalClockIso } from "../lib/loadRehearsal";
import { localTime, localTimeOf, signedMinutes } from "../lib/format";
import { inviteLink, navigate } from "../lib/route";
import { useCommand } from "../lib/useCommand";
import { useSnapshotPoll } from "../lib/useSnapshotPoll";
import { FreshnessChip, StaleSnapshotNotice } from "../components/Freshness";
import { RehearsalBanner } from "../components/RehearsalBanner";
import { RepairPreviewPanel } from "../components/RepairPreview";
import { StageOverview } from "../components/StageOverview";
import { ReadinessReminder } from "../components/ReadinessReminder";
import { Modal, CommandNotice, Loading, PageHeading } from "../components/UI";
import { useI18n } from "../lib/i18n";

const ACK_POLL_MS = 10_000;

export function OrganizerConsole({
  eventId,
  uid,
}: {
  eventId: string;
  uid: string;
}) {
  const { t } = useI18n();
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
  const [keynoteOpen, setKeynoteOpen] = useState(false);
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
        <h1>{t("Organizer console")}</h1>
        {loadError === "" ? (
          <Loading label={t("Loading stage console")} />
        ) : (
          <>
            <p className="notice notice-bad" role="alert">
              {loadError}
            </p>
            <button type="button" onClick={() => navigate("#/")}>
              {t("Back to start")}
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

  // The labeled demo action is offered only on the server-seeded rehearsal, and only while
  // the scenario is not already loaded at the keynote.
  const rehearsalSteps =
    state.demoSeed === "college-demo-v1" ? planLoadRehearsal(state) : [];

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

  /**
   * The §12 demo action. It replays the ordinary command sequence — no endpoint and no
   * permission is bypassed — and stops at the first failure rather than guessing.
   */
  const onLoadRehearsal = async (): Promise<void> => {
    const steps = planLoadRehearsal(state);
    if (steps.length === 0) return;
    let rev = revision;
    for (const step of steps) {
      let result: RevisionMutation | null;
      if (step.kind === "publish") {
        result = await command.run(`demo:publish:${rev}`, (key) =>
          publishEvent(eventId, rev, key),
        );
      } else if (step.kind === "start") {
        result = await command.run(`demo:start:${step.cueId}:${rev}`, (key) =>
          startCueCommand(eventId, step.cueId, rev, key),
        );
      } else if (step.kind === "complete") {
        result = await command.run(
          `demo:complete:${step.cueId}:${rev}`,
          (key) => completeCueCommand(eventId, step.cueId, rev, key),
        );
      } else {
        result = await command.run(
          `demo:clock:${step.targetMin}:${rev}`,
          (key) =>
            setRehearsalClock(
              eventId,
              rev,
              rehearsalClockIso(state.startsAt, step.targetMin),
              key,
            ),
        );
      }
      if (result === null) return;
      rev = result.revision;
    }
    setKeynoteOpen(false);
    await reload();
    poll.refresh();
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
          description={t(
            "Stage console · Every cue and every change in one place.",
          )}
          actions={
            <>
              <button
                className="icon-button"
                aria-label={t("Refresh console")}
                onClick={() => {
                  void reload();
                  poll.refresh();
                }}
              >
                <ReloadIcon />
              </button>
              <a className="button-link" href={`#/anchor/${eventId}`}>
                {t("Anchor view")}
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
            <span className="chip chip-info">
              {t("revision {revision}", { revision })}
            </span>
            <span
              className={`chip ${state.scheduleHealth === "valid" ? "chip-ok" : "chip-warn"}`}
            >
              {state.scheduleHealth === "valid"
                ? t("Schedule valid")
                : t("Needs repair")}
            </span>
            <span className="chip chip-info">{t(state.phase)}</span>
          </div>
        </div>

        <div className="console-metrics">
          <div>
            <ClockIcon />
            <span>{t("Event clock")}</span>
            <strong>
              {state.scenarioNowAt
                ? localTimeOf(state.startsAt, state.scenarioNowAt)
                : localTimeOf(state.startsAt, poll.serverNowIso)}
              <small> IST</small>
            </strong>
          </div>
          <div>
            <CheckCircledIcon />
            <span>{t("Cues completed")}</span>
            <strong>
              {ordered.filter((c) => c.status === "completed").length}
              <small> / {ordered.length}</small>
            </strong>
          </div>
          <div>
            <ClockIcon />
            <span>{t("Hard finish")}</span>
            <strong>
              {localTime(state.startsAt, state.hardEndMin)}
              <small> IST</small>
            </strong>
          </div>
          <div>
            <PersonIcon />
            <span>{t("Anchor handoff")}</span>
            <strong className="metric-word">
              {currentAck ? t("Received") : t("Awaiting ack")}
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
            {loadError}{" "}
            <button onClick={() => void reload()}>{t("Reconnect")}</button>
          </p>
        )}
        {command.status === "pending" ? (
          <p className="notice notice-warn" role="alert">
            {t("Waiting for the server to confirm this action…")}
          </p>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {envelope?.publishedRevision
            ? t("Published runbook revision {revision}.", {
                revision: envelope.publishedRevision,
              })
            : t("Draft runbook. Not yet published.")}
        </p>
        <StageOverview
          state={state}
          nowAt={state.scenarioNowAt ?? poll.serverNowIso}
          lastSyncAt={envelope?.publishedRevision ?? null}
          freshness={poll.freshness}
        />
        {envelope?.publishedRevision !== null && (
          <ReadinessReminder
            state={state}
            nowAt={state.scenarioNowAt ?? poll.serverNowIso}
            freshness={poll.freshness}
            onReplan={(cueId) => {
              setReleaseCue(cueId);
              const details =
                document.querySelector<HTMLDetailsElement>(".release-controls");
              if (details) details.open = true;
              window.setTimeout(() => {
                document.getElementById("releaseMinute")?.focus();
              }, 0);
            }}
          />
        )}
        <div className="console-grid">
          <div>
            <div className="card">
              <h2>{t("Agenda")}</h2>
              <div
                className="table-scroll"
                role="region"
                aria-label={t("Event agenda")}
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{t("Cue")}</th>
                      <th scope="col">{t("Planned")}</th>
                      <th scope="col">{t("Actual / forecast")}</th>
                      <th scope="col" className="num">
                        {t("Pref / min")}
                      </th>
                      <th scope="col" className="num">
                        {t("Rules")}
                      </th>
                      <th scope="col">{t("Status")}</th>
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
                                    ? `${localTime(state.startsAt, state.activeForecastEndMin)} (${t("forecast")})`
                                    : "…"
                              }`}
                          {cue.actualTimeSource === "rehearsal_clock" ? (
                            <span className="small muted">
                              {" "}
                              {t("rehearsal clock")}
                            </span>
                          ) : cue.actualTimeSource === "server_clock" ? (
                            <span className="small muted">
                              {" "}
                              {t("server clock")}
                            </span>
                          ) : null}
                        </td>
                        <td className="num">
                          {cue.preferredDurationMin}/{cue.minDurationMin}
                        </td>
                        <td className="num small">
                          {cue.fixedStartMin !== null
                            ? t("fixed {time}", {
                                time: localTime(
                                  state.startsAt,
                                  cue.fixedStartMin,
                                ),
                              })
                            : cue.notBeforeMin !== null
                              ? t("from {time}", {
                                  time: localTime(
                                    state.startsAt,
                                    cue.notBeforeMin,
                                  ),
                                })
                              : cue.bufferBeforeMin > 0
                                ? t("buffer {minutes}", {
                                    minutes: cue.bufferBeforeMin,
                                  })
                                : "—"}
                        </td>
                        <td>{t(cue.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {state.cues.length === 0 ? (
                <p className="muted small">
                  {t(
                    "No cues yet. Add the agenda on the setup screen before publishing.",
                  )}
                </p>
              ) : null}
            </div>
          </div>

          <div>
            {rehearsalSteps.length > 0 ? (
              <div className="card">
                <h2>{t("Seeded rehearsal")}</h2>
                <p className="small muted">
                  {t(
                    "This is the labeled fictional TechFest scenario. The action below publishes it and advances the opening so the keynote is active, using the normal stage commands — the same buttons a person would click.",
                  )}
                </p>
                <button
                  type="button"
                  className="primary"
                  onClick={() => setKeynoteOpen(true)}
                  disabled={readOnly}
                >
                  {t("Load rehearsal at keynote")}
                </button>
              </div>
            ) : null}
            {state.phase === "draft" ? (
              <div className="card">
                <h2>{t("Publish the runbook")}</h2>
                <p className="small muted">
                  {t(
                    "Publishing validates the full draft and makes it visible to anchors. It does not start the first cue.",
                  )}
                </p>
                <div className="row">
                  <button
                    type="button"
                    onClick={() => navigate(`#/event/${eventId}/setup`)}
                  >
                    {t("Edit agenda")}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setPublishOpen(true)}
                    disabled={readOnly || state.cues.length === 0}
                  >
                    {busy ? t("Publishing…") : t("Validate and publish")}
                  </button>
                </div>
              </div>
            ) : null}

            {state.phase === "running" ? (
              <>
                <div className="card">
                  <h2>{t("Run the stage")}</h2>
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
                          ? t("No cues left")
                          : t("Start {cue}", { cue: firstPending.title })}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void onComplete(activeCue.id)}
                        disabled={readOnly}
                      >
                        {t("Complete {cue}", { cue: activeCue.title })}
                      </button>
                    )}
                  </div>
                  {state.mode === "rehearsal" ? (
                    <>
                      <h3 className="small">{t("Scenario clock")}</h3>
                      <p className="small muted">
                        {t(
                          "The scenario clock advances only forward. Actual times recorded while it is in use are labelled as rehearsal-clock times.",
                        )}
                      </p>
                      <div className="row">
                        {[1, 5, 10].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => void advanceClock(n)}
                            disabled={readOnly}
                          >
                            {t("+{minutes} min", { minutes: n })}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>

                <div className="card">
                  <h2>{t("Report an overrun")}</h2>
                  {activeCue === null ? (
                    <p className="small muted">
                      {t(
                        "A repair can be previewed between cues as well; with no active cue the plan is rebuilt from the current scenario minute.",
                      )}
                    </p>
                  ) : (
                    <p className="small muted">
                      {t(
                        "{cue} currently forecasts {time}. Entering a delay sends a new absolute forecast end, so re-previewing never stacks the delay.",
                        {
                          cue: activeCue.title,
                          time:
                            state.activeForecastEndMin === null
                              ? "—"
                              : localTime(
                                  state.startsAt,
                                  state.activeForecastEndMin,
                                ),
                        },
                      )}
                    </p>
                  )}
                  <div className="field">
                    <label htmlFor="delay">{t("Delay in minutes")}</label>
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
                        {t("New forecast end {time} ({minutes} min)", {
                          time: localTime(
                            state.startsAt,
                            state.activeForecastEndMin + Number(delayMinutes),
                          ),
                          minutes: signedMinutes(Number(delayMinutes)),
                        })}
                      </span>
                    ) : null}
                  </div>
                  <details className="release-controls">
                    <summary>{t("Speaker arriving late?")}</summary>
                    <div className="field">
                      <label htmlFor="releaseCue">{t("Pending cue")}</label>
                      <select
                        id="releaseCue"
                        value={releaseCue}
                        onChange={(e) => setReleaseCue(e.target.value)}
                        disabled={readOnly}
                      >
                        <option value="">{t("No availability update")}</option>
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
                          {t("Available from minute after start")}
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
                    {busy ? t("Calculating…") : t("Preview recovery plan")}
                  </button>
                </div>
              </>
            ) : null}

            <div className="card">
              <h2>{t("Anchor")}</h2>
              <p className="small muted">
                {t("Published revision")}{" "}
                <strong>
                  {envelope?.publishedRevision ?? t("not published")}
                </strong>
              </p>
              {acks.length === 0 ? (
                <p className="small muted">{t("No acknowledgements yet.")}</p>
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
                          ? t("current")
                          : t("behind")}
                      </span>{" "}
                      {t("revision {revision} at {time}", {
                        revision: a.revision,
                        time: new Date(a.acknowledgedAt).toLocaleTimeString(),
                      })}
                    </li>
                  ))}
                </ul>
              )}
              <p className="small muted">
                {currentAck === undefined
                  ? t(
                      "Publication success and acknowledgement are separate: the anchor may not have seen this revision yet.",
                    )
                  : t(
                      "The anchor has acknowledged receiving this revision. That is not confirmation the words were spoken.",
                    )}
              </p>
              <div className="row">
                <button
                  type="button"
                  onClick={() => void onInvite()}
                  disabled={readOnly}
                >
                  {t("Invite an anchor")}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`#/anchor/${eventId}`)}
                >
                  {t("Preview anchor view")}
                </button>
              </div>
              {invite === null ? null : (
                <button onClick={() => setInviteOpen(true)}>
                  {t("Show invitation")}
                </button>
              )}
              <Modal
                open={inviteOpen}
                onClose={() => setInviteOpen(false)}
                title={t("Invite your anchor")}
                description={t(
                  "A private, single-use invitation. Valid for one hour.",
                )}
              >
                {invite === null ? null : (
                  <div className="notice small">
                    <p>
                      {t(
                        "Single-use invitation, valid one hour. Shown once — copy it now.",
                      )}
                    </p>
                    <p className="mono" style={{ overflowWrap: "anywhere" }}>
                      {inviteLink(eventId, invite.inviteCode)}
                    </p>
                    <p className="muted">
                      {t(
                        "Open it in a different browser profile or an incognito window: the same profile would join as you, the owner.",
                      )}
                    </p>
                    <button
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(inviteLink(eventId, invite.inviteCode))
                          .then(() => setCopyMessage(t("Invitation copied.")))
                          .catch(() =>
                            setCopyMessage(
                              t(
                                "Copy unavailable. Select and copy the link above.",
                              ),
                            ),
                          );
                      }}
                    >
                      {t("Copy invitation link")}
                    </button>
                    <p role="status">{copyMessage}</p>
                  </div>
                )}
              </Modal>
            </div>

            <p className="small muted">
              {t("Signed in as {uid}. Demo data expires {time}.", {
                uid,
                time: new Date(state.expiresAt).toLocaleString(),
              })}
            </p>
          </div>
        </div>

        <Modal
          open={keynoteOpen}
          onClose={() => setKeynoteOpen(false)}
          title={t("Load rehearsal at keynote?")}
          description={t(
            "Publishes the seeded draft and advances the opening so the keynote is active, using the normal stage commands only.",
          )}
          busy={busy}
        >
          <p className="small muted">
            {t(
              "The commands run in order — publish, start and complete the opening, advance the scenario clock to each published cue boundary, then start the keynote. No rule is bypassed and every step is an ordinary idempotent command.",
            )}
          </p>
          <div className="row end">
            <button disabled={busy} onClick={() => setKeynoteOpen(false)}>
              {t("Cancel")}
            </button>
            <Button disabled={busy} onClick={() => void onLoadRehearsal()}>
              {command.status === "pending"
                ? t("Loading…")
                : t("Load rehearsal at keynote")}
            </Button>
          </div>
          <CommandNotice
            {...command}
            retry={() =>
              void command.retry<RevisionMutation>().then(async (result) => {
                if (result) {
                  await reload();
                  poll.refresh();
                }
              })
            }
          />
        </Modal>
        <Modal
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          title={t("Publish the runbook?")}
          description={t(
            "This validates your draft and shares the approved agenda with your anchor. Direct agenda and fact editing closes after publication.",
          )}
          busy={busy}
        >
          <p>
            {t("{count} cues · Hard finish {time} IST", {
              count: ordered.length,
              time: localTime(state.startsAt, state.hardEndMin),
            })}
          </p>
          <div className="row end">
            <button disabled={busy} onClick={() => setPublishOpen(false)}>
              {t("Keep reviewing")}
            </button>
            <Button disabled={busy} onClick={() => void onPublish()}>
              {command.status === "pending"
                ? t("Publishing…")
                : t("Validate and publish")}
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
              {t("Retry original request")}
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
          title={t("Review the recovery plan")}
          description={t(
            "Check every timing change before publishing a new revision.",
          )}
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
              {t("Retry original request")}
            </button>
          )}
        </Modal>
      </div>
    </div>
  );
}
