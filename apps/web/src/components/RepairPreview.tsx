/**
 * Recovery plan panel (§14).
 *
 * Shows original vs proposed intervals, minutes changed and every hard-rule check the
 * server reported. Publish is enabled only when the server says `feasible` — the
 * frontend never decides that for itself.
 *
 * §14's infeasibility sentence carries three facts: the limit, the earliest reachable
 * time, and the shortage. All three are kept verbatim in value; only the sentence around
 * them is written for an organizer rather than for the solver, and it now names the
 * concrete options instead of saying "make an organizer decision".
 */

import type { Cue, EventState, RepairResult } from "@cuepilot/domain";
import { useEffect, useState } from "react";

import { localTime, signedMinutes } from "../lib/format";

const titleOf = (state: EventState, cueId: string | null): string => {
  if (cueId === null) return "the plan";
  return state.cues.find((c) => c.id === cueId)?.title ?? cueId;
};

/**
 * §14's infeasibility sentence. The three quantified facts — the limit, the earliest
 * reachable time and the shortage — are unchanged; the wording names what the organizer
 * can actually do instead of telling her to "make an organizer decision".
 */
const infeasibilitySentence = (
  state: EventState,
  result: RepairResult,
): string => {
  const failure = result.failure;
  if (failure === null) return "";
  const name = titleOf(state, failure.cueId);
  const limit = localTime(state.startsAt, failure.limitMin);
  const earliest = localTime(state.startsAt, failure.earliestMin);
  if (failure.rule === "fixed_start") {
    return `This won’t fit. ${name} is locked to ${limit}, but the earliest you could reach it is ${earliest} — short by ${failure.shortageMin} minutes. To publish, shorten something, drop an item, or move ${name}.`;
  }
  return `This won’t fit. The event has to finish by ${limit}, but the earliest possible finish is ${earliest} — over by ${failure.shortageMin} minutes. To publish, shorten something, drop an item, or move your finish time.`;
};

/** Phrased as what the organizer keeps, not as the rule the solver enforced. */
const RULE_LABELS: Record<string, string> = {
  minimum_durations: "Nothing shortened past its shortest length",
  fixed_start: "Fixed start time kept",
  hard_end: "Still finishes by your deadline",
  buffer: "Gap before this item kept",
  not_before: "Speaker’s earliest time respected",
  contiguous_order: "Nothing overlaps",
  candidate_covers_pending: "Every remaining item still has a slot",
  completed_immutable: "Finished items untouched",
  active_immutable: "The item on stage untouched",
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
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const expired = now >= Date.parse(expiresAt);
  const byId = new Map<string, Cue>(state.cues.map((c) => [c.id, c]));
  const changed = new Map(result.changes.map((c) => [c.cueId, c]));

  // "How many items got shorter" is the question the weighted cost was standing in for.
  const shortenedCount = result.schedule.filter((row) => {
    const cue = byId.get(row.cueId);
    if (cue === undefined) return false;
    return row.endMin - row.startMin < cue.plannedEndMin - cue.plannedStartMin;
  }).length;

  return (
    <div className="card">
      {/*
        No heading here: the only caller is a dialog already titled "Recovery plan", and
        repeating it read as two headings for one thing.
      */}
      <div className="row spread">
        {/* Amber, matching the sentence below: a verdict, not a failure. */}
        <span className={`chip ${result.feasible ? "chip-ok" : "chip-warn"}`}>
          {result.feasible ? "This fits" : "This won’t fit"}
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
              Recovered <strong>{signedMinutes(result.recoveredMin)}</strong>{" "}
              minutes
              {result.recoveredMin < 0 ? " (restored time)" : ""}
            </span>
            <span>
              <strong>{shortenedCount}</strong>{" "}
              {shortenedCount === 1 ? "item" : "items"} shortened
            </span>
            <span>
              Projected finish{" "}
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
            aria-label="Recovery comparison"
            tabIndex={0}
          >
            <table>
              <caption className="sr-only">
                Original and proposed intervals for pending cues
              </caption>
              <thead>
                <tr>
                  <th scope="col">Session</th>
                  <th scope="col">Now</th>
                  <th scope="col">Proposed</th>
                  <th scope="col" className="num">
                    Minutes
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
                          ? "unchanged"
                          : `${signedMinutes(delta)} min`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/*
            The weighted cost is how the solver ranked this plan against the alternatives.
            It is real and worth keeping, but it means nothing without the model, so it
            sits behind a disclosure instead of in the headline row.
          */}
          <details className="small muted">
            <summary>Why this plan?</summary>
            <p>
              Of every arrangement that keeps all your fixed commitments, this
              one loses the least. Its shortening score is{" "}
              <strong>{result.weightedShorteningCost}</strong> — lower is
              better, and items you marked as more protected count for more.
            </p>
          </details>
        </>
      ) : (
        /*
          Amber, not red, and a status rather than an alert. Refusing with the shortage
          quantified is the product working correctly — the organizer asked a question
          and got a precise answer. Styling it as a failure hid that.
        */
        <p className="notice notice-warn" role="status">
          {infeasibilitySentence(state, result)}
        </p>
      )}

      <h3 className="small">What this plan protects</h3>
      <ul className="small">
        {result.constraintChecks.map((check, i) => (
          <li key={`${check.rule}-${check.cueId ?? "all"}-${i}`}>
            <span className={`chip ${check.passed ? "chip-ok" : "chip-bad"}`}>
              {check.passed ? "pass" : "fail"}
            </span>{" "}
            {RULE_LABELS[check.rule] ?? check.rule}
            {check.cueId === null ? "" : `: ${titleOf(state, check.cueId)}`}
          </li>
        ))}
      </ul>

      <p className="small muted">
        Expires at{" "}
        {new Date(expiresAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}{" "}
        (10 minutes from now). The published plan has not changed.
      </p>

      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={onApprove}
          disabled={!result.feasible || approving || expired}
          aria-describedby={result.feasible ? undefined : "why-disabled"}
        >
          {approving ? "Publishing…" : "Publish this plan"}
        </button>
        <button type="button" onClick={onDiscard} disabled={approving}>
          Cancel
        </button>
      </div>
      {expired && (
        <p className="notice notice-warn" role="status">
          This plan is more than 10 minutes old. Cancel it and preview again for
          current times.
        </p>
      )}
      {result.feasible ? null : (
        <p id="why-disabled" className="small muted">
          There is nothing to publish because nothing fits all your fixed
          commitments. CuePilot won’t quietly break one for you.
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
