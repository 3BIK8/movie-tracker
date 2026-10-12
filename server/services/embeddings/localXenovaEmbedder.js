import {
  assertEmbedding,
  DEFAULT_EMBEDDING_DIMENSION,
  DEFAULT_EMBEDDING_MODEL,
  normalizeEmbedding,
} from "./embedder.js";

let pipelinePromise;

async function getPipeline() {
  if (!pipelinePromise) {
    pipelinePromise = import("@xenova/transformers").then(({ pipeline }) =>
      pipeline("feature-extraction", DEFAULT_EMBEDDING_MODEL),
    );
  }
  return pipelinePromise;
}

export function createLocalXenovaEmbedder() {
  return {
    name: "local",
    model: DEFAULT_EMBEDDING_MODEL,
    dimension: DEFAULT_EMBEDDING_DIMENSION,
    async embed(text) {
      const extractor = await getPipeline();
      const output = await extractor(text, { pooling: "mean", normalize: false });
      const vector = Float32Array.from(output.data);
      return normalizeEmbedding(assertEmbedding(vector, DEFAULT_EMBEDDING_DIMENSION));
    },
  };
}
