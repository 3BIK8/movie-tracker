import {
  TMDB_URL,
  TMDB_TIMEOUT_MS,
  TMDB_MAX_ATTEMPTS,
} from "../config/tmdb.js";

export class TmdbRequestError extends Error {
  constructor(message, { status, retryable = false, cause } = {}) {
    super(message, { cause });

    this.name = "TmdbRequestError";
    this.status = status;
    this.retryable = retryable;
  }
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, TMDB_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function tmdbFetch(endpoint) {
  if (!process.env.TMDB_TOKEN) {
    throw new TmdbRequestError("TMDB_TOKEN is not configured");
  }

  let lastError;

  for (let attempt = 1; attempt <= TMDB_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(`${TMDB_URL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${process.env.TMDB_TOKEN}`,
          accept: "application/json",
        },
      });

      if (response.ok) {
        return response.json();
      }

      const retryable = response.status >= 500;

      lastError = new TmdbRequestError(
        `TMDB responded with ${response.status}`,
        {
          status: response.status,
          retryable,
        },
      );

      if (!retryable) {
        throw lastError;
      }
    } catch (error) {
      if (error instanceof TmdbRequestError && !error.retryable) {
        throw error;
      }

      lastError = new TmdbRequestError("TMDB request failed", {
        retryable: true,
        cause: error,
      });
    }

    if (attempt < TMDB_MAX_ATTEMPTS) {
      await delay(300 * attempt);
    }
  }

  throw lastError;
}
