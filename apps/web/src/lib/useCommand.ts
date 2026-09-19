import { useCallback, useRef, useState } from "react";
import { ApiCallError, errorCopy } from "./api";

export type CommandStatus = "idle" | "pending" | "ok" | "failed" | "unknown";
type Attempt = { key: string; fn: (key: string) => Promise<unknown> };
/** Lost responses retain the exact closure/body and key. New commands cannot replace them. */
export const useCommand = () => {
  const [status, setStatus] = useState<CommandStatus>("idle");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const unresolved = useRef<Attempt | null>(null);
  const busy = useRef(false);
  const execute = useCallback(
    async <T>(attempt: Attempt): Promise<T | null> => {
      if (busy.current) return null;
      busy.current = true;
      unresolved.current = attempt;
      setStatus("pending");
      setMessage("");
      setCode(null);
      try {
        const result = await attempt.fn(attempt.key);
        unresolved.current = null;
        setStatus("ok");
        return result as T;
      } catch (cause) {
        const unknown =
          cause instanceof ApiCallError && cause.code === "NETWORK";
        if (!unknown) unresolved.current = null;
        setStatus(unknown ? "unknown" : "failed");
        setCode(cause instanceof ApiCallError ? cause.code : null);
        setMessage(
          unknown
            ? "Outcome unknown. Retry the original request to check whether the server applied it."
            : errorCopy(cause),
        );
        return null;
      } finally {
        busy.current = false;
      }
    },
    [],
  );
  const run = useCallback(
    async <T>(
      _intent: string,
      fn: (key: string) => Promise<T>,
    ): Promise<T | null> => {
      if (unresolved.current) return null;
      return execute<T>({ key: crypto.randomUUID(), fn });
    },
    [execute],
  );
  return {
    status,
    message,
    code,
    run,
    retry: async <T>(): Promise<T | null> =>
      unresolved.current ? execute<T>(unresolved.current) : null,
    reset: () => {
      if (!unresolved.current) {
        setStatus("idle");
        setMessage("");
        setCode(null);
      }
    },
  };
};
