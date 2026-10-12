import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const databasePath = path.join(
  os.tmpdir(),
  `movie-tracker-embeddings-${process.pid}.sqlite`,
);
process.env.DATABASE_PATH = databasePath;

const { closeDatabase } = await import("../db/database.js");
const { cacheMediaMetadata } = await import("../repositories/mediaMetadataRepository.js");
const {
  countMediaEmbeddings,
  getMediaEmbedding,
} = await import("../repositories/embeddingRepository.js");
const { backfillEmbeddings } = await import("../services/embeddings/backfillEmbeddings.js");
const { hashEmbeddingText } = await import("../services/embeddings/embeddingText.js");

test.after(() => {
  closeDatabase();
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

test("embedding backfill skips unchanged text hashes", async () => {
  cacheMediaMetadata({
    type: "movie",
    id: "550",
    title: "Fight Club",
    year: 1999,
    overview: "A story about identity.",
    genres: [{ id: 18, name: "Drama" }],
    keywords: [{ id: 1, name: "identity" }],
  });
  const embedder = {
    model: "test-model",
    dimension: 3,
    calls: 0,
    async embed() {
      this.calls += 1;
      return new Float32Array([2, 0, 0]);
    },
  };

  const first = await backfillEmbeddings({ embedder, logger: { info() {} } });
  const second = await backfillEmbeddings({ embedder, logger: { info() {} } });

  assert.equal(first.embedded, 1);
  assert.equal(first.skipped, 0);
  assert.equal(second.embedded, 0);
  assert.equal(second.skipped, 1);
  assert.equal(embedder.calls, 1);
  assert.equal(countMediaEmbeddings("test-model"), 1);
  assert.deepEqual([...getMediaEmbedding("movie", "550", "test-model").vector], [1, 0, 0]);
  assert.equal(hashEmbeddingText("same"), hashEmbeddingText("same"));
});
