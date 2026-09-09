import { TmdbRequestError } from "./tmdbClient.js";

export function sendTmdbError(res, error, fallbackMessage) {
  const isUnavailable = error instanceof TmdbRequestError && error.retryable;

  const status = isUnavailable ? 503 : 502;

  console.error(error);

  res.status(status).json({
    message: isUnavailable
      ? "TMDB is temporarily unavailable. Please try again."
      : fallbackMessage,
  });
}
