import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const databasePath = path.join(
  os.tmpdir(),
  `movie-tracker-media-cache-${process.pid}.sqlite`,
);

process.env.DATABASE_PATH = databasePath;

const {
  cacheMediaMetadata,
  getCachedMediaMetadata,
} = await import("../repositories/mediaMetadataRepository.js");

const sampleMetadata = {
  id: "550",
  type: "movie",
  title: "Fight Club",
  year: 1999,
  overview: "A test synopsis.",
  poster_path: "/poster.jpg",
  genres: [{ id: 18, name: "Drama" }],
  keywords: [{ id: 825, name: "support group" }],
  actors: [{ id: 819, name: "Edward Norton" }],
  directors: [{ id: 7467, name: "David Fincher" }],
  franchises: [],
  studios: [],
  language: "en",
  rating: 8.4,
  voteCount: 30000,
  popularity: 61.2,
};

test.after(() => {
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

test("returns null for a missing cache entry", () => {
  assert.equal(getCachedMediaMetadata("movie", "550"), null);
});

test("persists and returns normalized metadata", () => {
  assert.equal(cacheMediaMetadata(sampleMetadata, new Date("2026-09-01T00:00:00.000Z")), true);

  assert.deepEqual(
    getCachedMediaMetadata("movie", "550", Date.parse("2026-09-02T00:00:00.000Z")),
    sampleMetadata,
  );
});

test("treats metadata older than the cache TTL as stale", () => {
  assert.equal(
    getCachedMediaMetadata("movie", "550", Date.parse("2026-10-02T00:00:00.000Z")),
    null,
  );
});

test("rejects invalid media references", () => {
  assert.equal(getCachedMediaMetadata("person", "819"), null);
  assert.equal(cacheMediaMetadata({ ...sampleMetadata, id: "not-an-id" }), false);
});
