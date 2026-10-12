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
const { rebuildLongUserVector } = await import("../services/recommendations/userVectorService.js");

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
