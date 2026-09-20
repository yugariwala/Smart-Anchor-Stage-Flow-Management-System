/**
 * Freshness and the §11 cached-view label.
 *
 * Status is never colour-only: each state carries its own text and a shape glyph. The
 * offline label is §11 verbatim, including the revision number and last sync time, so a
 * stale view can never be mistaken for a live one.
 */

import type { Freshness } from "../lib/useSnapshotPoll";
import { useI18n } from "../lib/i18n";

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
  const { t } = useI18n();
  const label =
    freshness === "live"
      ? t("Live")
      : freshness === "amber"
        ? t("Syncing")
        : t("Updates paused");
  const cls =
    freshness === "live"
      ? "chip-ok"
      : freshness === "amber"
        ? "chip-warn"
        : "chip-bad";
  return (
    <span className={`chip ${cls}`}>
      {label}
      {revision === null ? "" : ` · ${t("revision")} ${revision}`}
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
  const { t } = useI18n();
  if (freshness !== "stale") return null;
  return (
    <p className="notice notice-bad small" role="status">
      {t(
        "Offline snapshot · revision {revision} · last synced {time}. Updates paused.",
        {
          revision: revision ?? "—",
          time: lastSyncAt === null ? t("never") : hhmmss(lastSyncAt),
        },
      )}
      <br />
      <span className="small">
        {t(
          "Any countdown shown is an estimate from cached timing, not live coordination.",
        )}
      </span>
    </p>
  );
}
