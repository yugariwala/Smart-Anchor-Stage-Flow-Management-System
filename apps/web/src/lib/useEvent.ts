import { useCallback, useEffect, useState } from "react";
import { errorCopy, getEvent, type EventEnvelope } from "./api";
export const useEvent = (eventId: string) => {
  const [data, setData] = useState<EventEnvelope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getEvent(eventId));
    } catch (cause) {
      setError(errorCopy(cause));
    } finally {
      setLoading(false);
    }
  }, [eventId]);
  useEffect(() => {
    // Synchronize this route with its external owner envelope.
    // oxlint-disable-next-line react/set-state-in-effect
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
};
