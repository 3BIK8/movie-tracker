import { createMediaKey } from "../../utils/mediaIdentity.js";

export function cosineSimilarity(left, right) {
  if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || left.length !== right.length) {
    return null;
  }
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

function normalize(vector) {
  let norm = 0;
  for (const value of vector) norm += value * value;
  if (!norm) return vector;
  const scale = 1 / Math.sqrt(norm);
  for (let index = 0; index < vector.length; index += 1) vector[index] *= scale;
  return vector;
}

function meanVector(vectors) {
  if (!vectors.length) return null;
  const result = new Float32Array(vectors[0].length);
  for (const vector of vectors) {
    for (let index = 0; index < result.length; index += 1) result[index] += vector[index];
  }
  return normalize(result);
}

export function buildInterestVectors(vectors, requestedK = 4) {
  const valid = vectors.filter((vector) => vector instanceof Float32Array);
  if (!valid.length) return [];
  const k = Math.max(1, Math.min(requestedK, valid.length));
  const centers = valid.slice(0, k).map((vector) => Float32Array.from(vector));
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const groups = Array.from({ length: k }, () => []);
    for (const vector of valid) {
      let best = 0;
      let bestScore = -Infinity;
      centers.forEach((center, index) => {
        const score = cosineSimilarity(vector, center);
        if (score > bestScore) {
          best = index;
          bestScore = score;
        }
      });
      groups[best].push(vector);
    }
    groups.forEach((group, index) => {
      const center = meanVector(group);
      if (center) centers[index] = center;
    });
  }
  return centers;
}

export function assignEmbeddingClusters(embeddings, requestedK = 8) {
  if (!embeddings.length) return [];
  const k = Math.max(1, Math.min(requestedK, embeddings.length));
  const centers = embeddings.slice(0, k).map((item) => Float32Array.from(item.vector));
  const assignments = new Array(embeddings.length).fill(0);
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const groups = Array.from({ length: k }, () => []);
    embeddings.forEach((item, itemIndex) => {
      let best = 0;
      let bestScore = -Infinity;
      centers.forEach((center, clusterId) => {
        const score = cosineSimilarity(item.vector, center);
        if (score > bestScore) {
          best = clusterId;
          bestScore = score;
        }
      });
      assignments[itemIndex] = best;
      groups[best].push(item.vector);
    });
    groups.forEach((group, index) => {
      const center = meanVector(group);
      if (center) centers[index] = center;
    });
  }
  return embeddings.map((item, index) => ({ ...item, clusterId: assignments[index] }));
}

export function generateEmbeddingCandidates({
  embeddings,
  queryVectors,
  libraryKeys = new Set(),
  rejectionKeys = new Set(),
  limit = 200,
  minimumSimilarity = 0.3,
}) {
  const candidates = [];
  for (const candidate of embeddings) {
    const key = createMediaKey(candidate.type, candidate.id);
    if (libraryKeys.has(key) || rejectionKeys.has(key)) continue;
    const similarities = queryVectors
      .map((vector) => cosineSimilarity(vector, candidate.vector))
      .filter((score) => score !== null);
    if (!similarities.length) continue;
    const retrievalScore = Math.max(...similarities);
    if (retrievalScore < minimumSimilarity) continue;
    candidates.push({
      ...candidate,
      retrievalScore,
      source: "embedding_knn",
    });
  }
  return candidates.sort((left, right) => right.retrievalScore - left.retrievalScore).slice(0, limit);
}

export async function seedFromTmdbConnections({
  mediaType,
  seedIds,
  fetchRecommendations,
  fetchSimilar,
  limit = 100,
}) {
  const results = [];
  for (const id of seedIds) {
    const [recommendations, similar] = await Promise.all([
      fetchRecommendations(mediaType, id),
      fetchSimilar(mediaType, id),
    ]);
    for (const item of [...(recommendations || []), ...(similar || [])].slice(0, limit)) {
      results.push({ ...item, type: mediaType, source: "tmdb_related", seedId: String(id) });
    }
  }
  return results;
}
