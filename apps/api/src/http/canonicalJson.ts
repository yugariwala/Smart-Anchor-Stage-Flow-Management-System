/**
 * Canonical request hashing for the idempotency ledger (§12).
 *
 * "Hash canonical JSON with sorted object keys plus method and path."
 *
 * `crypto.subtle.digest` is ASYNC, so this must run BEFORE `transactionSync` opens — the
 * transaction callback has to be synchronous. That constraint is what makes "no external
 * network call inside a transaction" structurally impossible rather than a convention.
 */

/** JSON with every object's keys sorted, recursively. Arrays keep their order. */
export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
};

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const sha256Hex = async (input: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));

/** The ledger's `request_hash`: method, path and canonical body, unambiguously delimited. */
export const requestHash = async (
  method: string,
  path: string,
  body: unknown,
): Promise<string> => sha256Hex(`${method}\n${path}\n${canonicalJson(body)}`);
