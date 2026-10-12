import { db } from "../db/database.js";
import { listMediaEmbeddings } from "../repositories/embeddingRepository.js";
import { rebuildLongUserVector } from "../services/recommendations/userVectorService.js";
import {
  buildInterestVectors,
  assignEmbeddingClusters,
  generateEmbeddingCandidates,
} from "../services/forYou/forYouCandidateService.js";
import { diversifyWithEmbeddingMmr, scoreForYouCandidates } from "../services/forYou/forYouRanker.js";

const model = process.env.EMBEDDER_MODEL || "Xenova/all-MiniLM-L6-v2";
const userId = Number(process.env.EVALUATION_USER_ID || 1);
const embeddings = assignEmbeddingClusters(listMediaEmbeddings(model));
const libraryRows = db.prepare(`
  SELECT media_type AS type, tmdb_id AS id, status, rating
  FROM watch_entries WHERE user_id = ?
`).all(userId);
const libraryKeys = new Set(libraryRows.map((row) => `${row.type}:${row.id}`));
const long = rebuildLongUserVector(userId, model);
const positiveKeys = new Set(
  libraryRows.filter((row) => row.status === "watched").map((row) => `${row.type}:${row.id}`),
);
const interest = buildInterestVectors(
  embeddings.filter((item) => positiveKeys.has(`${item.type}:${item.id}`)).map((item) => item.vector),
  4,
);
const candidates = generateEmbeddingCandidates({
  embeddings,
  queryVectors: [long?.vector, ...interest].filter(Boolean),
  libraryKeys,
  limit: 250,
});
const metadataByKey = new Map(embeddings.map((item) => [`${item.type}:${item.id}`, item]));
const ranked = diversifyWithEmbeddingMmr(
  scoreForYouCandidates(candidates, { longVector: long?.vector, interestVectors: interest }),
  20,
);

console.log(JSON.stringify(ranked.map((item) => ({
  rank: item.rank,
  type: item.type,
  id: item.id,
  title: metadataByKey.get(`${item.type}:${item.id}`)?.title || item.title,
  source: item.source,
  score: Number(item.score.toFixed(4)),
  breakdown: Object.fromEntries(Object.entries(item.scoreBreakdown).map(([key, value]) => [key, Number(value.toFixed(4))])),
})), null, 2));
