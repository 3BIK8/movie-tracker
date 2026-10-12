import { db } from "../../db/database.js";
import { getUserVector, upsertUserVector } from "../../repositories/userVectorRepository.js";
import {
  FOR_YOU_EVENT_WEIGHTS,
  FOR_YOU_RATING_WEIGHTS,
  FOR_YOU_STATUS_WEIGHTS,
  FOR_YOU_VECTOR_CONFIG,
} from "./forYouConfig.js";

function decodeVector(row) {
  return new Float32Array(
    row.vector.buffer,
    row.vector.byteOffset,
    row.vector.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
}

function addWeighted(target, source, weight) {
  for (let index = 0; index < target.length; index += 1) target[index] += source[index] * weight;
}

function normalize(vector) {
  let norm = 0;
  for (const value of vector) norm += value * value;
  if (!norm) return vector;
  const scale = 1 / Math.sqrt(norm);
  for (let index = 0; index < vector.length; index += 1) vector[index] *= scale;
  return vector;
}

function timeDecay(timestamp, halfLifeDays) {
  const ageDays = Math.max(0, (Date.now() - Date.parse(timestamp || "")) / 86_400_000);
  return Number.isFinite(ageDays) ? 2 ** (-ageDays / halfLifeDays) : 1;
}

function getDimension(model) {
  return db.prepare(`
    SELECT dim FROM media_embeddings WHERE model = ? LIMIT 1
  `).get(model)?.dim || null;
}

export function rebuildLongUserVector(userId, model) {
  const dimension = getDimension(model);
  if (!dimension) return null;
  const vector = new Float32Array(dimension);
  let updates = 0;
  const rows = db.prepare(`
    SELECT e.vector, w.status, w.rating, w.updated_at AS updatedAt
    FROM watch_entries w
    JOIN media_embeddings e
      ON e.media_type = w.media_type AND e.tmdb_id = w.tmdb_id
    WHERE w.user_id = ? AND e.model = ?
  `).all(userId, model);

  for (const row of rows) {
    const statusWeight = FOR_YOU_STATUS_WEIGHTS[row.status] || 0;
    const ratingWeight = row.rating ? FOR_YOU_RATING_WEIGHTS[row.rating] || 0 : 0;
    const weight = (statusWeight + ratingWeight) * timeDecay(row.updatedAt, FOR_YOU_VECTOR_CONFIG.halfLifeDays);
    if (weight) {
      addWeighted(vector, decodeVector(row), weight);
      updates += 1;
    }
  }

  const events = db.prepare(`
    SELECT e.vector, i.event_type AS eventType, i.ts
    FROM interaction_events i
    JOIN media_embeddings e
      ON e.media_type = i.media_type AND e.tmdb_id = i.tmdb_id
    WHERE i.user_id = ? AND i.event_type IN ('add', 'open', 'favorite', 'skip', 'reject')
      AND e.model = ?
  `).all(userId, model);
  for (const event of events) {
    const weight = (FOR_YOU_EVENT_WEIGHTS[event.eventType] || 0)
      * timeDecay(event.ts, FOR_YOU_VECTOR_CONFIG.halfLifeDays);
    if (weight) {
      addWeighted(vector, decodeVector(event), weight);
      updates += 1;
    }
  }

  normalize(vector);
  upsertUserVector({ userId, kind: "long", model, dimension, vector, updates });
  return { vector, updates };
}

export function updateSessionUserVector(userId, model, event) {
  const embedding = db.prepare(`
    SELECT dim, vector FROM media_embeddings
    WHERE media_type = ? AND tmdb_id = ? AND model = ?
  `).get(event.mediaType, String(event.tmdbId), model);
  if (!embedding) return null;

  const existing = getUserVector(userId, "session", model);
  const now = Date.now();
  const stale = !existing || now - Date.parse(existing.updatedAt) > FOR_YOU_VECTOR_CONFIG.sessionResetMinutes * 60_000;
  const vector = stale ? new Float32Array(embedding.dim) : existing.vector;
  const source = decodeVector(embedding);
  const eta = FOR_YOU_VECTOR_CONFIG.sessionEta;
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] = (stale ? 0 : (1 - eta) * vector[index]) + eta * source[index];
  }
  normalize(vector);
  upsertUserVector({
    userId,
    kind: "session",
    model,
    dimension: embedding.dim,
    vector,
    updates: (existing?.nUpdates || 0) + 1,
  });
  return vector;
}

export function scoreByUserVector(vector, candidates) {
  if (!(vector instanceof Float32Array)) return [];
  return candidates.map((candidate) => ({
    ...candidate,
    vectorScore: candidate.vector
      ? candidate.vector.reduce((sum, value, index) => sum + value * vector[index], 0)
      : null,
  })).sort((left, right) => (right.vectorScore ?? -Infinity) - (left.vectorScore ?? -Infinity));
}
