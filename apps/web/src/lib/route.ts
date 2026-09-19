import { useEffect, useState } from "react";

export type EventPage =
  | "setup"
  | "console"
  | "speakers"
  | "scripts"
  | "announcements"
  | "history"
  | "settings";
export type Route =
  | { kind: "landing" | "help" | "session" | "notfound" }
  | { kind: EventPage | "anchor" | "join"; eventId: string };
const eventPages = new Set([
  "setup",
  "console",
  "speakers",
  "scripts",
  "announcements",
  "history",
  "settings",
]);
export const parseRoute = (hash: string): Route => {
  const path = hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  if (!path) return { kind: "landing" };
  if (path === "help" || path === "session") return { kind: path };
  const parts = path.split("/");
  const id = parts[1];
  if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return { kind: "notfound" };
  if (parts.length === 2 && (parts[0] === "join" || parts[0] === "anchor"))
    return { kind: parts[0], eventId: id };
  if (
    parts.length === 3 &&
    parts[0] === "event" &&
    eventPages.has(parts[2] ?? "")
  )
    return { kind: parts[2] as EventPage, eventId: id };
  return { kind: "notfound" };
};
export const useRoute = (): Route => {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
};
export const navigate = (hash: string): void => {
  window.location.hash = hash;
};
export const consumeInviteCode = (): string | null => {
  const hash = window.location.hash;
  const at = hash.indexOf("?");
  if (at === -1) return null;
  const params = new URLSearchParams(hash.slice(at + 1));
  const code = params.get("code");
  params.delete("code");
  history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${hash.slice(0, at)}${params.size ? `?${params}` : ""}`,
  );
  return code;
};
export const inviteLink = (eventId: string, code: string): string =>
  `${window.location.origin}${window.location.pathname}#/join/${eventId}?code=${encodeURIComponent(code)}`;
