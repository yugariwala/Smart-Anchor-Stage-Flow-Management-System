import {
  draftConfigSchema,
  draftCueInputSchema,
  speakerSchema,
  factSchema,
  type Speaker,
  type Fact,
} from "@cuepilot/domain";
import { useEffect, useState } from "react";
import {
  PlusIcon,
  TrashIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowRightIcon,
} from "@radix-ui/react-icons";
import { Button } from "@radix-ui/themes";
import {
  getEvent,
  saveDraft,
  errorCopy,
  type DraftBody,
  type DraftCueInputBody,
  type RevisionMutation,
} from "../lib/api";
import { FIXTURE_CUES, FIXTURE_SPEAKERS } from "../lib/fixture";
import {
  agendaCsvTemplate,
  importAgendaCsv,
  type AgendaImport,
} from "../lib/csvAgenda";
import { navigate } from "../lib/route";
import { useCommand } from "../lib/useCommand";
import { RehearsalBanner } from "../components/RehearsalBanner";
import {
  PageHeading,
  Loading,
  ErrorState,
  EmptyState,
  CommandNotice,
  Modal,
} from "../components/UI";

const toLocal = (iso: string) =>
  new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 16);
const toIso = (local: string) =>
  new Date(local + ":00+05:30").toISOString().replace(".000Z", "Z");

/** The wire format is "minutes after start"; organizers enter a clock time. */
const offsetToClock = (startsAt: string, offsetMin: number): string => {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return "";
  return new Date(start + (330 + offsetMin) * 60_000)
    .toISOString()
    .slice(11, 16);
};
/**
 * Inverse of `offsetToClock`. A finish time at or before the start time is read as the
 * next day, so a late-evening event that ends after midnight still works. Out-of-range
 * results are returned unclamped — the existing draft validation is what refuses them,
 * so the UI never silently changes a number the organizer typed.
 */
const clockToOffset = (startsAt: string, clock: string): number | null => {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start) || !/^\d{2}:\d{2}$/.test(clock)) return null;
  const ist = new Date(start + 330 * 60_000);
  const [hours, minutes] = clock.split(":").map(Number);
  const delta =
    (hours ?? 0) * 60 +
    (minutes ?? 0) -
    (ist.getUTCHours() * 60 + ist.getUTCMinutes());
  return delta <= 0 ? delta + 1440 : delta;
};
/*
  Split deliberately. A first-time organizer needs two numbers to describe a session;
  the other four are constraints most events simply do not have, and every one of them
  already carries a working default. Showing all eight at equal weight read as eight
  required fields.
*/
const basicFields = [
  ["preferredDurationMin", "Planned length (minutes)", 1, 60],
  ["minDurationMin", "Shortest acceptable (minutes)", 1, 60],
] as const;
/** A real duration, so it stays a number of minutes. */
const advancedFields = [
  ["bufferBeforeMin", "Gap before this (minutes)", 0, 30],
] as const;
/**
 * These two are points in time, not lengths, so an organizer should give them as clock
 * times. Both are optional, and "not set" is a meaningful answer that a bare time input
 * cannot express — hence the explicit Set / Clear control beside each one.
 */
