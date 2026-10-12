import {
  assertEmbedding,
  DEFAULT_EMBEDDING_DIMENSION,
  normalizeEmbedding,
} from "./embedder.js";

export function createHostedApiEmbedder({
  url = process.env.EMBEDDER_API_URL,
  apiKey = process.env.EMBEDDER_API_KEY,
  model = process.env.EMBEDDER_MODEL || "text-embedding-3-small",
  dimension = Number(process.env.EMBEDDER_DIMENSION || DEFAULT_EMBEDDING_DIMENSION),
} = {}) {
  if (!url) throw new Error("EMBEDDER_API_URL is required for the hosted embedder.");

  return {
    name: "hosted",
    model,
    dimension,
    async embed(text) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ input: text, model }),
      });
      if (!response.ok) {
        throw new Error(`Hosted embedder returned HTTP ${response.status}.`);
      }
      const payload = await response.json();
      const values = payload?.data?.[0]?.embedding || payload?.embedding;
      const vector = Float32Array.from(values || []);
      return normalizeEmbedding(assertEmbedding(vector, dimension));
    },
  };
}
