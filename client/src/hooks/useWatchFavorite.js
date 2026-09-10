import { useCallback, useEffect, useState } from "react";
import {
  getWatchFavorite,
  setWatchFavorite,
  WATCH_HISTORY_UPDATED,
} from "../services/watchlist";

export function useWatchFavorite(item, type, metadata = null) {
  const readFavorite = useCallback(
    () => getWatchFavorite(type, item.id),
    [type, item.id],
  );

  const [favorite, setFavorite] = useState(readFavorite);

  useEffect(() => {
    const syncFavorite = () => setFavorite(readFavorite());
    window.addEventListener(WATCH_HISTORY_UPDATED, syncFavorite);
    return () => window.removeEventListener(WATCH_HISTORY_UPDATED, syncFavorite);
  }, [readFavorite]);

  const updateFavorite = useCallback(() => {
    setWatchFavorite(item, type, metadata || {});
  }, [item, type, metadata]);

  return {
    favorite,
    toggleFavorite: updateFavorite,
  };
}
