/**
 * Repair preview panel (§14).
 *
 * Shows original vs proposed intervals, minutes changed, the weighted cost and every
 * hard-rule check the server reported. Publish is enabled only when the server says
 * `feasible` — the frontend never decides that for itself.
 *
 * On infeasibility the copy follows §14's sentence shape exactly:
 *   "Sponsor fixed at 10:45; earliest feasible arrival 10:52; short by 7 minutes."
 */

import type { Cue, EventState, RepairResult } from "@cuepilot/domain";
import { useEffect, useState } from "react";

import { localTime, signedMinutes } from "../lib/format";
import { useI18n } from "../lib/i18n";

const titleOf = (state: EventState, cueId: string | null): string => {
  if (cueId === null) return "the plan";
  return state.cues.find((c) => c.id === cueId)?.title ?? cueId;
};

/** §14's infeasibility sentence, built from the server's quantified failure. */
const infeasibilitySentence = (
  state: EventState,
  result: RepairResult,
): string => {
  const failure = result.failure;
  if (failure === null) return "";
  const name = titleOf(state, failure.cueId);
  if (failure.rule === "fixed_start") {
    return `${name} fixed at ${localTime(state.startsAt, failure.limitMin)}; earliest feasible arrival ${localTime(state.startsAt, failure.earliestMin)}; short by ${failure.shortageMin} minutes. Change a rule or make an organizer decision.`;
  }
  return `The event must finish by ${localTime(state.startsAt, failure.limitMin)}; earliest feasible finish ${localTime(state.startsAt, failure.earliestMin)}; over by ${failure.shortageMin} minutes. Change a rule or make an organizer decision.`;
};

const RULE_LABELS: Record<string, string> = {
  minimum_durations: "Minimum durations respected",
  fixed_start: "Fixed start protected",
  hard_end: "Hard finish protected",
  buffer: "Buffer before cue respected",
  not_before: "Speaker release time respected",
  contiguous_order: "No overlapping cues",
  candidate_covers_pending: "Plan covers every pending cue",
  completed_immutable: "Completed cues untouched",
  active_immutable: "Active cue untouched",
  integer_minutes: "Whole minutes only",
};

export function RepairPreviewPanel({
  state,
  result,
  expiresAt,
  onApprove,
  onDiscard,
  approving,
  approveMessage,
}: {
  state: EventState;
  result: RepairResult;
  expiresAt: string;
  onApprove: () => void;
  onDiscard: () => void;
  approving: boolean;
  approveMessage: string;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const expired = now >= Date.parse(expiresAt);
  const byId = new Map<string, Cue>(state.cues.map((c) => [c.id, c]));
  const changed = new Map(result.changes.map((c) => [c.cueId, c]));

  return (
    <div className="card">
      <div className="row spread">
        <h2>{t("Repair preview")}</h2>
        <span className={`chip ${result.feasible ? "chip-ok" : "chip-bad"}`}>
          {result.feasible ? t("Feasible") : t("No feasible plan")}
        </span>
      </div>

      {/* §11 verbatim. */}
      <p className="notice small">
        Calculated from this scenario by the scheduling engine.
      </p>

      {result.feasible ? (
        <>
          <div className="row small muted">
            <span>
              {t("Recovered")}{" "}
              <strong>{signedMinutes(result.recoveredMin)}</strong>{" "}
              {t("minutes")}
              {result.recoveredMin < 0 ? ` ${t("(restored time)")}` : ""}
            </span>
            <span>
              {t("Weighted shortening cost")}{" "}
              <strong>{result.weightedShorteningCost}</strong>
            </span>
            <span>
              {t("Projected finish")}{" "}
              <strong>
                {result.projectedFinishMin === null
                  ? "—"
                  : localTime(state.startsAt, result.projectedFinishMin)}
              </strong>
            </span>
          </div>

          <div
            className="table-scroll"
            role="region"
            aria-label={t("Recovery comparison")}
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                {t("Original and proposed intervals for pending cues")}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t("Cue")}</th>
                  <th scope="col">{t("Now")}</th>
                  <th scope="col">{t("Proposed")}</th>
                  <th scope="col" className="num">
                    {t("Minutes")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.schedule.map((row) => {
                  const cue = byId.get(row.cueId);
                  const change = changed.get(row.cueId);
                  const oldDuration =
                    cue === undefined
                      ? 0
                      : cue.plannedEndMin - cue.plannedStartMin;
                  const newDuration = row.endMin - row.startMin;
                  const delta = newDuration - oldDuration;
                  return (
                    <tr
                      key={row.cueId}
                      className={change === undefined ? "" : "changed"}
                    >
                      <th scope="row">{cue?.title ?? row.cueId}</th>
                      <td>
                        {cue === undefined
                          ? "—"
                          : `${localTime(state.startsAt, cue.plannedStartMin)}–${localTime(state.startsAt, cue.plannedEndMin)}`}
                      </td>
                      <td>
                        {localTime(state.startsAt, row.startMin)}
                        {"–"}
                        {localTime(state.startsAt, row.endMin)}
                      </td>
                      <td className="num">
                        {delta === 0
                          ? t("unchanged")
                          : `${signedMinutes(delta)} ${t("minute")}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="notice notice-bad" role="alert">
          {infeasibilitySentence(state, result)}
        </p>
      )}

      <h3 className="small">{t("Hard-rule checks")}</h3>
      <ul className="small">
        {result.constraintChecks.map((check, i) => (
          <li key={`${check.rule}-${check.cueId ?? "all"}-${i}`}>
            <span className={`chip ${check.passed ? "chip-ok" : "chip-bad"}`}>
              {check.passed ? t("pass") : t("fail")}
            </span>{" "}
            {t(RULE_LABELS[check.rule] ?? check.rule)}
            {check.cueId === null ? "" : `: ${titleOf(state, check.cueId)}`}
          </li>
        ))}
      </ul>

      <p className="small muted">
        {t(
          "This preview expires at {time} (ten real minutes). The published plan has not changed.",
          { time: new Date(expiresAt).toLocaleTimeString() },
        )}
      </p>

      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={onApprove}
          disabled={!result.feasible || approving || expired}
          aria-describedby={result.feasible ? undefined : "why-disabled"}
        >
          {approving ? t("Publishing…") : t("Approve and publish")}
        </button>
        <button type="button" onClick={onDiscard} disabled={approving}>
          {t("Discard preview")}
        </button>
      </div>
      {expired && (
        <p className="notice notice-warn" role="status">
          {t("This preview has expired. Discard it and calculate a new plan.")}
        </p>
      )}
      {result.feasible ? null : (
        <p id="why-disabled" className="small muted">
          {t(
            "Publishing is disabled because no plan satisfies every rule. CuePilot will not relax a rule on its own.",
          )}
        </p>
      )}
      {approveMessage === "" ? null : (
        <p className="notice notice-bad small" role="alert">
          {approveMessage}
        </p>
      )}
    </div>
  );
}
