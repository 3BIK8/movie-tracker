import { db } from "../db/database.js";
import { normalizeMediaRef } from "../utils/mediaIdentity.js";

function normalizeModel(model) {
  const value = String(model || "").trim();
  if (!value || value.length > 200) {
    throw new TypeError("Embedding model is required.");
  }
  return value;
}

function normalizeVector(vector, dimension) {
  if (!(vector instanceof Float32Array) || vector.length !== dimension) {
    throw new TypeError("Embedding vector has an invalid dimension.");
  }
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function getMediaEmbedding(type, id, model) {
  const ref = normalizeMediaRef(type, id);
  const embeddingModel = normalizeModel(model);
  const row = db.prepare(`
    SELECT dim, vector, text_hash AS textHash, updated_at AS updatedAt
    FROM media_embeddings
    WHERE media_type = ? AND tmdb_id = ? AND model = ?
  `).get(ref.type, ref.id, embeddingModel);

  if (!row) return null;
  const vector = new Float32Array(
    row.vector.buffer,
    row.vector.byteOffset,
    row.vector.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return { ...row, vector };
}

export function upsertMediaEmbedding({
  type,
  id,
  model,
  dimension,
  vector,
  textHash,
  updatedAt = new Date().toISOString(),
}) {
  const ref = normalizeMediaRef(type, id);
  const embeddingModel = normalizeModel(model);
  if (!Number.isInteger(dimension) || dimension < 1) {
    throw new TypeError("Embedding dimension must be a positive integer.");
  }
  if (!/^[a-f0-9]{64}$/.test(String(textHash || ""))) {
    throw new TypeError("Embedding text hash must be a SHA-256 hash.");
  }

  db.prepare(`
    INSERT INTO media_embeddings (
      media_type, tmdb_id, model, dim, vector, text_hash, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(media_type, tmdb_id, model) DO UPDATE SET
      dim = excluded.dim,
      vector = excluded.vector,
      text_hash = excluded.text_hash,
      updated_at = excluded.updated_at
  `).run(
    ref.type,
    ref.id,
    embeddingModel,
    dimension,
    normalizeVector(vector, dimension),
    textHash,
    updatedAt,
  );
}

export function listMediaEmbeddingInputs() {
  return db.prepare(`
    SELECT media_type AS type, tmdb_id AS id, title, metadata_json AS metadataJson
    FROM media
    ORDER BY media_type, tmdb_id
  `).all();
}

export function countMediaEmbeddings(model) {
  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM media_embeddings
    WHERE model = ?
  `).get(normalizeModel(model)).count;
}

export function listMediaEmbeddings(model) {
  const embeddingModel = normalizeModel(model);
  return db.prepare(`
    SELECT e.media_type AS type, e.tmdb_id AS id, m.title, e.dim, e.vector
    FROM media_embeddings e
    JOIN media m
      ON m.media_type = e.media_type AND m.tmdb_id = e.tmdb_id
    WHERE e.model = ?
    ORDER BY e.media_type, e.tmdb_id
  `).all(embeddingModel).map((row) => ({
    ...row,
    vector: new Float32Array(
      row.vector.buffer,
      row.vector.byteOffset,
      row.vector.byteLength / Float32Array.BYTES_PER_ELEMENT,
    ),
  }));
}
