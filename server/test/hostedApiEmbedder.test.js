import assert from "node:assert/strict";
import test from "node:test";
import { createHostedApiEmbedder } from "../services/embeddings/hostedApiEmbedder.js";

test("hosted embedder sends the expected request and normalizes the response", async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      async json() {
        return { data: [{ embedding: [3, 4] }] };
      },
    };
  };

  try {
    const embedder = createHostedApiEmbedder({
      url: "https://embedder.test/v1/embeddings",
      apiKey: "test-key",
      model: "test-model",
      dimension: 2,
    });
    const vector = await embedder.embed("A test title");

    assert.equal(request.url, "https://embedder.test/v1/embeddings");
    assert.equal(request.options.headers.Authorization, "Bearer test-key");
    assert.deepEqual(JSON.parse(request.options.body), {
      input: "A test title",
      model: "test-model",
    });
    assert.ok(Math.abs(vector[0] - 0.6) < 0.000001);
    assert.ok(Math.abs(vector[1] - 0.8) < 0.000001);
  } finally {
    global.fetch = originalFetch;
  }
});
