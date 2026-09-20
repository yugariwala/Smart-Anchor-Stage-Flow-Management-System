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
import { localeNames, locales, useI18n, type UiLocale } from "../lib/i18n";
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
  const { locale, setLocale, t } = useI18n();
  const eventId =
    "eventId" in route && route.kind !== "join" && route.kind !== "anchor"
      ? route.eventId
      : null;
  const navItem = eventNav.find((item) => item[0] === route.kind);
  const currentPage = navItem
    ? t(navItem[1])
    : route.kind === "landing"
      ? t("Your events")
      : route.kind === "anchor"
        ? t("Anchor runbook")
        : t("Workspace");
  useEffect(() => {
    document.title = `CuePilot · ${currentPage}`;
    document.getElementById("main-content")?.focus();
  }, [currentPage, eventId]);
  const links = (
    <>
      <a
        href="#/"
        className={`nav-link ${route.kind === "landing" ? "selected" : ""}`}
        aria-current={route.kind === "landing" ? "page" : undefined}
      >
        <CalendarIcon />
        {t("Your events")}
      </a>
      {eventId && (
        <>
          <p className="nav-label">{t("Event workspace")}</p>
          {eventNav.map(([key, label, Icon]) => (
            <a
              key={key}
              href={`#/event/${eventId}/${key}`}
              className={`nav-link ${route.kind === key ? "selected" : ""}`}
              aria-current={route.kind === key ? "page" : undefined}
            >
              <Icon />
              {t(label)}
            </a>
          ))}
          <a className="nav-link" href={`#/anchor/${eventId}`}>
            <ArrowTopRightIcon />
            {t("Anchor view")}
          </a>
        </>
      )}
      <div className="nav-bottom">
        <a href="#/help" className="nav-link">
          <QuestionMarkCircledIcon />
          {t("Help & guide")}
        </a>
        <button
          className="nav-link"
          onClick={() => {
            setMenu(false);
            setLogout(true);
          }}
        >
          <ExitIcon />
          {t("Sign out")}
        </button>
        <div className="session-label">
          <span className="avatar">YO</span>
          <div>
            <strong>{t("Your workspace")}</strong>
            <span>
              {t("Anonymous session")} · {uid.slice(0, 6)}
            </span>
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
        {t("Skip to content")}
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
            <strong>{t("Stage workspace")}</strong>
            <small>{t("One stage. One shared plan.")}</small>
          </div>
        </div>
        <nav aria-label={t("Main navigation")}>{links}</nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          {t("Human-led. Stage-ready.")}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenu(true)}
            aria-label={t("Open navigation")}
          >
            <HamburgerMenuIcon />
          </button>
          <div className="breadcrumb">
            <span>CuePilot</span>
            <span>/</span>
            <strong>{currentPage}</strong>
          </div>
          <div className="row topbar-right">
            <label className="sr-only" htmlFor="interface-language">
              {t("Interface language")}
            </label>
            <select
              id="interface-language"
              className="locale-select"
              aria-label={t("Interface language")}
              value={locale}
              onChange={(event) => setLocale(event.target.value as UiLocale)}
            >
              {locales.map((value) => (
                <option value={value} key={value}>
                  {localeNames[value]}
                </option>
              ))}
            </select>
            <span className="small muted">
              {t("Single-stage event control")}
            </span>
            <a href="#/help" className="icon-button" aria-label={t("Help")}>
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
        title={t("Your workspace")}
        description={t("Navigate your event.")}
      >
        <nav
          className="mobile-nav"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setMenu(false);
          }}
          aria-label={t("Mobile navigation")}
        >
          {links}
        </nav>
      </Modal>
      <Modal
        open={logout}
        onClose={() => setLogout(false)}
        title={t("Sign out of CuePilot?")}
        description={t(
          "This is an anonymous session. Signing out loses access to events owned by this identity. There is no account recovery in this build.",
        )}
        busy={leaving}
      >
        <p className="muted">
          {t(
            "Local event shortcuts and offline snapshots will be cleared. Server data remains until you delete the event or its 72-hour expiry.",
          )}
        </p>
        {error && (
          <p role="alert" className="notice notice-bad">
            {error}
          </p>
        )}
        <div className="row end">
          <button disabled={leaving} onClick={() => setLogout(false)}>
            {t("Keep working")}
          </button>
          <button
            className="danger"
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              void onSignOut().catch(() => {
                setError(t("Could not sign out. Try again."));
                setLeaving(false);
              });
            }}
          >
            {leaving ? t("Signing out…") : t("Sign out")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
