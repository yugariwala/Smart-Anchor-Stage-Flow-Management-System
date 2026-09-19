import { useEffect, useRef, useState } from "react";
import {
  PlusIcon,
  ArrowRightIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  ArrowTopRightIcon,
  Link2Icon,
  MagicWandIcon,
} from "@radix-ui/react-icons";
import { Button } from "@radix-ui/themes";
import type { EventState } from "@cuepilot/domain";
import {
  createEvent,
  getEvent,
  getPublished,
  errorCopy,
  ApiCallError,
  type CreateBody,
} from "../lib/api";
import { navigate, parseRoute } from "../lib/route";
import {
  recentEvents,
  rememberEvent,
  forgetEvent,
  type RecentEvent,
} from "../lib/storage";
import { FIXTURE_EVENT_NAME } from "../lib/fixture";
import { useCommand } from "../lib/useCommand";
import { eventTimingLabel } from "../lib/displayTime";
import {
  CommandNotice,
  EmptyState,
  Modal,
  PageHeading,
} from "../components/UI";

const startDefault = () =>
  new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10) + "T10:00";
export function Landing({ uid }: { uid: string }) {
  const command = useCommand();
  const [events, setEvents] = useState<RecentEvent[]>(recentEvents);
  const [states, setStates] = useState<Record<string, EventState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(true);
  const [published, setPublished] = useState<Record<string, number | null>>({});
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoAttempted, setDemoAttempted] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [start, setStart] = useState(startDefault);
  const [duration, setDuration] = useState("60");
  const [mode, setMode] = useState<"rehearsal" | "live">("rehearsal");
  const [joinUrl, setJoinUrl] = useState("");
  const [openId, setOpenId] = useState("");
  const [formError, setFormError] = useState("");
  const [opening, setOpening] = useState(false);
  const createdId = useRef("");
  const busy = command.status === "pending" || command.status === "unknown";
  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled(
      events.map(async (event) => {
        try {
          const result =
            event.role === "owner"
              ? await getEvent(event.id)
              : await getPublished(event.id, null);
          if (result && !cancelled) {
            setStates((current) => ({ ...current, [event.id]: result.state }));
            setPublished((current) => ({
              ...current,
              [event.id]: result.publishedRevision,
            }));
            setOffsets((current) => ({
              ...current,
              [event.id]: Date.parse(result.serverNow) - Date.now(),
            }));
          }
        } catch (cause) {
          if (!cancelled)
            setErrors((current) => ({
              ...current,
              [event.id]:
                cause instanceof ApiCallError && cause.code === "NOT_PUBLISHED"
                  ? "Waiting for publication"
                  : errorCopy(cause),
            }));
        }
      }),
    ).then(() => {
      if (!cancelled) setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [events]);
  const finishCreation = (result: { state: EventState } | null) => {
    if (result) {
      rememberEvent(result.state, "owner");
      // A seeded event already has an agenda; its next labeled step is on the console.
      const seeded = result.state.demoSeed === "college-demo-v1";
      navigate(
        `#/event/${result.state.id}/${seeded ? "console" : "setup"}`,
      );
    }
  };
  const createDemo = async (): Promise<void> => {
    setFormError("");
    setDemoAttempted(true);
    createdId.current = crypto.randomUUID();
    const body: CreateBody = {
      name: FIXTURE_EVENT_NAME,
      startsAt: new Date(startDefault() + ":00+05:30")
        .toISOString()
        .replace(".000Z", "Z"),
      hardEndMin: 60,
      mode: "rehearsal",
      seed: "college-demo-v1",
    };
    const result = await command.run("create-demo", (key) =>
      createEvent(createdId.current, body, key),
    );
    if (result) setDemoOpen(false);
    finishCreation(result);
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (
      !name.trim() ||
      !start ||
      !Number.isInteger(Number(duration)) ||
      Number(duration) < 1 ||
      Number(duration) > 240
    ) {
      setFormError(
        "Enter an event name, a start time, and a duration from 1 to 240 minutes.",
      );
      return;
    }
    const startsAt = new Date(start + ":00+05:30");
    if (!Number.isFinite(startsAt.getTime())) {
      setFormError("Choose a valid event start time.");
      return;
    }
    createdId.current = crypto.randomUUID();
    const body: CreateBody = {
      name: name.trim(),
      startsAt: startsAt.toISOString().replace(".000Z", "Z"),
      hardEndMin: Number(duration),
      mode,
      seed: "blank",
    };
    finishCreation(
      await command.run("create", (key) =>
        createEvent(createdId.current, body, key),
      ),
    );
  };
  const join = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    const hash = joinUrl.includes("#")
      ? joinUrl.slice(joinUrl.indexOf("#"))
      : joinUrl;
    if (parseRoute(hash).kind !== "join" || !hash.includes("code=")) {
      setFormError("Paste the complete invitation link, including its code.");
      return;
    }
    navigate(hash);
  };
  const open = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    const id = openId.trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      setFormError("Enter a valid event ID.");
      return;
    }
    setOpening(true);
    try {
      try {
        const result = await getEvent(id);
        if (result) {
          navigate(`#/event/${id}/console`);
          return;
        }
      } catch (cause) {
        if (
          !(cause instanceof ApiCallError) ||
          !["NOT_FOUND", "FORBIDDEN_ROLE"].includes(cause.code)
        )
          throw cause;
      }
      try {
        const result = await getPublished(id, null);
        if (result)
          rememberEvent(
            result.state,
            result.state.ownerUid === uid ? "owner" : "anchor",
          );
      } catch (cause) {
        if (!(cause instanceof ApiCallError) || cause.code !== "NOT_PUBLISHED")
          throw cause;
      }
      navigate(`#/anchor/${id}`);
    } catch (cause) {
      setFormError(errorCopy(cause));
    } finally {
      setOpening(false);
    }
  };
  const filtered = events.filter(
    (e) =>
      e.name.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "anchor"
          ? e.role === "anchor"
          : states[e.id]?.phase === filter)),
  );
  return (
    <div className="page workspace-page">
      <PageHeading
        title="Your events"
        description="A clear plan. A connected team. A stage under control."
        actions={
          <>
            <button
              onClick={() => {
                setJoinOpen(true);
                setFormError("");
              }}
            >
              <Link2Icon /> Join an event
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setDemoOpen(true);
                setFormError("");
              }}
            >
              <MagicWandIcon /> Try fictional rehearsal
            </button>
            <Button
              size="3"
              onClick={() => {
                setCreateOpen(true);
                setFormError("");
              }}
            >
              <PlusIcon /> Create event
            </Button>
          </>
        }
      />
      {events.length === 0 && (
        <section className="workspace-intro">
          <div>
            <span className="intro-label">
              <span className="status-dot" /> YOUR STAGE, IN SYNC
            </span>
            <h2>
              Keep the show
              <br />
              moving together.
            </h2>
            <p>
              Prepare your rundown, protect your timing,
              <br className="desktop-only" /> and keep your anchor on the same
              page.
            </p>
            <a href="#/help" className="text-link">
              Explore the workflow <ArrowRightIcon />
            </a>
          </div>
          <div
            className="workflow-visual"
            aria-label="Workflow: prepare, publish, perform"
          >
            <div className="visual-track">
              <span>01</span>
              <div>
                <strong>Prepare</strong>
                <small>Every cue in its place</small>
              </div>
              <CalendarIcon />
            </div>
            <div className="visual-connector" />
            <div className="visual-track visual-active">
              <span>02</span>
              <div>
                <strong>Publish</strong>
                <small>One approved runbook</small>
              </div>
              <span className="status-dot" />
            </div>
            <div className="visual-connector" />
            <div className="visual-track">
              <span>03</span>
              <div>
                <strong>Perform</strong>
                <small>Everyone on the same cue</small>
              </div>
              <ArrowTopRightIcon />
            </div>
          </div>
        </section>
      )}
      <div className="section-toolbar">
        <div className="segmented" role="group" aria-label="Filter events">
          {[
            ["all", "All events"],
            ["draft", "Drafts"],
            ["running", "Running"],
            ["anchor", "Joined"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? "selected" : ""}
              onClick={() => setFilter(value ?? "all")}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-field">
          <MagnifyingGlassIcon />
          <input
            aria-label="Search events"
            placeholder="Search your events…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="row spread small muted collection-heading">
        <span>
          {filtered.length} {filtered.length === 1 ? "event" : "events"} in this
          browser
        </span>
        <span>
          {checking
            ? "Checking latest status…"
            : Object.keys(errors).length
              ? "Some events could not be refreshed"
              : "Status checked when this page opened"}
        </span>
      </div>
      {filtered.length === 0 ? (
        <section className="card">
          <EmptyState
            title={
              events.length
                ? "No matching events"
                : "Your next event starts here"
            }
            description={
              events.length
                ? "Try a different search or filter to find your event."
                : "Create an event to build your agenda, or join your organizer’s invitation."
            }
            action={
              events.length > 0 ? (
                <button
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Button onClick={() => setCreateOpen(true)}>
                  <PlusIcon /> Create event
                </Button>
              )
            }
          />
        </section>
      ) : (
        <div className="event-grid">
          {filtered.map((event) => {
            const state = states[event.id];
            return (
              <article className="event-card" key={event.id}>
                <div className="row spread">
                  <span className="event-icon">
                    <CalendarIcon />
                  </span>
                  <span
                    className={`chip ${state?.phase === "running" ? "chip-ok" : "chip-info"}`}
                  >
                    {state?.phase ??
                      (checking
                        ? "Checking"
                        : event.role === "anchor"
                          ? "Anchor"
                          : "Unavailable")}
                  </span>
                </div>
                <h2>{state?.name ?? event.name}</h2>
                <p className="small muted">
                  {state
                    ? new Date(state.startsAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        dateStyle: "medium",
                        timeStyle: "short",
                      }) + " IST"
                    : "Saved event shortcut"}
                </p>
                {state && (
                  <div className="event-facts">
                    <span>{state.cues.length} cues</span>
                    <span>{state.hardEndMin} min</span>
                    <span>
                      {state.mode === "rehearsal" ? "Rehearsal" : "Live mode"}
                    </span>
                  </div>
                )}
                {errors[event.id] && (
                  <p className="small error" role="status">
                    {errors[event.id]}
                  </p>
                )}
                <div className="event-card-footer">
                  <span className="small muted">
                    {event.role === "owner" ? "Organizer" : "Anchor"} ·{" "}
                    {published[event.id] == null
                      ? "Unpublished"
                      : `Published R${published[event.id]}`}
                  </span>
                  <a
                    className="text-link"
                    href={
                      event.role === "owner"
                        ? `#/event/${event.id}/${state?.phase === "draft" && !state.cues.length ? "setup" : "console"}`
                        : `#/anchor/${event.id}`
                    }
                  >
                    Open event <ArrowRightIcon />
                  </a>
                </div>
                {state && (
                  <p className="event-countdown">
                    {eventTimingLabel(state, nowMs + (offsets[event.id] ?? 0))}
                  </p>
                )}
                {errors[event.id] && (
                  <button
                    className="text-button"
                    onClick={() => {
                      forgetEvent(event.id);
                      setEvents(recentEvents());
                    }}
                  >
                    Remove shortcut
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      <section className="workspace-footer">
        <div>
          <strong>Already have an event ID?</strong>
          <p className="small muted">
            Open an event this identity owns or has joined.
          </p>
        </div>
        <form onSubmit={(event) => void open(event)} className="row">
          <input
            aria-label="Event ID"
            placeholder="Paste event ID"
            value={openId}
            onChange={(e) => setOpenId(e.target.value)}
            required
          />
          <button disabled={opening}>
            {opening ? "Opening…" : "Open event"}
            <ArrowRightIcon />
          </button>
        </form>
      </section>
      {!createOpen && !joinOpen && formError && (
        <p className="notice notice-bad" role="alert">
          {formError}
        </p>
      )}
      <p className="footnote">
        Browser-local workspace · Anonymous identity · Events expire after 72
        hours
      </p>
      <Modal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        title="Try the fictional rehearsal?"
        description="Creates a personal, labeled rehearsal event seeded with the committed six-cue scenario."
        busy={busy}
      >
        <p className="small muted">
          Opening → keynote → Q&amp;A → community interaction → sponsor fixed at
          10:45 → closing at 11:00. Every speaker, fact and event detail is
          fictional, and the scenario clock is controlled by you.
        </p>
        <p className="notice small">
          REHEARSAL · fictional event and speakers · scenario clock.
        </p>
        {formError && (
          <p className="error" role="alert">
            {formError}
          </p>
        )}
        <div className="row end">
          <button disabled={busy} onClick={() => setDemoOpen(false)}>
            Cancel
          </button>
          <Button disabled={busy} onClick={() => void createDemo()}>
            {command.status === "pending" ? "Creating…" : "Create rehearsal"}
          </Button>
        </div>
        {demoAttempted && (
          <CommandNotice
            {...command}
            retry={() =>
              void command.retry<{ state: EventState }>().then((result) => {
                if (result) setDemoOpen(false);
                finishCreation(result);
              })
            }
          />
        )}
      </Modal>
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create your event"
        description="Start with a blank agenda. You can load the fictional scenario in rehearsal setup."
        busy={busy}
      >
        <form onSubmit={(event) => void create(event)}>
          <fieldset disabled={busy}>
            <div className="field">
              <label htmlFor="event-name">Event name</label>
              <input
                id="event-name"
                autoFocus
                required
                maxLength={120}
                placeholder="e.g. Campus innovation summit"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="event-start">Start date & time (IST)</label>
                <input
                  id="event-start"
                  type="datetime-local"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="duration">
                  Hard finish, minutes after start
                </label>
                <input
                  id="duration"
                  type="number"
                  min="1"
                  max="240"
                  required
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="mode">Event mode</label>
              <select
                id="mode"
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as "rehearsal" | "live")
                }
              >
                <option value="rehearsal">
                  Rehearsal · manual scenario clock
                </option>
                <option value="live">Live · actual server clock</option>
              </select>
            </div>
            <p className="notice small">
              Mode cannot change after creation. Demo data expires after 72
              hours. Maximum two creations per identity per day; shared capacity
              also applies.
            </p>
            <p className="small muted">
              Keep this browser session. Signing out or clearing browser storage
              loses access to your events.
            </p>
            {formError && (
              <p className="error" role="alert">
                {formError}
              </p>
            )}
            <div className="row end">
              <button type="button" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <Button type="submit" size="3">
                {command.status === "pending" ? "Creating…" : "Create event"}
                <ArrowRightIcon />
              </Button>
            </div>
          </fieldset>
          <CommandNotice
            {...command}
            retry={() =>
              void command.retry<{ state: EventState }>().then(finishCreation)
            }
          />
        </form>
      </Modal>
      <Modal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title="Join as an anchor"
        description="Use the private invitation link your organizer shared with you."
      >
        <form onSubmit={join}>
          <div className="field">
            <label htmlFor="invite-url">Invitation link</label>
            <input
              id="invite-url"
              required
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
              placeholder="https://…/#/join/…?code=…"
            />
          </div>
          {formError && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}
          <p className="small muted">
            Invitations are single-use and expire after one hour.
          </p>
          <Button type="submit">
            Open invitation
            <ArrowRightIcon />
          </Button>
        </form>
      </Modal>
    </div>
  );
}
