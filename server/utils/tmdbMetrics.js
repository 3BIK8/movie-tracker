import { AsyncLocalStorage } from "node:async_hooks";

const metricsStorage = new AsyncLocalStorage();

function createMetrics() {
  return {
    requests: 0,
    successes: 0,
    failures: 0,
    retries: 0,
    totalMs: 0,
    byCategory: {},
  };
}

function createCategory() {
  return {
    requests: 0,
    successes: 0,
    failures: 0,
    totalMs: 0,
  };
}

function getActiveMetrics() {
  return metricsStorage.getStore();
}

function classifyEndpoint(endpoint) {
  if (/^\/person\/\d+\/(movie|tv)_credits/.test(endpoint)) {
    return "personCredits";
  }

  if (/^\/discover\/(movie|tv)\?/.test(endpoint)) {
    return "discover";
  }

  if (/^\/collection\/\d+/.test(endpoint)) {
    return "collection";
  }

  if (/^\/(movie|tv)\/\d+\?/.test(endpoint)) {
    return "metadata";
  }

  return "other";
}

export async function runWithTmdbMetrics(callback) {
  return metricsStorage.run(createMetrics(), callback);
}

export function recordTmdbRequestStart(endpoint) {
  const metrics = getActiveMetrics();
  if (!metrics) return null;

  const category = classifyEndpoint(endpoint);
  const bucket = metrics.byCategory[category] || createCategory();
  bucket.requests += 1;
  metrics.byCategory[category] = bucket;
  metrics.requests += 1;

  return {
    category,
    startedAt: performance.now(),
  };
}

export function recordTmdbRequestEnd(context, { success, durationMs }) {
  const metrics = getActiveMetrics();
  if (!metrics || !context) return;

  const bucket = metrics.byCategory[context.category] || createCategory();
  bucket.totalMs += durationMs;

  if (success) {
    bucket.successes += 1;
    metrics.successes += 1;
  } else {
    bucket.failures += 1;
    metrics.failures += 1;
  }

  metrics.byCategory[context.category] = bucket;
  metrics.totalMs += durationMs;
}

export function recordTmdbRetry() {
  const metrics = getActiveMetrics();
  if (metrics) metrics.retries += 1;
}

export function getTmdbMetrics() {
  const metrics = getActiveMetrics() || createMetrics();

  return {
    requests: metrics.requests,
    successes: metrics.successes,
    failures: metrics.failures,
    retries: metrics.retries,
    totalMs: Math.round(metrics.totalMs),
    byCategory: Object.fromEntries(
      Object.entries(metrics.byCategory).map(([category, value]) => [
        category,
        {
          ...value,
          totalMs: Math.round(value.totalMs),
        },
      ]),
    ),
  };
}
