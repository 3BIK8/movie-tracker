import test from "node:test";
import assert from "node:assert/strict";

import app from "../app.js";

async function withServer(run) {
  const server = app.listen(0);

  try {
    const { port } = server.address();
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("recommendation analyze rejects malformed history with HTTP 400", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recommendations/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history: [{ type: "movie", id: "invalid" }] }),
    });

    assert.equal(response.status, 400);

    const body = await response.json();
    assert.match(body.message, /Invalid watch-history item at index 0/);
  });
});

test("recommendation network rejects malformed history with HTTP 400", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/recommendations/network`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history: [{ type: "person", id: 123 }] }),
    });

    assert.equal(response.status, 400);

    const body = await response.json();
    assert.match(body.message, /Unsupported media type/);
  });
});
