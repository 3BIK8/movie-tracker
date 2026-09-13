import test from "node:test";
import assert from "node:assert/strict";
import {
  getTmdbMetrics,
  recordTmdbRequestEnd,
  recordTmdbRequestStart,
  recordTmdbRetry,
  runWithTmdbMetrics,
} from "./tmdbMetrics.js";

test("scopes TMDB metrics to the active async context", async () => {
  const result = await runWithTmdbMetrics(async () => {
    const request = recordTmdbRequestStart("/person/123/movie_credits");
    recordTmdbRequestEnd(request, { success: true, durationMs: 12 });
    recordTmdbRetry();

    return getTmdbMetrics();
  });

  assert.equal(result.requests, 1);
  assert.equal(result.successes, 1);
  assert.equal(result.retries, 1);
  assert.equal(result.totalMs, 12);
  assert.deepEqual(result.byCategory.personCredits, {
    requests: 1,
    successes: 1,
    failures: 0,
    totalMs: 12,
  });
});

test("keeps concurrent metric contexts isolated", async () => {
  const [first, second] = await Promise.all([
    runWithTmdbMetrics(async () => {
      const request = recordTmdbRequestStart("/discover/movie?page=1");
      await Promise.resolve();
      recordTmdbRequestEnd(request, { success: true, durationMs: 5 });
      return getTmdbMetrics();
    }),
    runWithTmdbMetrics(async () => {
      const request = recordTmdbRequestStart("/movie/123?append_to_response=credits");
      await Promise.resolve();
      recordTmdbRequestEnd(request, { success: true, durationMs: 7 });
      return getTmdbMetrics();
    }),
  ]);

  assert.equal(first.requests, 1);
  assert.equal(first.byCategory.discover.requests, 1);
  assert.equal(first.byCategory.metadata, undefined);

  assert.equal(second.requests, 1);
  assert.equal(second.byCategory.metadata.requests, 1);
  assert.equal(second.byCategory.discover, undefined);
});
