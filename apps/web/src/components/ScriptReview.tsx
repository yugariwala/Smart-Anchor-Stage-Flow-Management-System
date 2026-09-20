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
import { useEffect, useState } from "react";

import type { ScriptDraftResponse } from "../lib/api";
import { useI18n } from "../lib/i18n";

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
  if (supplied)
    return { text: supplied.text, reserved: /^(?:event|speaker):/.test(id) };
  const stored = [
    ...state.eventFacts,
    ...state.speakers.flatMap((s) => s.facts),
  ].find((f) => f.id === id);
  return stored ? { text: stored.text, reserved: false } : null;
};

export function ScriptReview({
  state,
  draft,
  busy,
  message,
  onApprove,
  onDiscard,
  language = "en",
}: {
  state: EventState;
  draft: ScriptDraftResponse;
  busy: boolean;
  message: string;
  onApprove: (body: string, usedFactIds: string[]) => void;
  onDiscard: () => void;
  language?: "en" | "hi" | "gu";
}) {
  const { t } = useI18n();
  const [body, setBody] = useState(draft.body);
  const [reviewed, setReviewed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const expired = now >= Date.parse(draft.expiresAt);
  const missingFacts = draft.usedFactIds.some(
    (id) => factText(state, draft, id) === null,
  );
  const edited = body.trim() !== draft.body.trim();
  const overLength = body.length > 1500;

  return (
    <section className="card">
      <div className="row spread">
        <h2>{t("Review draft")}</h2>
        <span
          className={`chip ${draft.source === "gemini" ? "chip-info" : "chip-warn"}`}
        >
          {draft.source === "gemini" ? t("AI draft") : t("Template")}
        </span>
      </div>

      {/* §11 verbatim. The label states which pipeline produced the words, always. */}
      <p
        className={
          draft.source === "gemini"
            ? "notice small"
            : "notice notice-warn small"
        }
      >
        {draft.source === "gemini" ? AI_LABEL : TEMPLATE_LABEL}
        {draft.fallbackReason ? ` (${draft.fallbackReason})` : ""}
        {draft.model ? ` · ${draft.model}` : ""}
      </p>

      {/* Three observable statuses. Never a confidence score (§7B). */}
      <ul className="small" style={{ listStyle: "none", padding: 0 }}>
        <li>
          <span className="chip chip-ok">{t("pass")}</span>{" "}
          {t("Schema checked")}
        </li>
        <li>
          <span className={`chip ${missingFacts ? "chip-warn" : "chip-ok"}`}>
            {missingFacts ? t("missing") : t("pass")}
          </span>{" "}
          {t("Referenced facts found ({count})", {
            count: draft.usedFactIds.length,
          })}
        </li>
        <li>
          <span className="chip chip-warn">{t("pending")}</span>{" "}
          {t("Human review")} · {edited ? t("edited") : t("unedited")}
        </li>
      </ul>

      {draft.warnings.length > 0 && (
        <div className="notice notice-warn small" role="alert">
          <strong>{t("Warnings from validation")}</strong>
          <ul>
            {draft.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="script-review-grid">
        <div className="field">
          <label htmlFor="script-body">
            {t("Draft copy (edit before approving if needed)")}
          </label>
          <textarea
            id="script-body"
            rows={8}
            value={body}
            lang={language}
            disabled={busy}
            onChange={(e) => {
              setBody(e.target.value);
              setReviewed(false);
            }}
          />
          <span className="small muted">
            {t("{count}/1500 characters", { count: body.length })}
            {overLength ? ` ${t("— too long to approve")}` : ""}
          </span>
        </div>

        <div>
          <h3 className="small">{t("Source facts the model was given")}</h3>
          <ul className="fact-list small">
            {draft.approvedFacts.map((fact) => {
              const used = draft.usedFactIds.includes(fact.id);
              const reserved = /^(?:event|speaker):/.test(fact.id);
              return (
                <li key={fact.id}>
                  <span className={`chip ${used ? "chip-ok" : "chip-info"}`}>
                    {used ? t("used") : t("unused")}
                  </span>{" "}
                  {fact.text}
                  {reserved && (
                    <span className="small muted"> · {t("server record")}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {missingFacts && (
            <p className="notice notice-bad small" role="alert">
              {t(
                "This draft references a fact that is not in the snapshot. Do not approve it.",
              )}
            </p>
          )}
        </div>
      </div>

      <p className="small muted">
        {t(
          "A valid schema and resolvable fact references do not prove the copy is faithful to the facts. Read the draft against the sources before approving.",
        )}
      </p>

      {message && (
        <p className="notice notice-bad small" role="alert">
          {message}
        </p>
      )}

      <label className="review-check">
        <input
          type="checkbox"
          checked={reviewed}
          disabled={busy}
          onChange={(event) => setReviewed(event.target.checked)}
        />
        {t(
          "I reviewed the words against the approved facts and checked the language.",
        )}
      </label>
      {expired && (
        <p className="notice notice-warn" role="status">
          {t("This draft has expired. Discard it and generate a new one.")}
        </p>
      )}
      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={
            busy ||
            overLength ||
            body.trim().length === 0 ||
            missingFacts ||
            expired ||
            !reviewed
          }
          onClick={() => onApprove(body, draft.usedFactIds)}
        >
          {busy ? t("Publishing…") : t("Publish this script")}
        </button>
        <button type="button" onClick={onDiscard} disabled={busy}>
          {t("Discard draft")}
        </button>
      </div>
    </section>
  );
}
