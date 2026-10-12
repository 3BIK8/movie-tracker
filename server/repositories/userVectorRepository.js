import { db } from "../db/database.js";

function requireUserId(userId) {
  if (!Number.isInteger(userId) || userId < 1) {
    throw new TypeError("A valid user id is required.");
  }
}

function decodeVector(row) {
  if (!row) return null;
  return {
    ...row,
    vector: new Float32Array(
      row.vector.buffer,
      row.vector.byteOffset,
      row.vector.byteLength / Float32Array.BYTES_PER_ELEMENT,
    ),
  };
}

export function getUserVector(userId, kind, model) {
  requireUserId(userId);
  return decodeVector(db.prepare(`
    SELECT dim, vector, n_updates AS nUpdates, updated_at AS updatedAt
    FROM user_vectors
    WHERE user_id = ? AND kind = ? AND model = ?
  `).get(userId, kind, model));
}

export function upsertUserVector({ userId, kind, model, dimension, vector, updates }) {
  requireUserId(userId);
  if (!(vector instanceof Float32Array) || vector.length !== dimension) {
    throw new TypeError("User vector has an invalid dimension.");
  }
  db.prepare(`
    INSERT INTO user_vectors (
      user_id, kind, model, dim, vector, n_updates, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, kind, model) DO UPDATE SET
      dim = excluded.dim,
      vector = excluded.vector,
      n_updates = excluded.n_updates,
      updated_at = excluded.updated_at
  `).run(
    userId,
    kind,
    model,
    dimension,
    Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength),
    updates,
    new Date().toISOString(),
  );
}
