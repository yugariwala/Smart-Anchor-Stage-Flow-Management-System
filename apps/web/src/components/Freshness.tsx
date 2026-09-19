/**
 * Freshness and the §11 cached-view label.
 *
 * Status is never colour-only: each state carries its own text and a shape glyph. The
 * offline label is §11 verbatim, including the revision number and last sync time, so a
 * stale view can never be mistaken for a live one.
 */

import type { Freshness } from "../lib/useSnapshotPoll";

const hhmmss = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export function FreshnessChip({
  freshness,
  revision,
}: {
  freshness: Freshness;
  revision: number | null;
}) {
  const label =
    freshness === "live"
      ? "Live"
      : freshness === "amber"
        ? "Syncing"
        : "Updates paused";
  const cls =
    freshness === "live"
      ? "chip-ok"
      : freshness === "amber"
        ? "chip-warn"
        : "chip-bad";
  return (
    <span className={`chip ${cls}`}>
      {label}
      {revision === null ? "" : ` · revision ${revision}`}
    </span>
  );
}

/**
 * §11 verbatim: "Offline snapshot · revision N · last synced HH:MM:SS. Updates paused."
 * Only rendered once freshness is stale, so it never contradicts a live indicator.
 */
export function StaleSnapshotNotice({
  freshness,
  revision,
  lastSyncAt,
}: {
  freshness: Freshness;
  revision: number | null;
  lastSyncAt: number | null;
}) {
  if (freshness !== "stale") return null;
  return (
    <p className="notice notice-bad small" role="status">
      Offline snapshot {"·"} revision {revision ?? "—"} {"·"} last synced{" "}
      {lastSyncAt === null ? "never" : hhmmss(lastSyncAt)}. Updates paused.
      <br />
      <span className="small">
        Any countdown shown is an estimate from cached timing, not live
        coordination.
      </span>
    </p>
  );
}
