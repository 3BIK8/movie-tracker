import {
  TMDB_URL,
  TMDB_TIMEOUT_MS,
  TMDB_MAX_ATTEMPTS,
} from "../config/tmdb.js";
import {
  recordTmdbRequestEnd,
  recordTmdbRequestStart,
  recordTmdbRetry,
} from "./tmdbMetrics.js";

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

function getRetryAfterMilliseconds(response) {
  const value = response.headers.get("retry-after");

  if (!value) {
    return null;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(value);

  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

function getBackoffMilliseconds(attempt) {
  const base = 250 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 100);
  return base + jitter;
}

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
    const requestMetrics = recordTmdbRequestStart(endpoint);

    try {
      const response = await fetchWithTimeout(`${TMDB_URL}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${process.env.TMDB_TOKEN}`,
          accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        recordTmdbRequestEnd(requestMetrics, {
          success: true,
          durationMs: performance.now() - requestMetrics.startedAt,
        });
        return data;
      }

      const retryable =
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;

      lastError = new TmdbRequestError(
        `TMDB responded with ${response.status}`,
        {
          status: response.status,
          retryable,
        },
      );

      recordTmdbRequestEnd(requestMetrics, {
        success: false,
        durationMs: performance.now() - requestMetrics.startedAt,
      });

      if (!retryable) {
        throw lastError;
      }

      const retryAfter =
        response.status === 429
          ? getRetryAfterMilliseconds(response)
          : null;

      if (attempt < TMDB_MAX_ATTEMPTS) {
        recordTmdbRetry();
        await delay(retryAfter ?? getBackoffMilliseconds(attempt));
      }
    } catch (error) {
      if (!(error instanceof TmdbRequestError)) {
        recordTmdbRequestEnd(requestMetrics, {
          success: false,
          durationMs: performance.now() - requestMetrics.startedAt,
        });
      }

      if (error instanceof TmdbRequestError && !error.retryable) {
        throw error;
      }

      lastError = new TmdbRequestError("TMDB request failed", {
        retryable: true,
        cause: error,
      });

      if (attempt < TMDB_MAX_ATTEMPTS) {
        recordTmdbRetry();
        await delay(getBackoffMilliseconds(attempt));
      }
    }
  }

  throw lastError;
}
