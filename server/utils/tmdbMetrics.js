const metrics = {
  requests: 0,
  successes: 0,
  failures: 0,
  retries: 0,
  totalMs: 0,
  byCategory: {},
};

function createCategory() {
  return {
    requests: 0,
    successes: 0,
    failures: 0,
    totalMs: 0,
  };
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

export function resetTmdbMetrics() {
  metrics.requests = 0;
  metrics.successes = 0;
  metrics.failures = 0;
  metrics.retries = 0;
  metrics.totalMs = 0;
  metrics.byCategory = {};
}

export function recordTmdbRequestStart(endpoint) {
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
  metrics.retries += 1;
}

export function getTmdbMetrics() {
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

export function snapshotTmdbMetrics() {
  return getTmdbMetrics();
}

export function diffTmdbMetrics(before, after) {
  const categories = new Set([
    ...Object.keys(before?.byCategory || {}),
    ...Object.keys(after?.byCategory || {}),
  ]);

  return {
    requests: (after?.requests || 0) - (before?.requests || 0),
    successes: (after?.successes || 0) - (before?.successes || 0),
    failures: (after?.failures || 0) - (before?.failures || 0),
    retries: (after?.retries || 0) - (before?.retries || 0),
    totalMs: (after?.totalMs || 0) - (before?.totalMs || 0),
    byCategory: Object.fromEntries(
      [...categories].map((category) => {
        const left = before?.byCategory?.[category] || {};
        const right = after?.byCategory?.[category] || {};
        return [
          category,
          {
            requests: (right.requests || 0) - (left.requests || 0),
            successes: (right.successes || 0) - (left.successes || 0),
            failures: (right.failures || 0) - (left.failures || 0),
            totalMs: (right.totalMs || 0) - (left.totalMs || 0),
          },
        ];
      }),
    ),
  };
}
