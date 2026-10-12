import {
  getMediaEmbedding,
  listMediaEmbeddingInputs,
  upsertMediaEmbedding,
} from "../../repositories/embeddingRepository.js";
import { assertEmbedding, normalizeEmbedding } from "./embedder.js";
import { buildEmbeddingText, hashEmbeddingText } from "./embeddingText.js";

export async function backfillEmbeddings({
  embedder,
  batchSize = 25,
  logger = console,
} = {}) {
  if (!embedder?.embed || !embedder.model || !Number.isInteger(embedder.dimension)) {
    throw new TypeError("A valid embedder is required.");
  }

  const rows = listMediaEmbeddingInputs();
  let embedded = 0;
  let skipped = 0;
  const startedAt = Date.now();

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    for (const row of batch) {
      const text = buildEmbeddingText(row);
      const textHash = hashEmbeddingText(text);
      const existing = getMediaEmbedding(row.type, row.id, embedder.model);
      if (existing?.textHash === textHash && existing.vector.length === embedder.dimension) {
        skipped += 1;
        continue;
      }

      const vector = normalizeEmbedding(
        assertEmbedding(await embedder.embed(text), embedder.dimension),
      );
      upsertMediaEmbedding({
        type: row.type,
        id: row.id,
        model: embedder.model,
        dimension: embedder.dimension,
        vector,
        textHash,
      });
      embedded += 1;
    }
    logger.info?.(`Embedding progress: ${Math.min(index + batch.length, rows.length)}/${rows.length}`);
  }

  return {
    total: rows.length,
    embedded,
    skipped,
    elapsedMs: Date.now() - startedAt,
    throughputPerSecond: (embedded / Math.max(Date.now() - startedAt, 1)) * 1000,
  };
}
