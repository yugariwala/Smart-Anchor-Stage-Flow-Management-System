/**
 * Script review panel (§14, §11).
 *
 * The draft sits beside the facts it was given, because §7B is explicit that a valid schema
 * and resolvable fact ids do NOT prove the words are faithful. The human reading both is the
 * gate, so the sources have to be on screen at the same time as the copy.
 *
 * Three observable statuses only, never a confidence score:
 *   schema checked · referenced facts found · human review pending/complete
 */

import type { EventState } from "@cuepilot/domain";
import { useState } from "react";

import type { ScriptDraftResponse } from "../lib/api";

/** §11 labels, verbatim. */
const AI_LABEL = "AI-generated draft — human review required.";
const TEMPLATE_LABEL = "Template fallback — AI unavailable.";

/**
 * Resolves a fact id to its text, including the server-created records whose ids are
 * reserved (`event:name`, `speaker:<id>:name`). Those are synthesised at generation time and
 * are not stored in `eventFacts`, so looking only there would show them as missing.
 */
const factText = (
  state: EventState,
  draft: ScriptDraftResponse,
  id: string,
): { text: string; reserved: boolean } | null => {
  const supplied = draft.approvedFacts.find((f) => f.id === id);
  if (supplied) return { text: supplied.text, reserved: /^(?:event|speaker):/.test(id) };
  const stored = [...state.eventFacts, ...state.speakers.flatMap((s) => s.facts)].find(
    (f) => f.id === id,
  );
  return stored ? { text: stored.text, reserved: false } : null;
};

export function ScriptReview({
  state,
  draft,
  busy,
  message,
  onApprove,
  onDiscard,
}: {
  state: EventState;
  draft: ScriptDraftResponse;
  busy: boolean;
  message: string;
  onApprove: (body: string, usedFactIds: string[]) => void;
  onDiscard: () => void;
}) {
  const [body, setBody] = useState(draft.body);
  const edited = body.trim() !== draft.body.trim();
  const overLength = body.length > 1500;

  return (
    <section className="card">
      <div className="row spread">
        <h2>Review draft</h2>
        <span className={`chip ${draft.source === "gemini" ? "chip-info" : "chip-warn"}`}>
          {draft.source === "gemini" ? "AI draft" : "Template"}
        </span>
      </div>

      {/* §11 verbatim. The label states which pipeline produced the words, always. */}
      <p className={draft.source === "gemini" ? "notice small" : "notice notice-warn small"}>
        {draft.source === "gemini" ? AI_LABEL : TEMPLATE_LABEL}
        {draft.fallbackReason ? ` (${draft.fallbackReason})` : ""}
        {draft.model ? ` · ${draft.model}` : ""}
      </p>

      {/* Three observable statuses. Never a confidence score (§7B). */}
      <ul className="small" style={{ listStyle: "none", padding: 0 }}>
        <li>
          <span className="chip chip-ok">pass</span> Schema checked
        </li>
        <li>
          <span className="chip chip-ok">pass</span> Referenced facts found (
          {draft.usedFactIds.length})
        </li>
        <li>
          <span className="chip chip-warn">pending</span> Human review{" "}
          {edited ? "· edited" : "· unedited"}
        </li>
      </ul>

      {draft.warnings.length > 0 && (
        <div className="notice notice-warn small" role="alert">
          <strong>Warnings from validation</strong>
          <ul>
            {draft.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="script-review-grid">
        <div className="field">
          <label htmlFor="script-body">Draft copy (edit before approving if needed)</label>
          <textarea
            id="script-body"
            rows={8}
            value={body}
            lang={"en"}
            onChange={(e) => setBody(e.target.value)}
          />
          <span className="small muted">
            {body.length}/1500 characters
            {overLength ? " — too long to approve" : ""}
          </span>
        </div>

        <div>
          <h3 className="small">Source facts the model was given</h3>
          <ul className="fact-list small">
            {draft.approvedFacts.map((fact) => {
              const used = draft.usedFactIds.includes(fact.id);
              const reserved = /^(?:event|speaker):/.test(fact.id);
              return (
                <li key={fact.id}>
                  <span className={`chip ${used ? "chip-ok" : "chip-info"}`}>
                    {used ? "used" : "unused"}
                  </span>{" "}
                  {fact.text}
                  {reserved && (
                    <span className="small muted"> · server record</span>
                  )}
                </li>
              );
            })}
          </ul>
          {draft.usedFactIds.some((id) => factText(state, draft, id) === null) && (
            <p className="notice notice-bad small" role="alert">
              This draft references a fact that is not in the snapshot. Do not approve it.
            </p>
          )}
        </div>
      </div>

      <p className="small muted">
        A valid schema and resolvable fact references do not prove the copy is faithful to the
        facts. Read the draft against the sources before approving.
      </p>

      {message && (
        <p className="notice notice-bad small" role="alert">
          {message}
        </p>
      )}

      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={busy || overLength || body.trim().length === 0}
          onClick={() => onApprove(body, draft.usedFactIds)}
        >
          {busy ? "Approving…" : "Approve and publish copy"}
        </button>
        <button type="button" onClick={onDiscard} disabled={busy}>
          Discard draft
        </button>
      </div>
    </section>
  );
}
