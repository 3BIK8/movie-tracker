import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const databasePath = path.join(os.tmpdir(), `movie-tracker-user-vectors-${process.pid}.sqlite`);
process.env.DATABASE_PATH = databasePath;

const { closeDatabase, db } = await import("../db/database.js");
const { cacheMediaMetadata } = await import("../repositories/mediaMetadataRepository.js");
const { upsertMediaEmbedding } = await import("../repositories/embeddingRepository.js");
const {
  rebuildLongUserVector,
  scoreByUserVector,
  updateSessionUserVector,
} = await import("../services/recommendations/userVectorService.js");
const { getUserVector } = await import("../repositories/userVectorRepository.js");

test.after(() => {
  closeDatabase();
  for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
});

test("For You vector uses separate status weights", () => {
  const model = "test-for-you";
  for (const [id, title] of [["1", "Watched"], ["2", "To Watch"], ["3", "Not Sure"]]) {
    cacheMediaMetadata({ type: "movie", id, title, year: 2020 });
  }
  upsertMediaEmbedding({ type: "movie", id: "1", model, dimension: 2, vector: new Float32Array([1, 0]), textHash: "a".repeat(64) });
  upsertMediaEmbedding({ type: "movie", id: "2", model, dimension: 2, vector: new Float32Array([0, 1]), textHash: "b".repeat(64) });
  upsertMediaEmbedding({ type: "movie", id: "3", model, dimension: 2, vector: new Float32Array([1, 1]), textHash: "c".repeat(64) });
  db.prepare("INSERT INTO watch_entries (user_id, media_type, tmdb_id, status, created_at, updated_at) VALUES (1, 'movie', '1', 'watched', ?, ?)").run(new Date().toISOString(), new Date().toISOString());
  db.prepare("INSERT INTO watch_entries (user_id, media_type, tmdb_id, status, created_at, updated_at) VALUES (1, 'movie', '2', 'to_watch', ?, ?)").run(new Date().toISOString(), new Date().toISOString());
  db.prepare("INSERT INTO watch_entries (user_id, media_type, tmdb_id, status, created_at, updated_at) VALUES (1, 'movie', '3', 'not_sure', ?, ?)").run(new Date().toISOString(), new Date().toISOString());

  const result = rebuildLongUserVector(1, model);
  assert.ok(result);
  assert.ok(result.vector[0] > result.vector[1]);
});

test("session vector changes ranking after a like and reject in one session", () => {
  const model = "test-session";
  cacheMediaMetadata({ type: "movie", id: "10", title: "Liked", year: 2020 });
  cacheMediaMetadata({ type: "movie", id: "11", title: "Rejected", year: 2020 });
  upsertMediaEmbedding({ type: "movie", id: "10", model, dimension: 2, vector: new Float32Array([1, 0]), textHash: "d".repeat(64) });
  upsertMediaEmbedding({ type: "movie", id: "11", model, dimension: 2, vector: new Float32Array([0, 1]), textHash: "e".repeat(64) });
  db.prepare("DELETE FROM user_vectors WHERE user_id = 1 AND model = ?").run(model);

  updateSessionUserVector(1, model, {
    mediaType: "movie",
    tmdbId: "10",
    eventType: "favorite",
  });
  const afterLikeVector = getUserVector(1, "session", model).vector;
  const afterLike = scoreByUserVector(
    afterLikeVector,
    [
      { id: "10", vector: new Float32Array([1, 0]) },
      { id: "11", vector: new Float32Array([0, 1]) },
    ],
  );
  assert.equal(afterLike[0].id, "10");

  updateSessionUserVector(1, model, {
    mediaType: "movie",
    tmdbId: "11",
    eventType: "reject",
  });
  const session = db.prepare(`
    SELECT vector FROM user_vectors
    WHERE user_id = 1 AND kind = 'session' AND model = ?
  `).get(model);
  const vector = new Float32Array(
    session.vector.buffer,
    session.vector.byteOffset,
    session.vector.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  const afterReject = scoreByUserVector(vector, [
    { id: "10", vector: new Float32Array([1, 0]) },
    { id: "11", vector: new Float32Array([0, 1]) },
  ]);

  assert.equal(afterReject[0].id, "10");
  assert.ok(afterReject[0].vectorScore > 0);
  assert.ok(afterReject[1].vectorScore < 0);
  assert.ok(session);
});
