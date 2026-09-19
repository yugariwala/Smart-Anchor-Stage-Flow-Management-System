/**
 * Manual smoke test for the real Gemini provider.
 *
 * Run it against a local `wrangler dev` that has GEMINI_API_KEY in `.dev.vars` and
 * AI_ENABLED=true. It drives the REAL endpoint, so it exercises the whole path: quota
 * admission, the in-flight lease, the §7B prompt, structured output, schema validation and
 * fact-reference checking.
 *
 *   npm run dev:api                       # in one terminal
 *   node apps/api/scripts/smoke-gemini.mjs # in another (see the .mjs sibling)
 *
 * §21: this is the evidence the AI claim rests on. Record the real result in
 * docs/measurements.md — including a failure, plainly, if that is what happens. Never
 * substitute a stubbed response and keep the claim.
 *
 * The key is never read by this script. It lives in the Worker's environment; the script
 * only sees whether a draft came back and what produced it.
 */

export const REQUIRED_KINDS = ['opening', 'introduction', 'transition', 'closing'] as const;

export type SmokeResult = {
  kind: (typeof REQUIRED_KINDS)[number];
  language: 'en' | 'hi' | 'gu';
  status: number;
  source: 'gemini' | 'template' | null;
  model: string | null;
  fallbackReason: string | null;
  schemaValid: boolean;
  usedFactIds: string[];
  warnings: string[];
  bodyPreview: string;
};

export const summarise = (results: readonly SmokeResult[]): string => {
  const real = results.filter((r) => r.source === 'gemini').length;
  return `${real} of ${results.length} drafts came from the model; ${results.length - real} fell back to a template.`;
};

throw new Error(
  'not implemented as a standalone runner: use apps/api/scripts/smoke-gemini.mjs, which drives the deployed or local Worker over HTTP.',
);