const clockFields = [
  [
    "notBeforeMin",
    "Speaker not available until",
    "The earliest this session may begin.",
  ],
  [
    "fixedStartMin",
    "Must start exactly at",
    "A commitment CuePilot will never move, such as a sponsor slot.",
  ],
] as const;
/** The solver takes 1-100; an organizer picks an intent. */
const PROTECTION_CHOICES = [
  [1, "Trim this first"],
  [20, "Normal"],
  [60, "Keep it full length"],
] as const;
export function SetupScreen({ eventId }: { eventId: string }) {
  const command = useCommand();
  const [draft, setDraft] = useState<DraftBody | null>(null);
  const [mode, setMode] = useState<"rehearsal" | "live">("rehearsal");
  const [phase, setPhase] = useState("draft");
  const [tab, setTab] = useState("details");
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [loadError, setLoadError] = useState("");
  const [fixtureOpen, setFixtureOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvResult, setCsvResult] = useState<AgendaImport | null>(null);
  const [csvFileName, setCsvFileName] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void getEvent(eventId)
      .then((result) => {
        if (!result || cancelled) return;
        const state = result.state;
        setMode(state.mode);
        setPhase(state.phase);
        setDraft({
          expectedRevision: state.revision,
          config: {
            name: state.name,
            startsAt: state.startsAt,
            hardEndMin: state.hardEndMin,
          },
          speakers: state.speakers,
          eventFacts: state.eventFacts,
          cues: state.cues.map(
            ({
              id,
              order,
              title,
              speakerId,
              preferredDurationMin,
              minDurationMin,
              compressionPenalty,
              bufferBeforeMin,
              notBeforeMin,
              fixedStartMin,
            }) => ({
              id,
              order,
              title,
              speakerId,
              preferredDurationMin,
              minDurationMin,
              compressionPenalty,
              bufferBeforeMin,
              notBeforeMin,
              fixedStartMin,
            }),
          ),
        });
        setLoadError("");
      })
      .catch((cause) => {
        if (!cancelled) setLoadError(errorCopy(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, attempt]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
        'a[href^="#/"]',
      );
      if (
        !anchor ||
        anchor.hash === window.location.hash ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      event.preventDefault();
      setLeaveTarget(anchor.hash);
      setLeaveOpen(true);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  if (loadError)
    return (
      <ErrorState message={loadError} retry={() => setAttempt((a) => a + 1)} />
    );
  if (!draft) return <Loading label="Loading event setup" />;
  if (phase !== "draft")
    return (
      <div className="page">
        <PageHeading
          title="This agenda is published"
          description="Structural changes and speaker fact editing are available only before publication."
        />
        <a className="button-link" href={`#/event/${eventId}/console`}>
          Return to stage console
          <ArrowRightIcon />
        </a>
      </div>
    );
  const busy = command.status === "pending" || command.status === "unknown";
  const hardEndClock = offsetToClock(
    draft.config.startsAt,
    draft.config.hardEndMin,
  );
  const patch = (changes: Partial<DraftBody>) => {
    setDraft({ ...draft, ...changes });
    setDirty(true);
  };
  const cuePatch = (index: number, changes: Partial<DraftCueInputBody>) =>
    patch({
      cues: draft.cues.map((c, i) => (i === index ? { ...c, ...changes } : c)),
    });
  const speakerPatch = (index: number, changes: Partial<Speaker>) =>
    patch({
      speakers: draft.speakers.map((s, i) =>
        i === index ? { ...s, ...changes } : s,
      ),
    });
  const move = (index: number, direction: number) => {
    const cues = [...draft.cues];
    const target = index + direction;
    const cue = cues[index];
    if (!cue || target < 0 || target >= cues.length) return;
    cues.splice(index, 1);
    cues.splice(target, 0, cue);
    patch({ cues: cues.map((c, i) => ({ ...c, order: i })) });
  };
  const downloadAgendaTemplate = (): void => {
    const url = URL.createObjectURL(
      new Blob([agendaCsvTemplate()], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "cuepilot-agenda-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const readAgendaCsv = async (file: File): Promise<void> => {
    setCsvFileName(file.name);
    try {
      setCsvResult(
        importAgendaCsv(await file.text(), draft.speakers, draft.cues.length),
      );
    } catch {
      setCsvResult({
        ok: false,
        errors: ["That file could not be read as text."],
      });
    }
  };
  const applyAgendaImport = (): void => {
    if (csvResult === null || !csvResult.ok) return;
    patch({
      cues: [...draft.cues, ...csvResult.cues],
      speakers: [...draft.speakers, ...csvResult.newSpeakers],
    });
    setCsvResult(null);
    setCsvFileName("");
    setCsvOpen(false);
    setTab("agenda");
  };
  const finish = (result: RevisionMutation | null) => {
    if (result) {
      setDirty(false);
      navigate(`#/event/${eventId}/console`);
    }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors: string[] = [];
    const config = draftConfigSchema.safeParse(draft.config);
    if (!config.success)
      errors.push(
        ...config.error.issues.map(
          (issue) => `Event ${issue.path.join(".")}: ${issue.message}`,
        ),
      );
    draft.cues.forEach((cue, i) => {
      const result = draftCueInputSchema.safeParse(cue);
      if (!result.success)
        errors.push(
          ...result.error.issues.map(
            (issue) => `Cue ${i + 1}: ${issue.path.join(".")} ${issue.message}`,
          ),
        );
    });
    draft.speakers.forEach((speaker, i) => {
      const result = speakerSchema.safeParse(speaker);
      if (!result.success)
        errors.push(
          ...result.error.issues.map(
            (issue) =>
              `Speaker ${i + 1}: ${issue.path.join(".")} ${issue.message}`,
          ),
        );
    });
    draft.eventFacts.forEach((fact, i) => {
      const result = factSchema.safeParse(fact);
      if (!result.success)
        errors.push(
          ...result.error.issues.map(
            (issue) => `Event fact ${i + 1}: ${issue.message}`,
          ),
        );
    });
    if (draft.cues.length === 0)
      errors.push("Add at least one cue to your agenda.");
    setIssues(errors);
    if (errors.length) {
      requestAnimationFrame(() =>
        document.getElementById("validation-summary")?.focus(),
      );
      return;
    }
    const body = {
      ...draft,
      cues: draft.cues.map((c, i) => ({ ...c, order: i })),
    };
    finish(
      await command.run("save-draft", (key) => saveDraft(eventId, body, key)),
    );
  };
  const factsEditor = (
    facts: Fact[],
    change: (facts: Fact[]) => void,
    prefix: string,
  ) => (
    <div className="facts-editor">
      {facts.map((fact, index) => (
        <div className="fact-input" key={fact.id}>
          <div className="field">
            <label htmlFor={`${prefix}-fact-${index}`}>
              Approved fact {index + 1}
            </label>
            <textarea
              id={`${prefix}-fact-${index}`}
              required
              maxLength={400}
              value={fact.text}
              onChange={(event) =>
                change(
                  facts.map((f, j) =>
                    j === index ? { ...f, text: event.target.value } : f,
                  ),
                )
              }
              rows={2}
            />
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${prefix} fact ${index + 1}`}
            onClick={() => change(facts.filter((_, j) => j !== index))}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={facts.length >= 10}
        onClick={() =>
          change([...facts, { id: crypto.randomUUID(), text: "" }])
        }
      >
        <PlusIcon />
        Add approved fact
      </button>
    </div>
  );
  return (
    <>
      <RehearsalBanner mode={mode} />
      <div className="page">
        <PageHeading
          title="Event setup"
          description="Build your agenda and define the commitments your schedule must protect."
          actions={<span className="chip chip-warn">Not published yet</span>}
        />
        <form noValidate onSubmit={(event) => void save(event)}>
          <fieldset disabled={busy}>
            <div
              className="setup-tabs"
              role="group"
              aria-label="Setup sections"
            >
              {[
                ["details", "Event details"],
                ["agenda", `Agenda · ${draft.cues.length}`],
                ["speakers", `Speakers & facts · ${draft.speakers.length}`],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={tab === value ? "selected" : ""}
                  aria-pressed={tab === value}
                  onClick={() => setTab(value ?? "details")}
                >
                  {label}
                </button>
              ))}
            </div>
            <div hidden={tab !== "details"}>
              <section className="card">
                <div className="section-title">
                  <h2>Event details</h2>
                  <span className="small muted">All times in IST</span>
                </div>
                <div className="field">
                  <label htmlFor="name">Event name</label>
                  <input
                    id="name"
                    required
                    maxLength={120}
                    value={draft.config.name}
                    onChange={(event) =>
                      patch({
                        config: { ...draft.config, name: event.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="startsAt">Start date & time</label>
                    <input
                      id="startsAt"
                      type="datetime-local"
                      required
                      value={
                        Number.isFinite(Date.parse(draft.config.startsAt))
                          ? toLocal(draft.config.startsAt)
                          : ""
                      }
                      onChange={(event) =>
                        patch({
                          config: {
                            ...draft.config,
                            startsAt: event.target.value
                              ? toIso(event.target.value)
                              : "",
                          },
                        })
                      }
                    />
                  </div>
                  {/*
                    Organizers think in clock times ("we must be out by 11"), not in
                    offsets from their own start time. The wire format is still minutes
                    after start; the conversion happens here so nobody has to do
                    subtraction while setting up an event.
                  */}
                  <div className="field">
                    <label htmlFor="hardEnd">Must finish by</label>
                    <input
                      id="hardEnd"
                      type="time"
                      required
                      value={hardEndClock}
                      onChange={(event) => {
                        const minutes = clockToOffset(
                          draft.config.startsAt,
                          event.target.value,
                        );
                        if (minutes !== null)
                          patch({
                            config: { ...draft.config, hardEndMin: minutes },
                          });
                      }}
                    />
                    <span className="small muted">
                      {draft.config.hardEndMin} minutes after the start
                    </span>
                  </div>
                </div>
                <p className="small muted">
                  This is a promise you are keeping, not a rough guess —
                  CuePilot will never publish a plan that runs past it.
                </p>
                {/*
                  §12 allows only name, start and finish in `config`, so mode genuinely
                  cannot change here. Saying so plainly, and saying what it means, beats
                  a control that could not work or a bare "Mode: rehearsal."
                */}
                <div className="mode-row">
                  <span className="chip chip-info">
                    {mode === "rehearsal" ? "Rehearsal" : "Live"}
                  </span>
                  <p className="small muted">
                    {mode === "rehearsal"
                      ? "You move the clock yourself, so you can practise the whole show in a few minutes. Anything recorded now is labelled as a rehearsal time."
                      : "The event follows the real clock, and anything recorded now is a real time."}{" "}
                    This was chosen when the event was created and cannot change
                    — create another event to use the other mode.
                  </p>
                </div>
              </section>
              <section className="card">
                <h2>Approved event facts</h2>
                <p className="muted small">
                  Keep names and context accurate. CuePilot only ever quotes
                  what you put here.
                </p>
                {factsEditor(
                  draft.eventFacts,
                  (eventFacts) => patch({ eventFacts }),
                  "event",
                )}
              </section>
              {mode === "rehearsal" && (
                <section className="fixture-callout">
                  <div>
                    <h2>Try the fictional TechFest scenario</h2>
                    <p>
                      Six sessions, three fictional speakers, a fixed sponsor
                      start, and a 60-minute finish.
                    </p>
                  </div>
                  <button type="button" onClick={() => setFixtureOpen(true)}>
                    Load the demo event
                    <ArrowRightIcon />
                  </button>
                </section>
              )}
            </div>
            <div hidden={tab !== "agenda"}>
              <section className="section-toolbar">
                <div>
                  <h2>Shape the running order</h2>
                  <p className="small muted">
                    Give each item a length in whole minutes. CuePilot works out
                    the clock times for you when you save.
                  </p>
                </div>
                <div className="row">
                  <button
                    type="button"
                    disabled={draft.cues.length >= 20}
                    onClick={() => {
                      setCsvResult(null);
                      setCsvFileName("");
                      setCsvOpen(true);
                    }}
                  >
                    Import CSV
                  </button>
                  <button
                    type="button"
                    disabled={draft.cues.length >= 20}
                    onClick={() =>
                      patch({
                        cues: [
                          ...draft.cues,
                          {
                            id: crypto.randomUUID(),
                            order: draft.cues.length,
                            title: "",
                            speakerId: null,
                            preferredDurationMin: 10,
                            minDurationMin: 5,
                            compressionPenalty: 1,
                            bufferBeforeMin: 0,
                            notBeforeMin: null,
                            fixedStartMin: null,
                          },
                        ],
                      })
                    }
                  >
                    <PlusIcon />
                    Add session
                  </button>
                </div>
              </section>
              {!draft.cues.length && (
                <EmptyState
                  title="Build your running order"
                  description="Add your opening, sessions, transitions, and closing. You can reorder them before publishing."
                />
              )}
              {draft.cues.map((cue, index) => (
                <section className="card cue-editor" key={cue.id}>
                  <div className="row spread">
                    <span className="cue-number">
                      ITEM {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="row">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Move cue ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUpIcon />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Move cue ${index + 1} down`}
                        disabled={index === draft.cues.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDownIcon />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove cue ${index + 1}`}
                        onClick={() =>
                          patch({
                            cues: draft.cues
                              .filter((_, i) => i !== index)
                              .map((c, i) => ({ ...c, order: i })),
                          })
                        }
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor={`title-${cue.id}`}>Session name</label>
                      <input
                        id={`title-${cue.id}`}
                        required
                        maxLength={120}
                        value={cue.title}
                        onChange={(event) =>
                          cuePatch(index, { title: event.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`speaker-${cue.id}`}>Speaker</label>
                      <select
                        id={`speaker-${cue.id}`}
                        value={cue.speakerId ?? ""}
                        onChange={(event) =>
                          cuePatch(index, {
                            speakerId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">No assigned speaker</option>
                        {draft.speakers.map((speaker) => (
                          <option key={speaker.id} value={speaker.id}>
                            {speaker.displayName || "Unnamed speaker"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="constraint-grid">
                    {basicFields.map(([field, label, min, max]) => (
                      <div className="field" key={field}>
                        <label htmlFor={`${cue.id}-${field}`}>{label}</label>
                        <input
                          id={`${cue.id}-${field}`}
                          type="number"
                          min={min}
                          max={max}
                          step={1}
                          required
                          value={cue[field] ?? ""}
                          onChange={(event) =>
                            cuePatch(index, {
                              [field]: Number(event.target.value),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p className="small muted">
                    The shortest acceptable length cannot be longer than the
                    planned length.
                  </p>
                  <details className="cue-advanced">
                    <summary>Advanced timing rules</summary>
                    <p className="small muted">
                      These defaults suit most sessions. Change them only if
                      this one has a real constraint — a sponsor slot at a fixed
                      time, a speaker who arrives late, or a changeover gap.
                    </p>
                    <div className="field">
                      <label htmlFor={`${cue.id}-compressionPenalty`}>
                        If we run late
                      </label>
                      <select
                        id={`${cue.id}-compressionPenalty`}
                        value={String(cue.compressionPenalty)}
                        onChange={(event) =>
                          cuePatch(index, {
                            compressionPenalty: Number(event.target.value),
                          })
                        }
                      >
                        {PROTECTION_CHOICES.map(([value, label]) => (
                          <option key={value} value={String(value)}>
                            {label}
                          </option>
                        ))}
                        {PROTECTION_CHOICES.some(
                          ([value]) => value === cue.compressionPenalty,
                        ) ? null : (
                          <option value={String(cue.compressionPenalty)}>
                            Custom ({cue.compressionPenalty})
                          </option>
                        )}
                      </select>
                      <span className="small muted">
                        CuePilot shortens the least protected sessions first.
                      </span>
                    </div>
                    <div className="constraint-grid">
                      {advancedFields.map(([field, label, min, max]) => (
                        <div className="field" key={field}>
                          <label htmlFor={`${cue.id}-${field}`}>{label}</label>
                          <input
                            id={`${cue.id}-${field}`}
                            type="number"
                            min={min}
                            max={max}
                            step={1}
                            required
                            value={cue[field]}
                            onChange={(event) =>
                              cuePatch(index, {
                                [field]: Number(event.target.value),
                              })
                            }
                          />
                        </div>
                      ))}
                      {clockFields.map(([field, label, hint]) => {
                        const minutes = cue[field];
                        return (
                          <div className="field" key={field}>
                            <label htmlFor={`${cue.id}-${field}`}>
                              {label}
                            </label>
                            <div className="clock-field">
                              <input
                                id={`${cue.id}-${field}`}
                                type="time"
                                value={
                                  minutes === null || minutes === undefined
                                    ? ""
                                    : offsetToClock(
                                        draft.config.startsAt,
                                        minutes,
                                      )
                                }
                                onChange={(event) => {
                                  const next = clockToOffset(
                                    draft.config.startsAt,
                                    event.target.value,
                                  );
                                  cuePatch(
                                    index,
                                    field === "notBeforeMin"
                                      ? { notBeforeMin: next }
                                      : { fixedStartMin: next },
                                  );
                                }}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  cuePatch(
                                    index,
                                    field === "notBeforeMin"
                                      ? { notBeforeMin: null }
                                      : { fixedStartMin: null },
                                  )
                                }
                                disabled={
                                  minutes === null || minutes === undefined
                                }
                              >
                                Clear
                              </button>
                            </div>
                            <span
                              className={
                                minutes !== null &&
                                minutes !== undefined &&
                                minutes > draft.config.hardEndMin
                                  ? "small warn-text"
                                  : "small muted"
                              }
                            >
                              {minutes === null || minutes === undefined
                                ? `Not set. ${hint}`
                                : minutes > draft.config.hardEndMin
                                  ? `${minutes} minutes after the start — that is after the event must finish. Saving will be refused.`
                                  : `${minutes} minutes after the event starts.`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </section>
              ))}
            </div>
            <div hidden={tab !== "speakers"}>
              <div className="section-toolbar">
                <div>
                  <h2>People behind the programme</h2>
                  <p className="small muted">
                    Add pronunciation and approved facts for the host. Up to 20
                    speakers and ten facts per speaker.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={draft.speakers.length >= 20}
                  onClick={() =>
                    patch({
                      speakers: [
                        ...draft.speakers,
                        {
                          id: crypto.randomUUID(),
                          displayName: "",
                          pronunciationHint: "",
                          facts: [],
                        },
                      ],
                    })
                  }
                >
                  <PlusIcon />
                  Add speaker
                </button>
              </div>
              {!draft.speakers.length && (
                <EmptyState
                  title="Put a name to each cue"
                  description="Add speakers, then assign them to cues in your agenda."
                />
              )}
              {draft.speakers.map((speaker, index) => (
                <section className="card" key={speaker.id}>
                  <div className="section-title">
                    <h2>Speaker {index + 1}</h2>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove speaker ${index + 1}`}
                      onClick={() =>
                        patch({
                          speakers: draft.speakers.filter(
                            (_, i) => i !== index,
                          ),
                          cues: draft.cues.map((c) =>
                            c.speakerId === speaker.id
                              ? { ...c, speakerId: null }
                              : c,
                          ),
                        })
                      }
                    >
                      <TrashIcon />
                    </button>
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor={`name-${speaker.id}`}>Full name</label>
                      <input
                        id={`name-${speaker.id}`}
                        required
                        maxLength={120}
                        value={speaker.displayName}
                        onChange={(event) =>
                          speakerPatch(index, {
                            displayName: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`pronunciation-${speaker.id}`}>
                        Pronunciation hint (optional)
                      </label>
                      <input
                        id={`pronunciation-${speaker.id}`}
                        maxLength={120}
                        value={speaker.pronunciationHint}
                        onChange={(event) =>
                          speakerPatch(index, {
                            pronunciationHint: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  {factsEditor(
                    speaker.facts,
                    (facts) => speakerPatch(index, { facts }),
                    speaker.id,
                  )}
                </section>
              ))}
            </div>
            <div className="save-bar">
              <span className="small muted">
                {dirty ? "Unsaved changes" : "Saved"} · saving does not publish
              </span>
              <div className="row">
                <button
                  type="button"
                  onClick={() =>
                    setTab(
                      tab === "details"
                        ? "agenda"
                        : tab === "agenda"
                          ? "speakers"
                          : "details",
                    )
                  }
                >
                  Next section
                  <ArrowRightIcon />
                </button>
                <Button size="3" type="submit">
                  {command.status === "pending" ? "Saving…" : "Save & review"}
                  <ArrowRightIcon />
                </Button>
              </div>
            </div>
          </fieldset>
          {issues.length > 0 && (
            <div
              id="validation-summary"
              tabIndex={-1}
              className="notice notice-bad"
              role="alert"
            >
              <strong>Check your draft before saving</strong>
              <ul>
                {issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          <CommandNotice
            {...command}
            retry={() => void command.retry<RevisionMutation>().then(finish)}
          />
          {command.code === "REVISION_CONFLICT" && (
            <button
              type="button"
              onClick={() => {
                setAttempt((a) => a + 1);
                setDirty(false);
                command.reset();
              }}
            >
              Reload latest draft (discard edits)
            </button>
          )}
        </form>
      </div>
      <Modal
        open={fixtureOpen}
        onClose={() => setFixtureOpen(false)}
        title="Load the fictional scenario?"
        description="This replaces your unsaved agenda and speaker facts with the labelled TechFest rehearsal."
      >
        <p>
          Opening → keynote → Q&A → community → sponsor → closing. The sponsor
          is fixed at minute 45; hard finish is minute 60.
        </p>
        <div className="row end">
          <button onClick={() => setFixtureOpen(false)}>Cancel</button>
          <Button
            onClick={() => {
              patch({
                config: {
                  ...draft.config,
                  name: "TechFest 2026 — Inaugural Session",
                  hardEndMin: 60,
                },
                cues: FIXTURE_CUES.map((c) => ({ ...c })),
                speakers: FIXTURE_SPEAKERS.map((s) => ({
                  id: s.id,
                  displayName: s.displayName,
                  pronunciationHint: s.pronunciationHint,
                  facts: [{ id: `fact-${s.id}`, text: s.factText }],
                })),
                eventFacts: [
                  {
                    // `event:` and `speaker:` are reserved for server-created records, so an
                    // organizer fact cannot impersonate one (§12). The server synthesises the
                    // event-name record itself at generation time.
                    id: "fact-scenario-1",
                    text: "Fictional TechFest college rehearsal",
                  },
                ],
              });
              setFixtureOpen(false);
              setTab("agenda");
            }}
          >
            Load the demo event
          </Button>
        </div>
      </Modal>
      <Modal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        title="Import an agenda from CSV"
        description="Use the provided template, replace its example rows, then import. Imported cues are added to the current agenda and are not saved or published until you save the draft."
      >
        <div className="row">
          <button type="button" onClick={downloadAgendaTemplate}>
            Download template
          </button>
          <span className="small muted">
            Columns: title, speaker, preferred_duration_min, min_duration_min,
            compression_penalty, buffer_before_min, available_from_min,
            fixed_start_min.
          </span>
        </div>
        <div className="field">
          <label htmlFor="agenda-csv">CSV file</label>
          <input
            id="agenda-csv"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void readAgendaCsv(file);
            }}
          />
        </div>
        {csvFileName && <p className="small muted">Selected: {csvFileName}</p>}
        {csvResult !== null && !csvResult.ok && (
          <div className="notice notice-bad" role="alert">
            <strong>Fix these rows before importing</strong>
            <ul>
              {csvResult.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        {csvResult !== null && csvResult.ok && (
          <>
            <div
              className="table-scroll"
              role="region"
              aria-label="Import preview"
              tabIndex={0}
            >
              <table>
                <caption className="sr-only">
                  Cues that will be added to the agenda
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Cue</th>
                    <th scope="col">Speaker</th>
                    <th scope="col" className="num">
                      Pref / min
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {csvResult.cues.map((cue) => (
                    <tr key={cue.id}>
                      <th scope="row">{cue.title}</th>
                      <td>
                        {[...draft.speakers, ...csvResult.newSpeakers].find(
                          (speaker) => speaker.id === cue.speakerId,
                        )?.displayName ?? "No speaker"}
                      </td>
                      <td className="num">
                        {cue.preferredDurationMin}/{cue.minDurationMin}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {csvResult.warnings.map((warning) => (
              <p
                className="notice notice-warn small"
                role="status"
                key={warning}
              >
                {warning}
              </p>
            ))}
          </>
        )}
        <div className="row end">
          <button type="button" onClick={() => setCsvOpen(false)}>
            Cancel
          </button>
          <Button
            type="button"
            disabled={csvResult === null || !csvResult.ok}
            onClick={applyAgendaImport}
          >
            {csvResult !== null && csvResult.ok
              ? `Add ${csvResult.cues.length} item${csvResult.cues.length === 1 ? "" : "s"}`
              : "Add items"}
          </Button>
        </div>
      </Modal>
      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Leave your unsaved draft?"
        description="Your edits have not been saved to the event."
      >
        <div className="row end">
          <button onClick={() => setLeaveOpen(false)}>Keep editing</button>
          <button
            className="danger"
            onClick={() => {
              setDirty(false);
              setLeaveOpen(false);
              navigate(leaveTarget);
            }}
          >
            Discard & leave
          </button>
        </div>
      </Modal>
    </>
  );
}
