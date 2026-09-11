import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const databasePath = path.join(
  os.tmpdir(),
  `movie-tracker-watch-history-${process.pid}.sqlite`,
);

process.env.DATABASE_PATH = databasePath;

const {
  deleteWatchHistoryItem,
  getWatchHistory,
  getWatchHistoryCount,
  migrateLegacyWatchHistory,
  upsertWatchHistoryItem,
} = await import("../repositories/watchHistoryRepository.js");

const sampleItem = {
  type: "movie",
  id: "550",
  title: "Fight Club",
  date: "1999-10-15",
  year: 1999,
  poster_path: "/poster.jpg",
  genres: [{ id: 18, name: "Drama" }],
  genre_ids: [18],
  actors: [{ id: 819, name: "Edward Norton" }],
  directors: [{ id: 7467, name: "David Fincher" }],
  studios: [{ id: 508, name: "Regency Enterprises" }],
  keywords: [{ id: 825, name: "support group" }],
  language: "en",
  popularity: 61.2,
  tmdbRating: 8.4,
  franchise: null,
  status: "watched",
  rating: "S",
  favorite: true,
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
  statusChangedAt: "2026-09-01T10:00:00.000Z",
  ratingUpdatedAt: "2026-09-01T10:00:00.000Z",
  favoriteAt: "2026-09-01T10:00:00.000Z",
  lastInteractedAt: "2026-09-01T10:00:00.000Z",
};

test.after(() => {
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

test("starts with an empty persistent watch history", () => {
  assert.equal(getWatchHistoryCount(), 0);
  assert.deepEqual(getWatchHistory(), {});
});

test("persists a complete watch history item and reads it back", () => {
  const saved = upsertWatchHistoryItem(sampleItem);

  assert.equal(getWatchHistoryCount(), 1);
  assert.equal(saved.type, "movie");
  assert.equal(saved.id, "550");
  assert.equal(saved.status, "watched");
  assert.equal(saved.rating, "S");
  assert.equal(saved.favorite, true);
  assert.equal(saved.directors[0].name, "David Fincher");
  assert.equal(saved.genres[0].name, "Drama");

  const history = getWatchHistory();
  assert.equal(history["movie-550"].title, "Fight Club");
});

test("removes an item when neither status nor favorite remains", () => {
  upsertWatchHistoryItem({
    ...sampleItem,
    status: null,
    rating: null,
    favorite: false,
  });

  deleteWatchHistoryItem("movie", "550");

  assert.equal(getWatchHistoryCount(), 0);
  assert.deepEqual(getWatchHistory(), {});
});

test("migrates legacy history incrementally across batches", () => {
  const firstBatch = migrateLegacyWatchHistory({
    "tv-1399": {
      type: "tv",
      id: "1399",
      title: "Game of Thrones",
      year: 2011,
      genres: [{ id: 10765, name: "Sci-Fi & Fantasy" }],
      actors: [],
      directors: [],
      studios: [],
      keywords: [],
      genre_ids: [10765],
      status: "watched",
      rating: "A",
      favorite: false,
      createdAt: "2026-09-02T10:00:00.000Z",
      updatedAt: "2026-09-02T10:00:00.000Z",
      lastInteractedAt: "2026-09-02T10:00:00.000Z",
    },
  });

  assert.equal(firstBatch.migrated, true);
  assert.equal(firstBatch.count, 1);

  const secondBatch = migrateLegacyWatchHistory({
    "movie-680": {
      type: "movie",
      id: "680",
      title: "Pulp Fiction",
      year: 1994,
      genres: [{ id: 80, name: "Crime" }],
      actors: [],
      directors: [],
      studios: [],
      keywords: [],
      genre_ids: [80],
      status: "watched",
      rating: "S",
      favorite: false,
      createdAt: "2026-09-02T11:00:00.000Z",
      updatedAt: "2026-09-02T11:00:00.000Z",
      lastInteractedAt: "2026-09-02T11:00:00.000Z",
    },
  });

  assert.equal(secondBatch.migrated, true);
  assert.equal(secondBatch.count, 2);
  assert.equal(getWatchHistory()["movie-680"].rating, "S");
});
