import "dotenv/config";
import { db } from "../db/database.js";
import { listMediaEmbeddings } from "../repositories/embeddingRepository.js";
import { rebuildLongUserVector } from "../services/recommendations/userVectorService.js";
import {
  buildInterestVectors,
  assignEmbeddingClusters,
  cosineSimilarity,
  filterByMinimumAttribution,
  generateEmbeddingCandidates,
} from "../services/forYou/forYouCandidateService.js";
import { diversifyWithEmbeddingMmr, scoreForYouCandidates } from "../services/forYou/forYouRanker.js";
import { tmdbFetch } from "../utils/tmdbClient.js";

const model = process.env.EMBEDDER_MODEL || "Xenova/all-MiniLM-L6-v2";
const userId = Number(process.env.EVALUATION_USER_ID || 1);
const minimumSimilarity = Number(process.env.FOR_YOU_MIN_SIMILARITY || 0.3);
const minimumAttribution = Number(process.env.FOR_YOU_MIN_ATTRIBUTION || 0.5);
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
  .filter((row) => row.embedding)
  .map((row) => ({ ...row, vector: row.embedding.vector }));
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
      similarity: cosineSimilarity(candidate.vector, row.vector),
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
          if (!libraryKeys.has(key)) {
            related.push({ key, source: `tmdb_${endpoint}`, seedTitle: seed.title });
          }
        }
      } catch (error) {
        console.warn(`TMDB seed failed for ${path}: ${error.message}`);
      }
    }
  }
  return related;
}

function sourceMapFor(seeds) {
  const map = new Map();
  for (const seed of seeds) {
    if (!map.has(seed.key)) map.set(seed.key, seed);
  }
  return map;
}

function formatCandidate(item) {
  return {
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
  };
}

function evaluateProfile({ name, minimumSimilarityFloor, weights, sourceMap }) {
  let candidates = generateEmbeddingCandidates({
    embeddings,
    queryVectors,
    libraryKeys,
    limit: 250,
    minimumSimilarity: minimumSimilarityFloor,
  });
  candidates = filterByMinimumAttribution(candidates, libraryEmbeddings, minimumAttribution);
  candidates = candidates.map((candidate) => {
    const seed = sourceMap.get(`${candidate.type}:${candidate.id}`);
    return seed ? { ...candidate, source: seed.source, seedTitle: seed.seedTitle } : candidate;
  });
  const fullRanked = scoreForYouCandidates(candidates, {
    longVector: long?.vector,
    interestVectors: interest,
    weights,
  });
  const scores = fullRanked.map((item) => item.score);
  const top50 = scores.slice(0, 50);
  const movieShare = libraryRows.length
    ? libraryRows.filter((row) => row.type === "movie").length / libraryRows.length
    : 0.5;
  const ranked = diversifyWithEmbeddingMmr(fullRanked, 20, 0.72, { movieShare });
  return {
    name,
    minimumSimilarityFloor,
    candidateCount: fullRanked.length,
    scoreDistribution: {
      fullCandidatePool: stats(scores),
      top50: stats(top50),
      top50Spread: top50.length ? Number((Math.max(...top50) - Math.min(...top50)).toFixed(4)) : 0,
    },
    sourceMix: Object.fromEntries(
      [...new Set(fullRanked.map((item) => item.source))].map((source) => [
        source,
        fullRanked.filter((item) => item.source === source).length,
      ]),
    ),
    results: ranked.map(formatCandidate),
  };
}

const tmdbSeeds = await fetchTmdbSeeds();
const sourceMap = sourceMapFor(tmdbSeeds);
const baseline = evaluateProfile({
  name: "current",
  minimumSimilarityFloor: minimumSimilarity,
  weights: undefined,
  sourceMap,
});
const experiment = evaluateProfile({
  name: "floor_0.40_quality_0",
  minimumSimilarityFloor: 0.4,
  weights: {
    longWeight: 0.55,
    interestWeight: 0.35,
    sessionWeight: 0.1,
    qualityWeight: 0,
    negativeWeight: 0.2,
    fatigueWeight: 0.08,
  },
  sourceMap,
});

console.log(JSON.stringify({
  library: {
    total: libraryRows.length,
    movies: libraryRows.filter((row) => row.type === "movie").length,
    tv: libraryRows.filter((row) => row.type === "tv").length,
    movieShare: Number((libraryRows.filter((row) => row.type === "movie").length / Math.max(libraryRows.length, 1)).toFixed(4)),
  },
  configuration: { minimumAttribution, tmdbSeedLimit },
  tmdb: {
    seedCount: tmdbSeeds.length,
    uniqueCandidates: new Set(tmdbSeeds.map((item) => item.key)).size,
    uniqueEmbeddableCandidates: new Set(
      tmdbSeeds.filter((item) => embeddingByKey.has(item.key)).map((item) => item.key),
    ).size,
    sourceMix: Object.fromEntries(
      [...new Set(tmdbSeeds.map((item) => item.source))].map((source) => [
        source,
        tmdbSeeds.filter((item) => item.source === source).length,
      ]),
    ),
  },
  profiles: { baseline, experiment },
}, null, 2));
