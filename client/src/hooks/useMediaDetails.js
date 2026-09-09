import { useEffect, useState } from "react";
import { getMediaDetails } from "../services/api";

/**
 * Custom hook for loading media details
 * Only loads when explicitly triggered, not on mount
 */
export function useMediaDetails(type, id, shouldLoad = false) {
  const [details, setDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!shouldLoad || !id) return undefined;

    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await getMediaDetails(type, id);
        if (!cancelled) {
          setDetails(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [type, id, shouldLoad]);

  return { details, isLoading, error };
}
