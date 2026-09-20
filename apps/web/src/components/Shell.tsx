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

/*
  Grouped by when a link is actually useful. Flat, eight items deep, half of them dead
  ends until the runbook is published, it read as "eight things you must do now".
  The Shell has no publication state to disable them with, so it orders them instead.
*/
const eventNav = [
  {
    group: "navPrepare",
    items: [
      ["setup", "eventSetup", CalendarIcon],
      ["speakers", "speakersFacts", PersonIcon],
    ],
  },
  {
    group: "navRunShow",
    items: [
      ["console", "stageConsole", DashboardIcon],
      ["scripts", "hostScripts", ReaderIcon],
      ["announcements", "announcements", SpeakerLoudIcon],
    ],
  },
  {
    group: "navAfterwards",
    items: [
      ["history", "revisionHistory", CounterClockwiseClockIcon],
      ["settings", "eventSettings", GearIcon],
    ],
  },
] as const;

const locales = ["en", "hi", "gu"] as const;
type UiLocale = (typeof locales)[number];
const localeNames: Record<UiLocale, string> = {
  en: "English",
  hi: "हिन्दी",
  gu: "ગુજરાતી",
};
const uiCopy = {
  en: {
    yourEvents: "Your events",
    eventWorkspace: "Event workspace",
    navPrepare: "Prepare",
    navRunShow: "Run the show",
    navAfterwards: "Afterwards",
    stageConsole: "Stage console",
    eventSetup: "Event setup",
    speakersFacts: "Speakers & facts",
    hostScripts: "Host scripts",
    announcements: "Announcements",
    revisionHistory: "Revision history",
    eventSettings: "Event settings",
    anchorView: "Anchor view",
    anchorRunbook: "Anchor runbook",
    helpGuide: "Help & guide",
    help: "Help",
    signOut: "Sign out",
    signingOut: "Signing out…",
    yourWorkspace: "Your workspace",
    workspace: "Workspace",
    anonymousSession: "Anonymous session",
    skipContent: "Skip to content",
    stageWorkspace: "Stage workspace",
    stageTagline: "One stage. One shared plan.",
    mainNavigation: "Main navigation",
    humanLed: "Human-led. Stage-ready.",
    openNavigation: "Open navigation",
    interfaceLanguage: "Interface language",
    navigateEvent: "Navigate your event.",
    mobileNavigation: "Mobile navigation",
    signOutTitle: "Sign out of CuePilot?",
    signOutDescription:
      "This is an anonymous session. Signing out loses access to events owned by this identity. There is no account recovery in this build.",
    signOutBody:
      "Local event shortcuts and offline snapshots will be cleared. Server data remains until you delete the event or its 72-hour expiry.",
    keepWorking: "Keep working",
    signOutError: "Could not sign out. Try again.",
  },
  hi: {
    yourEvents: "आपके कार्यक्रम",
    eventWorkspace: "कार्यक्रम कार्यक्षेत्र",
    navPrepare: "तैयारी",
    navRunShow: "कार्यक्रम चलाएँ",
    navAfterwards: "बाद में",
    stageConsole: "मंच कंसोल",
    eventSetup: "कार्यक्रम सेटअप",
    speakersFacts: "वक्ता और तथ्य",
    hostScripts: "संचालक स्क्रिप्ट्स",
    announcements: "घोषणाएँ",
    revisionHistory: "संशोधन इतिहास",
    eventSettings: "कार्यक्रम सेटिंग्स",
    anchorView: "एंकर दृश्य",
    anchorRunbook: "एंकर रनबुक",
    helpGuide: "सहायता और मार्गदर्शिका",
    help: "सहायता",
    signOut: "साइन आउट",
    signingOut: "साइन आउट हो रहा है…",
    yourWorkspace: "आपका कार्यक्षेत्र",
    workspace: "कार्यक्षेत्र",
    anonymousSession: "अनाम सत्र",
    skipContent: "मुख्य सामग्री पर जाएँ",
    stageWorkspace: "मंच कार्यक्षेत्र",
    stageTagline: "एक मंच। एक साझा योजना।",
    mainNavigation: "मुख्य नेविगेशन",
    humanLed: "मानव-नेतृत्व। मंच के लिए तैयार।",
    openNavigation: "नेविगेशन खोलें",
    interfaceLanguage: "इंटरफ़ेस भाषा",
    navigateEvent: "अपने कार्यक्रम में जाएँ।",
    mobileNavigation: "मोबाइल नेविगेशन",
    signOutTitle: "CuePilot से साइन आउट करें?",
    signOutDescription:
      "यह एक अनाम सत्र है। साइन आउट करने पर इस पहचान के कार्यक्रमों की पहुँच चली जाएगी। इस संस्करण में खाता पुनर्प्राप्ति उपलब्ध नहीं है।",
    signOutBody:
      "स्थानीय कार्यक्रम शॉर्टकट और ऑफ़लाइन स्नैपशॉट मिटा दिए जाएँगे। सर्वर डेटा कार्यक्रम हटाने या 72 घंटे की अवधि पूरी होने तक रहेगा।",
    keepWorking: "काम जारी रखें",
    signOutError: "साइन आउट नहीं हो सका। फिर प्रयास करें।",
  },
  gu: {
    yourEvents: "તમારા કાર્યક્રમો",
    eventWorkspace: "કાર્યક્રમ કાર્યક્ષેત્ર",
    navPrepare: "તૈયારી",
    navRunShow: "કાર્યક્રમ ચલાવો",
    navAfterwards: "પછીથી",
    stageConsole: "મંચ કન્સોલ",
    eventSetup: "કાર્યક્રમ સેટઅપ",
    speakersFacts: "વક્તાઓ અને તથ્યો",
    hostScripts: "સંચાલક સ્ક્રિપ્ટ્સ",
    announcements: "જાહેરાતો",
    revisionHistory: "સુધારા ઇતિહાસ",
    eventSettings: "કાર્યક્રમ સેટિંગ્સ",
    anchorView: "એન્કર દૃશ્ય",
    anchorRunbook: "એન્કર રનબુક",
    helpGuide: "સહાય અને માર્ગદર્શિકા",
    help: "સહાય",
    signOut: "સાઇન આઉટ",
    signingOut: "સાઇન આઉટ થઈ રહ્યું છે…",
    yourWorkspace: "તમારું કાર્યક્ષેત્ર",
    workspace: "કાર્યક્ષેત્ર",
    anonymousSession: "અનામી સત્ર",
    skipContent: "મુખ્ય સામગ્રી પર જાઓ",
    stageWorkspace: "મંચ કાર્યક્ષેત્ર",
    stageTagline: "એક મંચ. એક સહિયારી યોજના.",
    mainNavigation: "મુખ્ય નેવિગેશન",
    humanLed: "માનવ-સંચાલિત. મંચ માટે તૈયાર.",
    openNavigation: "નેવિગેશન ખોલો",
    interfaceLanguage: "ઇન્ટરફેસ ભાષા",
    navigateEvent: "તમારા કાર્યક્રમમાં નેવિગેટ કરો.",
    mobileNavigation: "મોબાઇલ નેવિગેશન",
    signOutTitle: "CuePilotમાંથી સાઇન આઉટ કરશો?",
    signOutDescription:
      "આ એક અનામી સત્ર છે. સાઇન આઉટ કરવાથી આ ઓળખના કાર્યક્રમોની ઍક્સેસ ગુમાવશો. આ સંસ્કરણમાં એકાઉન્ટ પુનઃપ્રાપ્તિ ઉપલબ્ધ નથી.",
    signOutBody:
      "સ્થાનિક કાર્યક્રમ શૉર્ટકટ્સ અને ઑફલાઇન સ્નૅપશૉટ્સ સાફ થશે. કાર્યક્રમ કાઢી નાખો અથવા 72 કલાકની મુદત પૂરી થાય ત્યાં સુધી સર્વર ડેટા રહેશે.",
    keepWorking: "કામ ચાલુ રાખો",
    signOutError: "સાઇન આઉટ થઈ શક્યું નહીં. ફરી પ્રયાસ કરો.",
  },
} as const;

