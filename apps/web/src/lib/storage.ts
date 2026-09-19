import type { EventState } from "@cuepilot/domain";

export type RecentEvent = {
  id: string;
  name: string;
  role: "owner" | "anchor";
  expiresAt: string;
};
let identity = "";
export const getStorageIdentity = (): string => identity;
export const setStorageIdentity = (uid: string): void => {
  identity = uid;
};
export const storageKey = (kind: string): string =>
  `cuepilot:${identity}:${kind}`;
export const readStored = <T>(key: string, fallback: T): T => {
  try {
    return (
      (JSON.parse(localStorage.getItem(storageKey(key)) ?? "null") as T) ??
      fallback
    );
  } catch {
    return fallback;
  }
};
export const writeStored = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  } catch {
    /* Storage can be blocked. */
  }
};
export const recentEvents = (): RecentEvent[] => {
  const data = readStored<RecentEvent[]>("events", []);
  return Array.isArray(data)
    ? data.filter(
        (e) =>
          e &&
          typeof e.id === "string" &&
          typeof e.name === "string" &&
          (e.role === "owner" || e.role === "anchor") &&
          Date.parse(e.expiresAt) > Date.now(),
      )
    : [];
};
export const rememberEvent = (
  state: EventState,
  role: "owner" | "anchor",
): void => {
  writeStored(
    "events",
    [
      { id: state.id, name: state.name, role, expiresAt: state.expiresAt },
      ...recentEvents().filter((e) => e.id !== state.id),
    ].slice(0, 30),
  );
};
export const forgetEvent = (eventId: string): void => {
  writeStored(
    "events",
    recentEvents().filter((e) => e.id !== eventId),
  );
  try {
    localStorage.removeItem(storageKey(`snapshot:${eventId}`));
  } catch {
    /* Optional cache. */
  }
};
export const clearLocalData = (): void => {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("cuepilot:")) localStorage.removeItem(key);
  } catch {
    /* Storage can be blocked. */
  }
};
