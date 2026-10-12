import "dotenv/config";
import { db } from "../db/database.js";
import { cacheMediaMetadata } from "../repositories/mediaMetadataRepository.js";
import { backfillEmbeddings } from "../services/embeddings/backfillEmbeddings.js";
import { createConfiguredEmbedder } from "../services/embeddings/embedderFactory.js";
import { normalizeMedia } from "../services/recommendations/mediaNormalizer.js";
import { tmdbFetch } from "../utils/tmdbClient.js";

const limit = Number(process.env.MEDIA_REPAIR_LIMIT || 100);
const rows = db.prepare(`
  SELECT media_type AS type, tmdb_id AS id
  FROM media
  WHERE TRIM(title) = ''
  ORDER BY media_type, tmdb_id
  LIMIT ?
`).all(limit);

let repaired = 0;
let failed = 0;
for (const row of rows) {
  const endpoint = `/${row.type}/${row.id}?append_to_response=credits,keywords`;
  console.log(`Metadata repair request: ${endpoint}`);
  try {
    const metadata = normalizeMedia(await tmdbFetch(endpoint), row.type);
    if (!metadata.title) {
      failed += 1;
      console.warn(`Metadata repair returned no title: ${row.type}:${row.id}`);
      continue;
    }
    cacheMediaMetadata(metadata);
    repaired += 1;
    console.log(`Metadata repaired: ${row.type}:${row.id} -> ${metadata.title}`);
  } catch (error) {
    failed += 1;
    console.warn(`Metadata repair failed for ${row.type}:${row.id}: ${error.message}`);
  }
}

const embeddingResult = await backfillEmbeddings({
  embedder: createConfiguredEmbedder(),
});

console.log(JSON.stringify({
  inspected: rows.length,
  repaired,
  failed,
  embeddings: embeddingResult,
}, null, 2));
