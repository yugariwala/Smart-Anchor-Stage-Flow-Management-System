/**
 * One mutation at a time, with no optimistic success.
 *
 * The idempotency key is minted once per INTENT and held until that intent succeeds or is
 * abandoned. §17: on a lost response, retry with the SAME key — never a new one, and never
 * treat an unresolved publish as successful. That is why `status` has an explicit `unknown`
 * state distinct from `failed`.
 */

import { useCallback, useRef, useState } from 'react';

import { ApiCallError, errorCopy } from './api';

export type CommandStatus = 'idle' | 'pending' | 'ok' | 'failed' | 'unknown';

export type Command = {
  status: CommandStatus;
  message: string;
  /** The error code, so callers can branch (e.g. offer "refresh" on REVISION_CONFLICT). */
  code: string | null;
  /** Runs `fn` with a stable idempotency key for this intent. */
  run: <T>(intent: string, fn: (idempotencyKey: string) => Promise<T>) => Promise<T | null>;
  reset: () => void;
};

export const useCommand = (): Command => {
  const [status, setStatus] = useState<CommandStatus>('idle');
  const [message, setMessage] = useState('');
  const [code, setCode] = useState<string | null>(null);
  /** intent -> key. Survives re-renders so a retry reuses the original key. */
  const keys = useRef<Map<string, string>>(new Map());

  const run = useCallback(
    async <T>(intent: string, fn: (idempotencyKey: string) => Promise<T>): Promise<T | null> => {
      let key = keys.current.get(intent);
      if (key === undefined) {
        key = crypto.randomUUID();
        keys.current.set(intent, key);
      }
      setStatus('pending');
      setMessage('');
      setCode(null);
      try {
        const result = await fn(key);
        // Only a confirmed server response clears the intent and its key.
        keys.current.delete(intent);
        setStatus('ok');
        return result;
      } catch (cause) {
        const isNetwork = cause instanceof ApiCallError && cause.code === 'NETWORK';
        // A transport failure leaves the outcome genuinely unknown: the request may have been
        // applied. The key is KEPT so a retry replays instead of double-applying.
        setStatus(isNetwork ? 'unknown' : 'failed');
        setCode(cause instanceof ApiCallError ? cause.code : null);
        setMessage(
          isNetwork
            ? 'Status unknown: the server could not be reached. Retrying is safe, it will not apply twice.'
            : errorCopy(cause),
        );
        if (!isNetwork) keys.current.delete(intent);
        return null;
      }
    },
    [],
  );

  return {
    status,
    message,
    code,
    run,
    reset: () => {
      setStatus('idle');
      setMessage('');
      setCode(null);
    },
  };
};