const readLocale = (): UiLocale => {
  const saved = localStorage.getItem("cuepilot:ui-language");
  return locales.find((locale) => locale === saved) ?? "en";
};
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
  const [locale, setLocale] = useState<UiLocale>(readLocale);
  const copy = uiCopy[locale];
  const eventId =
    "eventId" in route && route.kind !== "join" && route.kind !== "anchor"
      ? route.eventId
      : null;
  // The nav is grouped now, so the page-title lookup searches each group in turn.
  const navItem = eventNav
    .map((section) => section.items.find((item) => item[0] === route.kind))
    .find((item) => item !== undefined);
  const currentPage = navItem
    ? copy[navItem[1]]
    : route.kind === "landing"
      ? copy.yourEvents
      : route.kind === "anchor"
        ? copy.anchorRunbook
        : copy.workspace;
  useEffect(() => {
    document.title = `CuePilot · ${currentPage}`;
    document.documentElement.lang = locale;
    localStorage.setItem("cuepilot:ui-language", locale);
    document.getElementById("main-content")?.focus();
  }, [currentPage, eventId, locale]);
  const links = (
    <>
      <a
        href="#/"
        className={`nav-link ${route.kind === "landing" ? "selected" : ""}`}
        aria-current={route.kind === "landing" ? "page" : undefined}
      >
        <CalendarIcon />
        {copy.yourEvents}
      </a>
      {eventId && (
        <>
          {eventNav.map(({ group, items }) => (
            <div key={group}>
              <p className="nav-label">{copy[group]}</p>
              {items.map(([key, copyKey, Icon]) => (
                <a
                  key={key}
                  href={`#/event/${eventId}/${key}`}
                  className={`nav-link ${route.kind === key ? "selected" : ""}`}
                  aria-current={route.kind === key ? "page" : undefined}
                >
                  <Icon />
                  {copy[copyKey]}
                </a>
              ))}
              {group === "navRunShow" ? (
                <a className="nav-link" href={`#/anchor/${eventId}`}>
                  <ArrowTopRightIcon />
                  {copy.anchorView}
                </a>
              ) : null}
            </div>
          ))}
        </>
      )}
      <div className="nav-bottom">
        <a href="#/help" className="nav-link">
          <QuestionMarkCircledIcon />
          {copy.helpGuide}
        </a>
        <button
          className="nav-link"
          onClick={() => {
            setMenu(false);
            setLogout(true);
          }}
        >
          <ExitIcon />
          {copy.signOut}
        </button>
        <div className="session-label">
          <span className="avatar">YO</span>
          <div>
            <strong>{copy.yourWorkspace}</strong>
            <span>
              {copy.anonymousSession} · {uid.slice(0, 6)}
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
        {copy.skipContent}
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
            <strong>{copy.stageWorkspace}</strong>
            <small>{copy.stageTagline}</small>
          </div>
        </div>
        <nav aria-label={copy.mainNavigation}>{links}</nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          {copy.humanLed}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenu(true)}
            aria-label={copy.openNavigation}
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
              {copy.interfaceLanguage}
            </label>
            <select
              id="interface-language"
              className="locale-select"
              aria-label={copy.interfaceLanguage}
              value={locale}
              onChange={(event) => setLocale(event.target.value as UiLocale)}
            >
              {locales.map((value) => (
                <option value={value} key={value}>
                  {localeNames[value]}
                </option>
              ))}
            </select>
            <a href="#/help" className="icon-button" aria-label={copy.help}>
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
        title={copy.yourWorkspace}
        description={copy.navigateEvent}
      >
        <nav
          className="mobile-nav"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setMenu(false);
          }}
          aria-label={copy.mobileNavigation}
        >
          {links}
        </nav>
      </Modal>
      <Modal
        open={logout}
        onClose={() => setLogout(false)}
        title={copy.signOutTitle}
        description={copy.signOutDescription}
        busy={leaving}
      >
        <p className="muted">{copy.signOutBody}</p>
        {error && (
          <p role="alert" className="notice notice-bad">
            {error}
          </p>
        )}
        <div className="row end">
          <button disabled={leaving} onClick={() => setLogout(false)}>
            {copy.keepWorking}
          </button>
          <button
            className="danger"
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              void onSignOut().catch(() => {
                setError(copy.signOutError);
                setLeaving(false);
              });
            }}
          >
            {leaving ? copy.signingOut : copy.signOut}
          </button>
        </div>
      </Modal>
    </div>
  );
}
