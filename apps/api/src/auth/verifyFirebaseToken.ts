/**
 * Firebase ID token verification on the Worker (§15, §12).
 *
 * Verifies signature, `iss`, `aud`, `sub` and `exp`/`iat` against Google's public signing
 * keys. No Firebase Admin SDK, no service-account private key — a private key is not needed
 * merely to verify ID tokens through public signing keys.
 *
 * KEY CACHING: `createRemoteJWKSet` caches the key set according to Google's response cache
 * headers and reloads when a token presents an unknown `kid` (subject to its own cooldown,
 * so an attacker cannot use unknown `kid`s to hammer Google).
 *
 * TEST SEAM, NOT A BYPASS: the key resolver is a constructor argument. Production passes
 * `createRemoteJWKSet(GOOGLE_JWKS_URL)`; tests pass `createLocalJWKSet(locallyGeneratedJwks)`.
 * Either way the SAME `jwtVerify` runs with the SAME claim assertions and the SAME pinned
 * algorithm. There is no `APP_ENV` branch, no `skipVerify` flag, and no code path anywhere
 * in this file or its callers that accepts an unverified token.
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** Google's JWKS for Firebase ID tokens (RS256, rotated). */
export const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/** Firebase ID tokens are always RS256. Pinned so `alg` cannot be downgraded. */
const ALGORITHMS = ['RS256'] as const;

export type VerifiedIdentity = {
  /** The Firebase `sub` claim: the stable user id. */
  readonly uid: string;
};

export type TokenVerifier = {
  verify(token: string): Promise<VerifiedIdentity>;
};

export class TokenVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}

/**
 * @param projectId  The Firebase project id. It is both the expected `aud` and the suffix
 *                   of the expected `iss`.
 * @param getKey     A `jose` key resolver. Production: `remoteGoogleKeys()`.
 */
export function createTokenVerifier(projectId: string, getKey: JWTVerifyGetKey): TokenVerifier {
  if (projectId.length === 0) {
    throw new Error('createTokenVerifier: FIREBASE_PROJECT_ID is required');
  }
  const issuer = `https://securetoken.google.com/${projectId}`;

  return {
    async verify(token: string): Promise<VerifiedIdentity> {
      let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
      try {
        // Asserts signature, `iss`, `aud`, `exp` and `iat` (and `nbf` when present).
        ({ payload } = await jwtVerify(token, getKey, {
          issuer,
          audience: projectId,
          algorithms: [...ALGORITHMS],
          // Reject a token that simply omits a claim rather than treating it as absent.
          requiredClaims: ['iss', 'aud', 'sub', 'exp', 'iat'],
        }));
      } catch (cause) {
        // Never surface the token or the underlying crypto detail to the caller.
        throw new TokenVerificationError(
          cause instanceof Error ? `token rejected: ${cause.message}` : 'token rejected',
        );
      }

      // `sub` is the uid and must be a non-empty string. `jwtVerify` does not require it.
      const sub = payload.sub;
      if (typeof sub !== 'string' || sub.length === 0) {
        throw new TokenVerificationError('token rejected: missing or empty sub claim');
      }
      if (typeof payload.iat !== 'number') {
        throw new TokenVerificationError('token rejected: missing iat claim');
      }

      return { uid: sub };
    },
  };
}

/** The production key resolver. Constructed once per isolate so the cache is reused. */
export const remoteGoogleKeys = (): JWTVerifyGetKey =>
  createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
