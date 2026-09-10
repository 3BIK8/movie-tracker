import test from "node:test";
import assert from "node:assert/strict";
import { tmdbFetch, TmdbRequestError } from "../utils/tmdbClient.js";

test("tmdbFetch retries 429 responses using Retry-After", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TMDB_TOKEN;
  let calls = 0;

  process.env.TMDB_TOKEN = "test-token";
  globalThis.fetch = async () => {
    calls += 1;

    if (calls === 1) {
      return new Response(JSON.stringify({ error: "rate limited" }), {
        status: 429,
        headers: { "retry-after": "0" },
      });
    }

    return new Response(JSON.stringify({ id: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await tmdbFetch("/movie/1");
    assert.deepEqual(result, { id: 1 });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;

    if (originalToken === undefined) {
      delete process.env.TMDB_TOKEN;
    } else {
      process.env.TMDB_TOKEN = originalToken;
    }
  }
});

test("tmdbFetch does not retry non-retryable client errors", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.TMDB_TOKEN;
  let calls = 0;

  process.env.TMDB_TOKEN = "test-token";
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("bad request", { status: 400 });
  };

  try {
    await assert.rejects(
      () => tmdbFetch("/movie/invalid"),
      (error) => {
        assert.ok(error instanceof TmdbRequestError);
        assert.equal(error.status, 400);
        assert.equal(error.retryable, false);
        return true;
      },
    );

    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;

    if (originalToken === undefined) {
      delete process.env.TMDB_TOKEN;
    } else {
      process.env.TMDB_TOKEN = originalToken;
    }
  }
});
