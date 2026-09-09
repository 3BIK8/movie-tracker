import { useCallback, useEffect, useState } from "react";
import {
  getWatchHistory,
  setWatchStatus as setWatchStatusService,
  WATCH_HISTORY_UPDATED,
} from "../services/watchlist";

/**
 * Custom hook for managing watch status
 */
export function useWatchStatus(item, type, details) {
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
      setWatchStatusService(item, type, newStatus);
    },
    [item, type],
  );

  return { status, setStatus: updateStatus };
}
