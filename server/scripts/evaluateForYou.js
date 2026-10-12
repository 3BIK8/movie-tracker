import "dotenv/config";
import { db } from "../db/database.js";
import { listMediaEmbeddings } from "../repositories/embeddingRepository.js";
import { rebuildLongUserVector } from "../services/recommendations/userVectorService.js";
import {
  buildInterestVectors,
  assignEmbeddingClusters,
  cosineSimilarity,
  generateEmbeddingCandidates,
} from "../services/forYou/forYouCandidateService.js";
import { diversifyWithEmbeddingMmr, scoreForYouCandidates } from "../services/forYou/forYouRanker.js";
import { tmdbFetch } from "../utils/tmdbClient.js";

const model = process.env.EMBEDDER_MODEL || "Xenova/all-MiniLM-L6-v2";
const userId = Number(process.env.EVALUATION_USER_ID || 1);
const minimumSimilarity = Number(process.env.FOR_YOU_MIN_SIMILARITY || 0.3);
const tmdbSeedLimit = Number(process.env.FOR_YOU_TMDB_SEED_LIMIT || 4);
const embeddings = assignEmbeddingClusters(listMediaEmbeddings(model));
const embeddingByKey = new Map(embeddings.map((item) => [`${item.type}:${item.id}`, item]));
const libraryRows = db.prepare(`
  SELECT w.media_type AS type, w.tmdb_id AS id, m.title, w.status, w.rating, w.last_interacted_at
  FROM watch_entries w
  JOIN media m ON m.media_type = w.media_type AND m.tmdb_id = w.tmdb_id
  WHERE w.user_id = ?
  ORDER BY w.last_interacted_at DESC
`).all(userId);
const libraryKeys = new Set(libraryRows.map((row) => `${row.type}:${row.id}`));
const libraryEmbeddings = libraryRows
  .map((row) => ({ ...row, embedding: embeddingByKey.get(`${row.type}:${row.id}`) }))
  .filter((row) => row.embedding);
const long = rebuildLongUserVector(userId, model);
const positiveRows = libraryRows.filter((row) => ["watched", "to_watch"].includes(row.status));
const positiveKeys = new Set(positiveRows.map((row) => `${row.type}:${row.id}`));
const interest = buildInterestVectors(
  embeddings.filter((item) => positiveKeys.has(`${item.type}:${item.id}`)).map((item) => item.vector),
  4,
);
const queryVectors = [long?.vector, ...interest].filter(Boolean);

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return { min: 0, median: 0, max: 0, stddev: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  return {
    min: Number(sorted[0].toFixed(4)),
    median: Number((sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2).toFixed(4)),
    max: Number(sorted.at(-1).toFixed(4)),
    stddev: Number(Math.sqrt(variance).toFixed(4)),
  };
}

function topLibraryNeighbors(candidate) {
  return libraryEmbeddings
    .map((row) => ({
      title: row.title || `${row.type}:${row.id}`,
      type: row.type,
      id: row.id,
      similarity: cosineSimilarity(candidate.vector, row.embedding.vector),
    }))
    .filter((neighbor) => neighbor.similarity !== null)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 3)
    .map((neighbor) => ({ ...neighbor, similarity: Number(neighbor.similarity.toFixed(4)) }));
}

async function fetchTmdbSeeds() {
  const seeds = positiveRows.slice(0, tmdbSeedLimit * 2);
  if (!process.env.TMDB_TOKEN) {
    console.log("TMDB seeding skipped: TMDB_TOKEN is not configured.");
    return [];
  }
  const related = [];
  for (const seed of seeds) {
    for (const endpoint of ["recommendations", "similar"]) {
      const path = `/${seed.type}/${seed.id}/${endpoint}`;
      console.log(`TMDB seed request: ${path}`);
      try {
        const response = await tmdbFetch(path);
        for (const item of response.results || []) {
          const key = `${seed.type}:${item.id}`;
          if (embeddingByKey.has(key) && !libraryKeys.has(key)) {
            related.push({
              key,
              source: `tmdb_${endpoint}`,
              seedTitle: seed.title,
            });
          }
        }
      } catch (error) {
        console.warn(`TMDB seed failed for ${path}: ${error.message}`);
      }
    }
  }
  return related;
}

const candidates = generateEmbeddingCandidates({
  embeddings,
  queryVectors,
  libraryKeys,
  limit: 250,
  minimumSimilarity,
});
const tmdbSeeds = await fetchTmdbSeeds();
const sourceByKey = new Map();
for (const seed of tmdbSeeds) {
  if (!sourceByKey.has(seed.key)) sourceByKey.set(seed.key, seed);
}
for (const candidate of candidates) {
  const seed = sourceByKey.get(`${candidate.type}:${candidate.id}`);
  if (seed) {
    candidate.source = seed.source;
    candidate.seedTitle = seed.seedTitle;
  }
}

const fullRanked = scoreForYouCandidates(candidates, {
  longVector: long?.vector,
  interestVectors: interest,
});
const scoreValues = fullRanked.map((item) => item.score);
const top50 = fullRanked.slice(0, 50).map((item) => item.score);
const candidateSourceMix = Object.fromEntries(
  [...new Set(fullRanked.map((item) => item.source))].map((source) => [
    source,
    fullRanked.filter((item) => item.source === source).length,
  ]),
);
const movieShare = libraryRows.length
  ? libraryRows.filter((row) => row.type === "movie").length / libraryRows.length
  : 0.5;
const ranked = diversifyWithEmbeddingMmr(
  fullRanked,
  20,
  0.72,
  { movieShare },
);

console.log(JSON.stringify({
  library: {
    total: libraryRows.length,
    movies: libraryRows.filter((row) => row.type === "movie").length,
    tv: libraryRows.filter((row) => row.type === "tv").length,
    movieShare: Number(movieShare.toFixed(4)),
    tvShare: Number((1 - movieShare).toFixed(4)),
  },
  configuration: { minimumSimilarity, tmdbSeedLimit },
  tmdb: {
    seedCount: tmdbSeeds.length,
    sourceMix: Object.fromEntries(
      [...new Set(tmdbSeeds.map((item) => item.source))].map((source) => [
        source,
        tmdbSeeds.filter((item) => item.source === source).length,
      ]),
    ),
  },
  scoreDistribution: {
    fullCandidatePool: stats(scoreValues),
    top50: stats(top50),
    top50Spread: top50.length ? Number((Math.max(...top50) - Math.min(...top50)).toFixed(4)) : 0,
  },
  candidateSourceMix,
  results: ranked.map((item) => ({
    rank: item.rank,
    type: item.type,
    id: item.id,
    title: embeddingByKey.get(`${item.type}:${item.id}`)?.title || item.title || `${item.type}:${item.id}`,
    source: item.source,
    seedTitle: item.seedTitle || null,
    score: Number(item.score.toFixed(4)),
    breakdown: Object.fromEntries(
      Object.entries(item.scoreBreakdown).map(([key, value]) => [key, Number(value.toFixed(4))]),
    ),
    libraryNeighbors: topLibraryNeighbors(item),
  })),
}, null, 2));
