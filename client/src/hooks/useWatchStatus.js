import { useCallback, useEffect, useState } from "react";
import {
  getWatchHistory,
  setWatchStatus as setWatchStatusService,
  WATCH_HISTORY_UPDATED,
} from "../services/watchlist";

/**
 * Custom hook for managing watch status and persisting enriched media metadata.
 */
export function useWatchStatus(item, type, metadata = null) {
  const key = `${type}-${item.id}`;
  const readStatus = useCallback(
    () => getWatchHistory()[key]?.status || null,
    [key],
  );
  const [status, setStatus] = useState(readStatus);

  useEffect(() => {
    const syncStatus = () => setStatus(readStatus());
    window.addEventListener(WATCH_HISTORY_UPDATED, syncStatus);
    return () => window.removeEventListener(WATCH_HISTORY_UPDATED, syncStatus);
  }, [readStatus]);

  const updateStatus = useCallback(
    (newStatus) => {
      void setWatchStatusService(item, type, newStatus, metadata || {}).catch(
        (error) => console.error("Unable to persist watch status", error),
      );
    },
    [item, type, metadata],
  );

  return { status, setStatus: updateStatus };
}
