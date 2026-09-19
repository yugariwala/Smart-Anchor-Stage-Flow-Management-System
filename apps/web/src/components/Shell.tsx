import { useEffect, useState, type ReactNode } from "react";
import {
  DashboardIcon,
  CalendarIcon,
  PersonIcon,
  ReaderIcon,
  SpeakerLoudIcon,
  CounterClockwiseClockIcon,
  GearIcon,
  QuestionMarkCircledIcon,
  ExitIcon,
  HamburgerMenuIcon,
  ArrowTopRightIcon,
} from "@radix-ui/react-icons";
import type { Route } from "../lib/route";
import { Modal } from "./UI";

const eventNav = [
  ["console", "Stage console", DashboardIcon],
  ["setup", "Event setup", CalendarIcon],
  ["speakers", "Speakers & facts", PersonIcon],
  ["scripts", "Host scripts", ReaderIcon],
  ["announcements", "Announcements", SpeakerLoudIcon],
  ["history", "Revision history", CounterClockwiseClockIcon],
  ["settings", "Event settings", GearIcon],
] as const;
export function Shell({
  route,
  uid,
  onSignOut,
  children,
}: {
  route: Route;
  uid: string;
  onSignOut: () => Promise<void>;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const [logout, setLogout] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const eventId =
    "eventId" in route && route.kind !== "join" && route.kind !== "anchor"
      ? route.eventId
      : null;
  useEffect(() => {
    document.title = `CuePilot · ${eventNav.find((item) => item[0] === route.kind)?.[1] ?? (route.kind === "landing" ? "Your events" : route.kind === "anchor" ? "Anchor runbook" : "Workspace")}`;
    document.getElementById("main-content")?.focus();
  }, [route.kind, eventId]);
  const links = (
    <>
      <a
        href="#/"
        className={`nav-link ${route.kind === "landing" ? "selected" : ""}`}
        aria-current={route.kind === "landing" ? "page" : undefined}
      >
        <CalendarIcon />
        Your events
      </a>
      {eventId && (
        <>
          <p className="nav-label">Event workspace</p>
          {eventNav.map(([key, label, Icon]) => (
            <a
              key={key}
              href={`#/event/${eventId}/${key}`}
              className={`nav-link ${route.kind === key ? "selected" : ""}`}
              aria-current={route.kind === key ? "page" : undefined}
            >
              <Icon />
              {label}
            </a>
          ))}
          <a className="nav-link" href={`#/anchor/${eventId}`}>
            <ArrowTopRightIcon />
            Anchor view
          </a>
        </>
      )}
      <div className="nav-bottom">
        <a href="#/help" className="nav-link">
          <QuestionMarkCircledIcon />
          Help & guide
        </a>
        <button
          className="nav-link"
          onClick={() => {
            setMenu(false);
            setLogout(true);
          }}
        >
          <ExitIcon />
          Sign out
        </button>
        <div className="session-label">
          <span className="avatar">YO</span>
          <div>
            <strong>Your workspace</strong>
            <span>Anonymous session · {uid.slice(0, 6)}</span>
          </div>
        </div>
      </div>
    </>
  );
  return (
    <div
      className={`app-shell ${route.kind === "anchor" ? "stage-shell" : ""}`}
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#/">
          <span className="brand-mark">
            c<span>•</span>
          </span>
          CuePilot<span className="brand-beta">BETA</span>
        </a>
        <div className="workspace-select">
          <span className="workspace-avatar">S</span>
          <div>
            <strong>Stage workspace</strong>
            <small>One stage. One shared plan.</small>
          </div>
        </div>
        <nav aria-label="Main navigation">{links}</nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          Human-led. Stage-ready.
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenu(true)}
            aria-label="Open navigation"
          >
            <HamburgerMenuIcon />
          </button>
          <div className="breadcrumb">
            <span>CuePilot</span>
            <span>/</span>
            <strong>
              {eventNav.find((item) => item[0] === route.kind)?.[1] ??
                (route.kind === "landing"
                  ? "Your events"
                  : route.kind === "anchor"
                    ? "Anchor runbook"
                    : "Workspace")}
            </strong>
          </div>
          <div className="row topbar-right">
            <span className="small muted">Single-stage event control</span>
            <a href="#/help" className="icon-button" aria-label="Help">
              <QuestionMarkCircledIcon />
            </a>
            <span className="avatar">YO</span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <Modal
        open={menu}
        onClose={() => setMenu(false)}
        title="Your workspace"
        description="Navigate your event."
      >
        <nav
          className="mobile-nav"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setMenu(false);
          }}
          aria-label="Mobile navigation"
        >
          {links}
        </nav>
      </Modal>
      <Modal
        open={logout}
        onClose={() => setLogout(false)}
        title="Sign out of CuePilot?"
        description="This is an anonymous session. Signing out loses access to events owned by this identity. There is no account recovery in this build."
        busy={leaving}
      >
        <p className="muted">
          Local event shortcuts and offline snapshots will be cleared. Server
          data remains until you delete the event or its 72-hour expiry.
        </p>
        {error && (
          <p role="alert" className="notice notice-bad">
            {error}
          </p>
        )}
        <div className="row end">
          <button disabled={leaving} onClick={() => setLogout(false)}>
            Keep working
          </button>
          <button
            className="danger"
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              void onSignOut().catch(() => {
                setError("Could not sign out. Try again.");
                setLeaving(false);
              });
            }}
          >
            {leaving ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
