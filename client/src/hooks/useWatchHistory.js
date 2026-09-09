import { useCallback, useEffect, useState } from "react";
import {
  getWatchHistory,
  WATCH_HISTORY_UPDATED,
} from "../services/watchlist";

/** Keeps library views in sync with changes made from any media card. */
export function useWatchHistory() {
  const [history, setHistory] = useState(getWatchHistory);

  const refresh = useCallback(() => {
    setHistory(getWatchHistory());
  }, []);

  useEffect(() => {
    window.addEventListener(WATCH_HISTORY_UPDATED, refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener(WATCH_HISTORY_UPDATED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);

  return { history, refresh };
}
