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
import { useI18n } from "../lib/i18n";

const toLocal = (iso: string) =>
  new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 16);
const toIso = (local: string) =>
  new Date(local + ":00+05:30").toISOString().replace(".000Z", "Z");
const numericFields = [
  ["preferredDurationMin", "Preferred duration", 1, 60],
  ["minDurationMin", "Minimum duration", 1, 60],
  ["compressionPenalty", "Shortening priority", 1, 100],
  ["bufferBeforeMin", "Buffer before cue", 0, 30],
  ["notBeforeMin", "Available from minute", 0, 240],
  ["fixedStartMin", "Fixed start minute", 0, 240],
] as const;
export function SetupScreen({ eventId }: { eventId: string }) {
  const { t } = useI18n();
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
  if (!draft) return <Loading label={t("Loading event setup")} />;
  if (phase !== "draft")
    return (
      <div className="page">
        <PageHeading
          title={t("This agenda is published")}
          description={t(
            "Structural changes and speaker fact editing are available only before publication.",
          )}
        />
        <a className="button-link" href={`#/event/${eventId}/console`}>
          {t("Return to stage console")}
          <ArrowRightIcon />
        </a>
      </div>
    );
  const busy = command.status === "pending" || command.status === "unknown";
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
        errors: [t("That file could not be read as text.")],
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
      errors.push(t("Add at least one cue to your agenda."));
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
              {t("Approved fact {number}", { number: index + 1 })}
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
            aria-label={t("Remove {prefix} fact {number}", {
              prefix,
              number: index + 1,
            })}
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
        {t("Add approved fact")}
      </button>
    </div>
  );
  return (
    <>
      <RehearsalBanner mode={mode} />
      <div className="page">
        <PageHeading
          title={t("Event setup")}
          description={t(
            "Build your agenda and define the commitments your schedule must protect.",
          )}
          actions={
            <span className="chip chip-info">
              {t("Draft · revision {revision}", {
                revision: draft.expectedRevision,
              })}
            </span>
          }
        />
        <form noValidate onSubmit={(event) => void save(event)}>
          <fieldset disabled={busy}>
            <div
              className="setup-tabs"
              role="group"
              aria-label={t("Setup sections")}
            >
              {[
                ["details", t("Event details")],
                ["agenda", t("Agenda · {count}", { count: draft.cues.length })],
                [
                  "speakers",
                  t("Speakers & facts · {count}", {
                    count: draft.speakers.length,
                  }),
                ],
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
                  <h2>{t("Event details")}</h2>
                  <span className="small muted">{t("All times in IST")}</span>
                </div>
                <div className="field">
                  <label htmlFor="name">{t("Event name")}</label>
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
                    <label htmlFor="startsAt">{t("Start date & time")}</label>
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
                  <div className="field">
                    <label htmlFor="hardEnd">
                      {t("Hard finish (minutes after start)")}
                    </label>
                    <input
                      id="hardEnd"
                      type="number"
                      required
                      min={1}
                      max={240}
                      value={draft.config.hardEndMin}
                      onChange={(event) =>
                        patch({
                          config: {
                            ...draft.config,
                            hardEndMin: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <p className="small muted">
                  {t(
                    "The hard finish is a protected commitment, not a suggested duration. Mode: {mode}.",
                    { mode: t(mode) },
                  )}
                </p>
              </section>
              <section className="card">
                <h2>{t("Approved event facts")}</h2>
                <p className="muted small">
                  {t(
                    "Keep names and context accurate. These facts are retained with their original IDs.",
                  )}
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
                    <h2>{t("Try the fictional TechFest scenario")}</h2>
                    <p>
                      {t(
                        "Six cues, three fictional speakers, a fixed sponsor start, and a 60-minute finish.",
                      )}
                    </p>
                  </div>
                  <button type="button" onClick={() => setFixtureOpen(true)}>
                    {t("Load scenario")}
                    <ArrowRightIcon />
                  </button>
                </section>
              )}
            </div>
            <div hidden={tab !== "agenda"}>
              <section className="section-toolbar">
                <div>
                  <h2>{t("Shape the running order")}</h2>
                  <p className="small muted">
                    {t(
                      "Times are whole-minute offsets from the event start. The server calculates the schedule when you save.",
                    )}
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
                    {t("Import CSV")}
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
                    {t("Add cue")}
                  </button>
                </div>
              </section>
              {!draft.cues.length && (
                <EmptyState
                  title={t("Build your running order")}
                  description={t(
                    "Add your opening, sessions, transitions, and closing. You can reorder cues before publication.",
                  )}
                />
              )}
              {draft.cues.map((cue, index) => (
                <section className="card cue-editor" key={cue.id}>
                  <div className="row spread">
                    <span className="cue-number">
                      {t("CUE {number}", {
                        number: String(index + 1).padStart(2, "0"),
                      })}
                    </span>
                    <div className="row">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("Move cue {number} up", {
                          number: index + 1,
                        })}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUpIcon />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("Move cue {number} down", {
                          number: index + 1,
                        })}
                        disabled={index === draft.cues.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDownIcon />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={t("Remove cue {number}", {
                          number: index + 1,
                        })}
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
                      <label htmlFor={`title-${cue.id}`}>
                        {t("Cue title")}
                      </label>
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
                      <label htmlFor={`speaker-${cue.id}`}>
                        {t("Speaker")}
                      </label>
                      <select
                        id={`speaker-${cue.id}`}
                        value={cue.speakerId ?? ""}
                        onChange={(event) =>
                          cuePatch(index, {
                            speakerId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">{t("No assigned speaker")}</option>
                        {draft.speakers.map((speaker) => (
                          <option key={speaker.id} value={speaker.id}>
                            {speaker.displayName || t("Unnamed speaker")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="constraint-grid">
                    {numericFields.map(([field, label, min, max]) => (
                      <div className="field" key={field}>
                        <label htmlFor={`${cue.id}-${field}`}>{t(label)}</label>
                        <input
                          id={`${cue.id}-${field}`}
                          type="number"
                          min={min}
                          max={max}
                          step={1}
                          required={
                            field !== "fixedStartMin" &&
                            field !== "notBeforeMin"
                          }
                          placeholder={
                            field === "fixedStartMin" ||
                            field === "notBeforeMin"
                              ? t("Not set")
                              : undefined
                          }
                          value={cue[field] ?? ""}
                          onChange={(event) =>
                            cuePatch(index, {
                              [field]:
                                event.target.value === "" &&
                                (field === "fixedStartMin" ||
                                  field === "notBeforeMin")
                                  ? null
                                  : Number(event.target.value),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p className="small muted">
                    {t(
                      "Higher shortening priority protects this cue more strongly. Minimum duration must not exceed preferred duration.",
                    )}
                  </p>
                </section>
              ))}
            </div>
            <div hidden={tab !== "speakers"}>
              <div className="section-toolbar">
                <div>
                  <h2>{t("People behind the programme")}</h2>
                  <p className="small muted">
                    {t(
                      "Add pronunciation and approved facts for the host. Up to 20 speakers and ten facts per speaker.",
                    )}
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
                  {t("Add speaker")}
                </button>
              </div>
              {!draft.speakers.length && (
                <EmptyState
                  title={t("Put a name to each cue")}
                  description={t(
                    "Add speakers, then assign them to cues in your agenda.",
                  )}
                />
              )}
              {draft.speakers.map((speaker, index) => (
                <section className="card" key={speaker.id}>
                  <div className="section-title">
                    <h2>{t("Speaker {number}", { number: index + 1 })}</h2>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={t("Remove speaker {number}", {
                        number: index + 1,
                      })}
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
                      <label htmlFor={`name-${speaker.id}`}>
                        {t("Full name")}
                      </label>
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
                        {t("Pronunciation hint (optional)")}
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
                {dirty ? t("Unsaved changes") : t("Draft loaded")} ·{" "}
                {t("Saving does not publish")}
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
                  {t("Next section")}
                  <ArrowRightIcon />
                </button>
                <Button size="3" type="submit">
                  {command.status === "pending"
                    ? t("Saving…")
                    : t("Save & review")}
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
              <strong>{t("Check your draft before saving")}</strong>
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
              {t("Reload latest draft (discard edits)")}
            </button>
          )}
        </form>
      </div>
      <Modal
        open={fixtureOpen}
        onClose={() => setFixtureOpen(false)}
        title={t("Load the fictional scenario?")}
        description={t(
          "This replaces your unsaved agenda and speaker facts with the labelled TechFest rehearsal.",
        )}
      >
        <p>
          {t(
            "Opening → keynote → Q&A → community → sponsor → closing. The sponsor is fixed at minute 45; hard finish is minute 60.",
          )}
        </p>
        <div className="row end">
          <button onClick={() => setFixtureOpen(false)}>{t("Cancel")}</button>
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
            {t("Load scenario")}
          </Button>
        </div>
      </Modal>
      <Modal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        title={t("Import an agenda from CSV")}
        description={t(
          "Use the provided template, replace its example rows, then import. Imported cues are added to the current agenda and are not saved or published until you save the draft.",
        )}
      >
        <div className="row">
          <button type="button" onClick={downloadAgendaTemplate}>
            {t("Download template")}
          </button>
          <span className="small muted">
            Columns: title, speaker, preferred_duration_min, min_duration_min,
            compression_penalty, buffer_before_min, available_from_min,
            fixed_start_min.
          </span>
        </div>
        <div className="field">
          <label htmlFor="agenda-csv">{t("CSV file")}</label>
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
        {csvFileName && (
          <p className="small muted">
            {t("Selected: {file}", { file: csvFileName })}
          </p>
        )}
        {csvResult !== null && !csvResult.ok && (
          <div className="notice notice-bad" role="alert">
            <strong>{t("Fix these rows before importing")}</strong>
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
              aria-label={t("Import preview")}
              tabIndex={0}
            >
              <table>
                <caption className="sr-only">
                  {t("Cues that will be added to the agenda")}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t("Cue")}</th>
                    <th scope="col">{t("Speaker")}</th>
                    <th scope="col" className="num">
                      {t("Pref / min")}
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
                        )?.displayName ?? t("No speaker")}
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
            {t("Cancel")}
          </button>
          <Button
            type="button"
            disabled={csvResult === null || !csvResult.ok}
            onClick={applyAgendaImport}
          >
            {csvResult !== null && csvResult.ok
              ? t(
                  csvResult.cues.length === 1
                    ? "Add {count} cue"
                    : "Add {count} cues",
                  { count: csvResult.cues.length },
                )
              : t("Add cues")}
          </Button>
        </div>
      </Modal>
      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={t("Leave your unsaved draft?")}
        description={t("Your edits have not been saved to the event.")}
      >
        <div className="row end">
          <button onClick={() => setLeaveOpen(false)}>
            {t("Keep editing")}
          </button>
          <button
            className="danger"
            onClick={() => {
              setDirty(false);
              setLeaveOpen(false);
              navigate(leaveTarget);
            }}
          >
            {t("Discard & leave")}
          </button>
        </div>
      </Modal>
    </>
  );
}
