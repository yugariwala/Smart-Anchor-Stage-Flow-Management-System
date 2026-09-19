/**
 * Server-side Gemini adapter (§7B). One function, structured output, no SDK.
 *
 * A raw `fetch` rather than `@google/genai`: the Node-oriented SDK's Workers compatibility
 * would be a gamble, and the whole call is about twenty lines of REST.
 *
 * THE MODEL IS NOT AN AGENT. It receives facts as data and returns text. It has no tool, no
 * network, no `publish`, no `delete`. Every decision - whether to store, whether to publish,
 * which facts are real - is made by this server afterwards.
 *
 * The key lives only in a Worker secret. It is read from `env` at call time and never logged,
 * never returned, never placed in a URL.
 */

import { scriptDraftSchema, type Language, type ScriptKind } from '@cuepilot/domain';

import {
  buildUserContent,
  exceedsWordBudget,
  fabricatedFactIds,
  mentionsATime,
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
  TIME_IN_BODY_WARNING,
  type ScriptEnvelope,
} from './prompt';
import { templateDraft, type TemplateDraft } from './templates';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** §7C: one schema-repair retry inside a TOTAL 12-second budget, not 12 seconds each. */
export const TOTAL_DEADLINE_MS = 12_000;

export type DraftSource = 'gemini' | 'template';

export type DraftOutcome = {
  body: string;
  usedFactIds: string[];
  warnings: string[];
  source: DraftSource;
  /** The model that produced it, or null for a template. */
  model: string | null;
  /** Why the template was used. `null` when the model succeeded. */
  fallbackReason: string | null;
};

export type GeminiEnv = {
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL: string;
  AI_ENABLED: string;
};

/** Injectable so tests can drive the adapter without a network. Never a bypass of validation. */
export type FetchLike = typeof fetch;

const asTemplate = (envelope: ScriptEnvelope, reason: string): DraftOutcome => {
  const draft: TemplateDraft = templateDraft(envelope);
  return {
    body: draft.body,
    usedFactIds: draft.usedFactIds,
    warnings: draft.warnings,
    source: 'template',
    model: null,
    fallbackReason: reason,
  };
};

const callOnce = async (
  envelope: ScriptEnvelope,
  env: GeminiEnv,
  signal: AbortSignal,
  doFetch: FetchLike,
  repairNote: string | null,
): Promise<{ ok: true; raw: unknown } | { ok: false; reason: string }> => {
  const userText =
    repairNote === null
      ? buildUserContent(envelope)
      : `${buildUserContent(envelope)}\n\nYour previous reply was rejected: ${repairNote}\nReturn only JSON matching the schema.`;

  let response: Response;
  try {
    response = await doFetch(`${ENDPOINT}/${env.GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        // Header, never a query parameter: a key in a URL ends up in logs and proxies.
        'x-goog-api-key': env.GEMINI_API_KEY ?? '',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
        },
      }),
    });
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === 'AbortError';
    return { ok: false, reason: aborted ? 'provider timeout' : 'provider unreachable' };
  }

  if (!response.ok) {
    // Status only. A provider error body can echo the request and is never logged verbatim.
    return { ok: false, reason: `provider returned ${response.status}` };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: 'provider sent unreadable JSON' };
  }

  const text = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, reason: 'provider returned no candidate text' };
  }

  try {
    return { ok: true, raw: JSON.parse(text) };
  } catch {
    return { ok: false, reason: 'model output was not valid JSON' };
  }
};

/**
 * Produces a draft, always. Either the model succeeded and was validated, or a deterministic
 * template stands in - clearly labelled, never counted as an AI success.
 *
 * The caller is responsible for the quota reservation and the in-flight lease, and for the
 * fact that this runs OUTSIDE any transaction.
 */
export async function generateScriptDraft(
  envelope: ScriptEnvelope,
  env: GeminiEnv,
  doFetch: FetchLike = fetch,
): Promise<DraftOutcome> {
  if (env.AI_ENABLED !== 'true') {
    return asTemplate(envelope, 'AI_ENABLED is false');
  }
  if ((env.GEMINI_API_KEY ?? '').length === 0) {
    return asTemplate(envelope, 'no provider credential configured');
  }

  // One budget for BOTH attempts, so a slow first try cannot buy a second full timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOTAL_DEADLINE_MS);

  try {
    let repairNote: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await callOnce(envelope, env, controller.signal, doFetch, repairNote);
      if (!result.ok) {
        // A transport or provider failure is not repairable by re-prompting.
        return asTemplate(envelope, result.reason);
      }

      const parsed = scriptDraftSchema.safeParse(result.raw);
      if (!parsed.success) {
        repairNote = parsed.error.issues[0]?.message ?? 'output did not match the schema';
        continue;
      }

      const fabricated = fabricatedFactIds(parsed.data.usedFactIds, envelope.approvedFacts);
      if (fabricated.length > 0) {
        // §7B: a fabricated fact reference is a rejection, not a warning. The model is
        // claiming the server vouched for something it never supplied.
        repairNote = `usedFactIds referenced facts that were not supplied: ${fabricated.join(', ')}`;
        continue;
      }

      const warnings = [...parsed.data.warnings];
      if (mentionsATime(parsed.data.body)) warnings.push(TIME_IN_BODY_WARNING);
      if (exceedsWordBudget(parsed.data.body, envelope.maxWords)) {
        warnings.push(`This draft is longer than the ${envelope.maxWords}-word guidance.`);
      }

      return {
        body: parsed.data.body,
        usedFactIds: parsed.data.usedFactIds,
        warnings: warnings.slice(0, 10),
        source: 'gemini',
        model: env.GEMINI_MODEL,
        fallbackReason: null,
      };
    }

    return asTemplate(envelope, repairNote ?? 'model output failed validation twice');
  } finally {
    clearTimeout(timer);
  }
}

/** Convenience for the smoke script and tests. */
export type { Language, ScriptKind };
