import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const databasePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  `../data/feed-service-${process.pid}.sqlite`,
);
process.env.DATABASE_PATH = databasePath;

const { closeDatabase, db } = await import("../db/database.js");
const { enqueueFeedItems } = await import("../repositories/feedRepository.js");
const { readForYouFeed, recordFeedEvents } = await import("../services/forYou/feedService.js");

function addMedia(type, id, title) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO media (media_type, tmdb_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(type, id, title, now, now);
}

db.prepare("INSERT OR IGNORE INTO users (id, created_at) VALUES (2, ?)").run(new Date().toISOString());

test("feed reads are SQLite-only, isolated, and mark items shown", async () => {
  addMedia("movie", "910001", "Feed Movie");
  addMedia("movie", "910002", "Other User Movie");
  enqueueFeedItems(1, [{
    type: "movie", id: "910001", score: 0.8, source: "fixture", rank: 1,
    features: { attributionCount: 2 },
  }]);
  enqueueFeedItems(2, [{
    type: "movie", id: "910002", score: 0.7, source: "fixture", rank: 1,
  }]);

  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error("TMDB must not be called"); };
  try {
    const userOne = await readForYouFeed(1, 20);
    const userTwo = await readForYouFeed(2, 20);
    assert.equal(userOne[0].title, "Feed Movie");
    assert.equal(userTwo[0].title, "Other User Movie");
    assert.equal(calls, 0);
    assert.equal(db.prepare("SELECT state FROM feed_items WHERE user_id = 1").get().state, "shown");
  } finally {
    global.fetch = originalFetch;
  }
});

test("feed event ingestion is idempotent and transitions feed state", async () => {
  const item = db.prepare("SELECT id FROM feed_items WHERE user_id = 1 LIMIT 1").get();
  const event = {
    mediaType: "movie",
    tmdbId: "910001",
    eventType: "not_interested",
    feedItemId: item.id,
    surface: "for_you",
    clientEventId: "feed-reject-once",
  };
  const accepted = await recordFeedEvents(1, [event]);
  const replayed = await recordFeedEvents(1, [event]);
  assert.equal(accepted.accepted, 1);
  assert.equal(replayed.ignored, 1);
  assert.equal(db.prepare("SELECT state FROM feed_items WHERE id = ?").get(item.id).state, "rejected");
});

test.after(() => {
  closeDatabase();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${databasePath}${suffix}`, { force: true });
});
