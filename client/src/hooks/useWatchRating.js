import { useCallback, useEffect, useState } from "react";
import {
  getWatchRating,
  setWatchRating,
  WATCH_HISTORY_UPDATED,
} from "../services/watchlist";

export function useWatchRating(type, id, status) {
  const readRating = useCallback(() => {
    if (status !== "watched") {
      return null;
    }

    return getWatchRating(type, id);
  }, [type, id, status]);

  const [rating, setRating] = useState(readRating);

  useEffect(() => {
    setRating(readRating());
  }, [readRating]);

  useEffect(() => {
    const syncRating = () => {
      setRating(readRating());
    };

    window.addEventListener(WATCH_HISTORY_UPDATED, syncRating);

    return () => window.removeEventListener(WATCH_HISTORY_UPDATED, syncRating);
  }, [readRating]);

  const updateRating = useCallback(
    (newRating) => {
      if (status !== "watched") {
        return;
      }

      void setWatchRating(type, id, newRating).catch((error) =>
        console.error("Unable to persist rating", error),
      );
    },
    [type, id, status],
  );

  return {
    rating,
    setRating: updateRating,
  };
}
