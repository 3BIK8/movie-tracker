import { db } from "../../db/database.js";
import { cacheMediaMetadata } from "../../repositories/mediaMetadataRepository.js";
import { enqueueFeedItems, countAvailableFeedItems } from "../../repositories/feedRepository.js";
import { listMediaEmbeddings } from "../../repositories/embeddingRepository.js";
import { createConfiguredEmbedder } from "../embeddings/embedderFactory.js";
import { backfillEmbeddings } from "../embeddings/backfillEmbeddings.js";
import { normalizeMedia } from "../recommendations/mediaNormalizer.js";
import { rebuildLongUserVector } from "../recommendations/userVectorService.js";
import {
  buildInterestVectors,
  assignEmbeddingClusters,
  filterByAttributionSupport,
  generateEmbeddingCandidates,
} from "./forYouCandidateService.js";
import { FOR_YOU_RANK_CONFIG, diversifyWithEmbeddingMmr, scoreForYouCandidates } from "./forYouRanker.js";
import { tmdbFetch } from "../../utils/tmdbClient.js";

const refillLocks = new Set();
const REFILL_THRESHOLD = 40;
const SEED_LIMIT = 4;
const DETAIL_LIMIT = 40;

export async function refillForYouFeed(userId, { logger = console } = {}) {
  if (refillLocks.has(userId)) return { skipped: true, reason: "already_running" };
  refillLocks.add(userId);
  try {
    if (countAvailableFeedItems(userId) >= REFILL_THRESHOLD) return { skipped: true, reason: "threshold" };
    const seeds = db.prepare(`
      SELECT media_type AS type, tmdb_id AS id
      FROM watch_entries
      WHERE user_id = ? AND status IN ('watched', 'to_watch')
      ORDER BY last_interacted_at DESC
      LIMIT ?
    `).all(userId, SEED_LIMIT);
    const libraryKeys = new Set(db.prepare(`
      SELECT media_type AS type, tmdb_id AS id FROM watch_entries WHERE user_id = ?
    `).all(userId).map((row) => `${row.type}:${row.id}`));
    const rejected = new Set(db.prepare(`
      SELECT media_type AS type, tmdb_id AS id FROM rejections WHERE user_id = ?
    `).all(userId).map((row) => `${row.type}:${row.id}`));
    const related = new Map();
    let tmdbCalls = 0;
    for (const seed of seeds) {
      for (const endpoint of ["recommendations", "similar"]) {
        const path = `/${seed.type}/${seed.id}/${endpoint}`;
        logger.info?.(`For You refill TMDB request: ${path}`);
        tmdbCalls += 1;
        const response = await tmdbFetch(path);
        for (const item of (response.results || []).slice(0, 20)) {
          const key = `${seed.type}:${item.id}`;
          if (!libraryKeys.has(key) && !rejected.has(key)) {
            related.set(key, { ...item, type: seed.type, source: `tmdb_${endpoint}` });
          }
        }
      }
    }
    const detailItems = [...related.values()].slice(0, DETAIL_LIMIT);
    const persistedKeys = [];
    for (const item of detailItems) {
      const path = `/${item.type}/${item.id}?append_to_response=credits,keywords`;
      logger.info?.(`For You refill metadata request: ${path}`);
      const metadata = normalizeMedia(await tmdbFetch(path), item.type);
      cacheMediaMetadata(metadata);
      persistedKeys.push({ type: metadata.type, id: metadata.id });
    }
    if (!persistedKeys.length) return { tmdbCalls, persisted: 0, embedded: 0, enqueued: 0 };
    const embeddingResult = await backfillEmbeddings({
      embedder: createConfiguredEmbedder(),
      mediaKeys: persistedKeys,
      logger,
    });
    const model = process.env.EMBEDDER_MODEL || "Xenova/all-MiniLM-L6-v2";
    const embeddings = assignEmbeddingClusters(listMediaEmbeddings(model));
    const libraryEmbeddings = embeddings.filter((item) => libraryKeys.has(`${item.type}:${item.id}`));
    const libraryPositive = new Set(seeds.map((seed) => `${seed.type}:${seed.id}`));
    const interest = buildInterestVectors(
      libraryEmbeddings.filter((item) => libraryPositive.has(`${item.type}:${item.id}`)).map((item) => item.vector),
      4,
    );
    const long = rebuildLongUserVector(userId, model);
    let candidates = generateEmbeddingCandidates({
      embeddings,
      queryVectors: [long?.vector, ...interest].filter(Boolean),
      libraryKeys,
      rejectionKeys: rejected,
      limit: 250,
      minimumSimilarity: FOR_YOU_RANK_CONFIG.minimumSimilarity,
    });
    candidates = filterByAttributionSupport(candidates, libraryEmbeddings, { minimumSimilarity: 0.5, minimumNeighbors: 2 });
    const sourceByKey = new Map([...related.values()].map((item) => [`${item.type}:${item.id}`, item.source]));
    const ranked = diversifyWithEmbeddingMmr(scoreForYouCandidates(candidates, {
      longVector: long?.vector,
      interestVectors: interest,
    }), 20, 0.72, { movieShare: 0.84 });
    const enqueued = enqueueFeedItems(userId, ranked.map((item) => ({
      ...item,
      source: sourceByKey.get(`${item.type}:${item.id}`) || item.source,
      features: { scoreBreakdown: item.scoreBreakdown, attributionCount: libraryEmbeddings.filter((lib) => {
        const score = lib.vector.reduce((sum, value, index) => sum + value * item.vector[index], 0);
        return score >= 0.5;
      }).length },
    })));
    return { tmdbCalls, discovered: related.size, persisted: persistedKeys.length, embedded: embeddingResult.embedded, enqueued };
  } finally {
    refillLocks.delete(userId);
  }
}
