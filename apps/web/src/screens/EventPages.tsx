import { useCallback, useEffect, useState } from "react";
import type { EventState } from "@cuepilot/domain";
import {
  ArrowRightIcon,
  PersonIcon,
  ReaderIcon,
  SpeakerLoudIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { useEvent } from "../lib/useEvent";
import { useCommand } from "../lib/useCommand";
import {
  approveScript,
  deleteEvent,
  dismissAnnouncement,
  getRevision,
  listRevisions,
  errorCopy,
  proposeScript,
  publishAnnouncement,
  type RevisionEntry,
  type ScriptDraftResponse,
} from "../lib/api";
import { forgetEvent } from "../lib/storage";
import { navigate, type EventPage } from "../lib/route";
import { localTime } from "../lib/format";
import { RehearsalBanner } from "../components/RehearsalBanner";
import { ScriptReview } from "../components/ScriptReview";
import {
  Loading,
  ErrorState,
  PageHeading,
  EmptyState,
  Modal,
  CommandNotice,
} from "../components/UI";

const titles = {
  speakers: "Speakers & facts",
  scripts: "Host scripts",
  announcements: "Announcements",
  history: "Revision history",
  settings: "Event settings",
} as const;
const descriptions = {
  speakers:
    "Approved facts, pronunciation, and the cues each person is part of.",
  scripts: "Reviewed host copy, tied to your event’s approved facts.",
  announcements: "Published messages shared with your anchor.",
  history: "An immutable record of changes to the event.",
  settings: "Event details, retention, and workspace controls.",
} as const;
const languageNames = { en: "English", hi: "Hindi", gu: "Gujarati" };
export function EventPages({
  eventId,
  page,
}: {
  eventId: string;
  page: Exclude<EventPage, "setup" | "console">;
}) {
  const { data, loading, error, reload } = useEvent(eventId);
  if (loading && !data) return <Loading label={`Loading ${page}`} />;
  if (error) return <ErrorState message={error} retry={() => void reload()} />;
  if (!data)
    return <ErrorState message="The server did not return an event." />;
  const state = data.state;
  return (
    <>
      <RehearsalBanner mode={state.mode} />
      <div className="page">
        <PageHeading
          title={titles[page]}
          description={descriptions[page]}
          actions={
            <>
              <span className="chip chip-info">Revision {state.revision}</span>
              <button
                className="icon-button"
                aria-label="Refresh page"
                onClick={() => void reload()}
              >
                <ReloadIcon />
              </button>
            </>
          }
        />
        {page === "speakers" && <Speakers state={state} />}
        {page === "scripts" && (
          <Scripts
            state={state}
            eventId={eventId}
            reload={() => void reload()}
          />
        )}
        {page === "announcements" && (
          <Announcements
            state={state}
            eventId={eventId}
            reload={() => void reload()}
          />
        )}
        {page === "history" && <History eventId={eventId} />}
        {page === "settings" && (
          <Settings state={state} reload={() => void reload()} />
        )}
      </div>
    </>
  );
}
function Speakers({ state }: { state: EventState }) {
  const [search, setSearch] = useState("");
  const speakers = state.speakers.filter((s) =>
    s.displayName.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="section-toolbar">
        <label className="search-field">
          <PersonIcon />
          <input
            aria-label="Search speakers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a speaker…"
          />
        </label>
        {state.phase === "draft" ? (
          <a className="button-link" href={`#/event/${state.id}/setup`}>
            Edit speakers
            <ArrowRightIcon />
          </a>
        ) : (
          <span className="small muted">Facts locked after publication</span>
        )}
      </div>
      {!speakers.length ? (
        <EmptyState
          title={search ? "No matching speakers" : "No speakers added yet"}
          description={
            search
              ? "Try another name."
              : "Add speakers and approved facts in event setup."
          }
        />
      ) : (
        <div className="speaker-grid">
          {speakers.map((speaker) => (
            <article className="card speaker-card" key={speaker.id}>
              <div className="row">
                <span className="speaker-avatar">
                  {speaker.displayName
                    .split(" ")
                    .map((word) => word[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <h2>{speaker.displayName}</h2>
                  <p className="small muted">
                    {speaker.pronunciationHint || "No pronunciation hint added"}
                  </p>
                </div>
              </div>
              <h3 className="small">Approved facts</h3>
              {speaker.facts.length ? (
                <ul className="fact-list">
                  {speaker.facts.map((fact) => (
                    <li key={fact.id}>{fact.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">No approved facts yet.</p>
              )}
              <div className="speaker-cues">
                {state.cues
                  .filter((c) => c.speakerId === speaker.id)
                  .map((cue) => (
                    <span key={cue.id} className="chip chip-info">
                      {cue.title}
                    </span>
                  ))}
              </div>
            </article>
          ))}
        </div>
      )}
      {state.eventFacts.length > 0 && (
        <section className="card">
          <h2>Event facts</h2>
          <ul className="fact-list">
            {state.eventFacts.map((fact) => (
              <li key={fact.id}>{fact.text}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
function Scripts({
  state,
  eventId,
  reload,
}: {
  state: EventState;
  eventId: string;
  reload: () => void;
}) {
  const command = useCommand();
  const [draft, setDraft] = useState<ScriptDraftResponse | null>(null);
  const busy = command.status === "pending" || command.status === "unknown";
  const [draftLanguage, setDraftLanguage] = useState<"en" | "hi" | "gu">("en");
  const [kind, setKind] = useState<
    "opening" | "introduction" | "transition" | "closing" | "announcement"
  >("opening");
  const [cueId, setCueId] = useState<string>("");
  const [language, setLanguage] = useState<"en" | "hi" | "gu">("en");
  const [selected, setSelected] = useState<string>("all");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const scripts = state.approvedScripts.filter(
    (script) => selected === "all" || script.language === selected,
  );
  const script = state.approvedScripts.find((item) => item.id === reviewId);
  const facts = [
    { id: "event:name", text: state.name },
    ...state.speakers.map((speaker) => ({
      id: `speaker:${speaker.id}:name`,
      text: speaker.displayName,
    })),
    ...state.eventFacts,
    ...state.speakers.flatMap((s) => s.facts),
  ];
  return (
    <>
      <section className="capability-note">
        <ReaderIcon />
        <div>
          <strong>Draft host copy from approved facts</strong>
          <p>
            The model only ever sees facts you approved, and it never sets a
            time. Every draft is reviewed by you before it reaches the stage.
          </p>
        </div>
      </section>

      <div className="card">
        <h2>Generate a draft</h2>
        <div className="row">
          <label className="row small" htmlFor="script-kind">
            Kind
            <select
              id="script-kind"
              disabled={busy}
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="opening">Opening</option>
              <option value="introduction">Speaker introduction</option>
              <option value="transition">Transition</option>
              <option value="closing">Closing</option>
              <option value="announcement">Announcement</option>
            </select>
          </label>
          <label className="row small" htmlFor="script-cue">
            Cue
            <select
              id="script-cue"
              value={cueId}
              disabled={busy}
              onChange={(e) => setCueId(e.target.value)}
            >
              <option value="">No specific cue</option>
              {state.cues.map((cue) => (
                <option key={cue.id} value={cue.id}>
                  {cue.title}
                </option>
              ))}
            </select>
          </label>
          <label className="row small" htmlFor="script-language">
            Language
            <select
              id="script-language"
              value={language}
              disabled={busy}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
            >
              {Object.entries(languageNames).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => {
              void command
                .run(
                  `script:${state.revision}:${kind}:${cueId}:${language}`,
                  (key) =>
                    proposeScript(
                      eventId,
                      {
                        expectedRevision: state.revision,
                        kind,
                        cueId: cueId === "" ? null : cueId,
                        language,
                      },
                      key,
                    ),
                )
                .then((result) => {
                  if (result) {
                    setDraft(result);
                    setDraftLanguage(language);
                  }
                });
            }}
          >
            {command.status === "pending" ? "Drafting\u2026" : "Generate draft"}
          </button>
        </div>
        {language !== "en" && (
          <p className="small muted">
            Hindi and Gujarati output is marked “generated; language quality
            unverified” until a qualified reviewer has read it.
          </p>
        )}
        <CommandNotice
          status={command.status}
          message={command.message}
          {...(draft === null
            ? {
                okMessage:
                  "Script published. Your anchor's runbook now carries these words.",
              }
            : {})}
          retry={() =>
            void command
              .retry<ScriptDraftResponse | { scriptId: string }>()
              .then((result) => {
                if (!result) return;
                if ("proposalId" in result) {
                  setDraft(result);
                  setDraftLanguage(language);
                } else {
                  setDraft(null);
                  reload();
                }
              })
          }
        />
      </div>

      {draft && (
        <ScriptReview
          key={draft.proposalId}
          state={state}
          draft={draft}
          busy={busy}
          language={draftLanguage}
          message={command.status === "failed" ? command.message : ""}
          onDiscard={() => {
            setDraft(null);
            command.reset();
          }}
          onApprove={(body, usedFactIds) => {
            void command
              .run(`approve-script:${draft.proposalId}`, (key) =>
                approveScript(
                  eventId,
                  draft.proposalId,
                  { expectedRevision: draft.baseRevision, body, usedFactIds },
                  key,
                ),
              )
              .then((result) => {
                if (result) {
                  setDraft(null);
                  reload();
                }
              });
          }}
        />
      )}
      <div className="section-toolbar">
        <h2>
          Approved host copy <span className="muted">({scripts.length})</span>
        </h2>
        <label className="row small" htmlFor="script-filter-language">
          Language
          <select
            id="script-filter-language"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="all">All languages</option>
            {Object.entries(languageNames).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!scripts.length ? (
        <EmptyState
          title="No approved scripts"
          description="Generate a draft above, review it against your approved facts, then publish it to the anchor."
        />
      ) : (
        scripts.map((script) => (
          <article key={script.id} className="card">
            <div className="row spread">
              <h2>
                {state.cues.find((c) => c.id === script.cueId)?.title ??
                  script.kind}
              </h2>
              <span className="chip chip-info">
                {languageNames[script.language]}
              </span>
            </div>
            <p className="script-body" lang={script.language}>
              {script.body}
            </p>
            <div className="row spread">
              <span className="small muted">
                {script.source === "template"
                  ? "Template fallback — AI unavailable."
                  : script.source === "gemini"
                    ? "AI-generated copy · reviewed and approved"
                    : "Human-written copy"}{" "}
                · Approved {new Date(script.approvedAt).toLocaleString()}
              </span>
              <button onClick={() => setReviewId(script.id)}>
                View source facts
              </button>
            </div>
          </article>
        ))
      )}
      <Modal
        open={!!script}
        onClose={() => setReviewId(null)}
        title="Approved script & source facts"
        description="Read-only provenance for the approved copy."
      >
        {script && (
          <>
            <p className="script-body" lang={script.language}>
              {script.body}
            </p>
            <h3>Referenced facts</h3>
            <ul className="fact-list">
              {script.usedFactIds.map((id) => (
                <li key={id}>
                  {facts.find((f) => f.id === id)?.text ??
                    "Referenced fact is not present in this snapshot."}
                </li>
              ))}
            </ul>
            <p className="small muted">
              Source: {script.source}
              {script.model ? ` · Model: ${script.model}` : ""} · Approved{" "}
              {new Date(script.approvedAt).toLocaleString()}
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
function Announcements({
  state,
  eventId,
  reload,
}: {
  state: EventState;
  eventId: string;
  reload: () => void;
}) {
  const command = useCommand();
  const busy = command.status === "pending" || command.status === "unknown";
  const [filter, setFilter] = useState("active");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<"en" | "hi" | "gu">("en");
  const messages = state.announcements.filter(
    (a) => filter === "all" || a.dismissedAt === null,
  );
  return (
    <>
      <section className="capability-note">
        <SpeakerLoudIcon />
        <div>
          <strong>Publish a message to your anchor</strong>
          <p>
            You write every word. Publishing is the approval step, and the
            message travels in the same published snapshot as the schedule.
          </p>
        </div>
      </section>

      <div className="card">
        <h2>New announcement</h2>
        <div className="field">
          <label htmlFor="ann-text">Message</label>
          <textarea
            disabled={busy}
            id="ann-text"
            rows={3}
            maxLength={500}
            value={text}
            lang={language}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type the exact words the anchor should see."
          />
          <span className="small muted">{text.length}/500 characters</span>
        </div>
        <div className="row">
          <label className="row small" htmlFor="announcement-language">
            Language
            <select
              id="announcement-language"
              value={language}
              disabled={busy}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
            >
              {Object.entries(languageNames).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="primary"
            disabled={busy || text.trim().length === 0}
            onClick={() => {
              void command
                .run(`announce:${state.revision}`, (key) =>
                  publishAnnouncement(
                    eventId,
                    {
                      expectedRevision: state.revision,
                      text: text.trim(),
                      language,
                    },
                    key,
                  ),
                )
                .then((result) => {
                  if (result) {
                    setText("");
                    reload();
                  }
                });
            }}
          >
            {command.status === "pending"
              ? "Publishing\u2026"
              : "Publish announcement"}
          </button>
        </div>
        <p className="small muted">
          CuePilot never writes an announcement for you. There is no automatic
          emergency wording.
        </p>
        <CommandNotice
          status={command.status}
          message={command.message}
          okMessage="Announcement published. It is on your anchor's screen now."
          retry={() =>
            void command.retry<{ announcementId?: string }>().then((result) => {
              if (result) {
                if (result.announcementId) setText("");
                reload();
              }
            })
          }
        />
      </div>
      <div className="section-toolbar">
        <div
          className="segmented"
          role="group"
          aria-label="Announcement filter"
        >
          <button
            className={filter === "active" ? "selected" : ""}
            aria-pressed={filter === "active"}
            onClick={() => setFilter("active")}
          >
            Active
          </button>
          <button
            className={filter === "all" ? "selected" : ""}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All messages
          </button>
        </div>
      </div>
      {!messages.length ? (
        <EmptyState
          title="No announcements here"
          description="Published messages will be shown here and in the anchor runbook. No message has been sent."
        />
      ) : (
        messages.map((message) => (
          <article className="card" key={message.id}>
            <div className="row spread">
              <span
                className={`chip ${message.dismissedAt ? "chip-info" : "chip-ok"}`}
              >
                {message.dismissedAt ? "Dismissed" : "Active"}
              </span>
              <span className="small muted">
                {new Date(message.publishedAt).toLocaleString()} ·{" "}
                {languageNames[message.language]}
              </span>
            </div>
            <p className="script-body" lang={message.language}>
              {message.text}
            </p>
            {!message.dismissedAt && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void command
                    .run(`dismiss:${message.id}`, (key) =>
                      dismissAnnouncement(
                        eventId,
                        message.id,
                        state.revision,
                        key,
                      ),
                    )
                    .then((result) => {
                      if (result) reload();
                    });
                }}
              >
                Dismiss banner
              </button>
            )}
          </article>
        ))
      )}
    </>
  );
}
function History({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<RevisionEntry[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<EventState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detailError, setDetailError] = useState("");
  const load = useCallback(
    async (cursor: number | null) => {
      setLoading(true);
      setError("");
      try {
        const result = await listRevisions(eventId, cursor);
        if (result) {
          setItems((current) =>
            cursor === null
              ? result.items
              : [
                  ...current,
                  ...result.items.filter(
                    (item) =>
                      !current.some((c) => c.revision === item.revision),
                  ),
                ],
          );
          setBefore(result.nextBefore);
        }
      } catch (cause) {
        setError(errorCopy(cause));
      } finally {
        setLoading(false);
      }
    },
    [eventId],
  );
  useEffect(() => {
    // Read the external audit log when the event changes.
    // oxlint-disable-next-line react/set-state-in-effect
    void load(null);
  }, [load]);
  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;
    void getRevision(eventId, selected)
      .then((result) => {
        if (result && !cancelled) setDetail(result.state);
      })
      .catch((cause) => {
        if (!cancelled) setDetailError(errorCopy(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [selected, eventId]);
  return (
    <>
      {error && (
        <div className="notice notice-bad" role="alert">
          {error}
          <button onClick={() => void load(items.length ? before : null)}>
            Retry history
          </button>
        </div>
      )}
      {loading && !items.length ? (
        <Loading label="Loading revision history" />
      ) : !items.length ? (
        <EmptyState
          title="No published revisions yet"
          description="Save your draft and publish it from the stage console to create a runbook revision."
        />
      ) : (
        <section
          className="card table-scroll"
          role="region"
          aria-label="Revision history"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Revision</th>
                <th scope="col">Change</th>
                <th scope="col">Published at</th>
                <th scope="col">Actor</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.revision}>
                  <th scope="row">
                    <span className="revision-number">R{item.revision}</span>
                  </th>
                  <td>{item.action.replaceAll("_", " ")}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="mono small">{item.actorUid.slice(0, 8)}</td>
                  <td>
                    <button
                      onClick={() => {
                        setDetail(null);
                        setDetailError("");
                        setSelected(item.revision);
                      }}
                    >
                      View revision {item.revision}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {before !== null && (
        <button disabled={loading} onClick={() => void load(before)}>
          {loading ? "Loading…" : "Load older revisions"}
        </button>
      )}
      <p className="small muted">
        Published snapshots are immutable. Restoring an old snapshot is not
        supported.
      </p>
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={`Revision ${selected ?? ""}`}
        description="Historical snapshot. This is not the current stage view."
      >
        {detailError ? (
          <p className="notice notice-bad" role="alert">
            {detailError}
          </p>
        ) : !detail ? (
          <Loading label="Loading revision" />
        ) : (
          <>
            <RehearsalBanner mode={detail.mode} />
            <h2>{detail.name}</h2>
            <p className="small muted">
              {detail.phase} ·{" "}
              {detail.scheduleHealth === "valid"
                ? "Schedule valid"
                : "Needs repair"}{" "}
              · Updated {new Date(detail.updatedAt).toLocaleString()}
            </p>
            <RunbookTable state={detail} />
            <h3>Approved copy</h3>
            {detail.approvedScripts.length ? (
              detail.approvedScripts.map((script) => (
                <p
                  className="script-body"
                  lang={script.language}
                  key={script.id}
                >
                  {script.body}
                </p>
              ))
            ) : (
              <p className="muted">No approved scripts in this revision.</p>
            )}
            <h3>Announcements</h3>
            {detail.announcements.length ? (
              detail.announcements.map((a) => (
                <p lang={a.language} key={a.id}>
                  {a.text} ({a.dismissedAt ? "dismissed" : "active"})
                </p>
              ))
            ) : (
              <p className="muted">No announcements in this revision.</p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
export function RunbookTable({ state }: { state: EventState }) {
  return (
    <div
      className="table-scroll"
      role="region"
      aria-label="Published agenda"
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Time (IST)</th>
            <th scope="col">Speaker</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {state.cues
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((cue) => (
              <tr key={cue.id}>
                <th scope="row">{cue.title}</th>
                <td className="mono">
                  {localTime(state.startsAt, cue.plannedStartMin)}–
                  {localTime(state.startsAt, cue.plannedEndMin)}
                </td>
                <td>
                  {state.speakers.find((s) => s.id === cue.speakerId)
                    ?.displayName ?? "—"}
                </td>
                <td>{cue.status}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
function Settings({
  state,
  reload,
}: {
  state: EventState;
  reload: () => void;
}) {
  const command = useCommand();
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const [copied, setCopied] = useState("");
  const busy = command.status === "pending" || command.status === "unknown";
  const finish = (result: true | null) => {
    if (result) {
      forgetEvent(state.id);
      navigate("#/");
    }
  };
  return (
    <>
      <section className="card">
        <h2>Event identity</h2>
        <dl className="settings-list">
          <div>
            <dt>Name</dt>
            <dd>{state.name}</dd>
          </div>
          <div>
            <dt>Event ID</dt>
            <dd className="mono">{state.id}</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>{state.mode}</dd>
          </div>
          <div>
            <dt>Phase</dt>
            <dd>{state.phase}</dd>
          </div>
          <div>
            <dt>Timezone</dt>
            <dd>Asia/Kolkata (IST)</dd>
          </div>
          <div>
            <dt>Data expires</dt>
            <dd>{new Date(state.expiresAt).toLocaleString()}</dd>
          </div>
        </dl>
        <button
          onClick={() => {
            void navigator.clipboard
              .writeText(state.id)
              .then(() => setCopied("Event ID copied."))
              .catch(() =>
                setCopied(
                  "Copy unavailable. Select the event ID above and copy it.",
                ),
              );
          }}
        >
          Copy event ID
        </button>
        <span className="small muted" role="status">
          {copied}
        </span>
      </section>
      <section className="card">
        <h2>Anonymous session</h2>
        <p className="muted">
          Only this browser identity can manage the event. There is no permanent
          account or recovery flow. Invitations grant anchor access only.
        </p>
        <p className="small muted">
          Owner ID: <span className="mono">{state.ownerUid}</span>
        </p>
      </section>
      <section className="card danger-zone">
        <h2>Delete event</h2>
        <p>
          This permanently removes the event, its runbook, revisions, and anchor
          access. Local shortcuts and snapshots are also cleared.
        </p>
        <button className="danger" onClick={() => setConfirm(true)}>
          Delete event
        </button>
      </section>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Permanently delete this event?"
        description="This cannot be undone. Anchors will lose access to the published runbook."
        busy={busy}
      >
        <div className="field">
          <label htmlFor="delete-confirm">Type DELETE to confirm</label>
          <input
            id="delete-confirm"
            autoComplete="off"
            value={typed}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        <CommandNotice
          {...command}
          retry={() => void command.retry<true>().then(finish)}
        />
        {command.code === "NOT_FOUND" && (
          <p className="notice notice-warn">
            The event is no longer available. A previous deletion may have
            succeeded.
            <button
              onClick={() => {
                forgetEvent(state.id);
                navigate("#/");
              }}
            >
              Remove local copy
            </button>
          </p>
        )}
        {command.code === "REVISION_CONFLICT" && (
          <button
            onClick={() => {
              setConfirm(false);
              command.reset();
              reload();
            }}
          >
            Refresh event before deleting
          </button>
        )}
        <div className="row end">
          <button disabled={busy} onClick={() => setConfirm(false)}>
            Keep event
          </button>
          <button
            className="danger"
            disabled={busy || typed !== "DELETE"}
            onClick={() =>
              void command
                .run("delete", (key) =>
                  deleteEvent(state.id, state.revision, key),
                )
                .then(finish)
            }
          >
            {command.status === "pending" ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </Modal>
    </>
  );
}
