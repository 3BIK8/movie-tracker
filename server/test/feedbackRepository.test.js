import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const databasePath = path.join(
  os.tmpdir(),
  `movie-tracker-feedback-authority-${process.pid}.sqlite`,
);
process.env.DATABASE_PATH = databasePath;

const { closeDatabase } = await import("../db/database.js");
const {
  getRejectedMediaKeys,
  listRejections,
  recordInteractionEvents,
  recordLegacyRecommendationRejections,
} = await import("../repositories/feedbackRepository.js");

test.after(() => {
  closeDatabase();
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

test("reject is durable, idempotent, and scoped to the user", () => {
  const event = {
    mediaType: "movie",
    tmdbId: "123",
    eventType: "reject",
    surface: "for_you",
    clientEventId: "client-event-1",
  };

  assert.deepEqual(recordInteractionEvents(1, [event]), { accepted: 1, ignored: 0 });
  assert.deepEqual(recordInteractionEvents(1, [event]), { accepted: 0, ignored: 1 });
  assert.deepEqual([...getRejectedMediaKeys(1)], ["movie:123"]);
  assert.deepEqual([...getRejectedMediaKeys(2)], []);
  assert.equal(listRejections(1)[0].id, "123");
});

test("undo reject removes suppression and records an idempotent event", () => {
  const result = recordInteractionEvents(1, [{
    mediaType: "movie",
    tmdbId: "123",
    eventType: "undo_reject",
    surface: "feedback",
    clientEventId: "client-event-2",
  }]);

  assert.deepEqual(result, { accepted: 1, ignored: 0 });
  assert.deepEqual([...getRejectedMediaKeys(1)], []);
  assert.deepEqual(recordInteractionEvents(1, [{
    mediaType: "movie",
    tmdbId: "123",
    eventType: "undo_reject",
    surface: "feedback",
    clientEventId: "client-event-2",
  }]), { accepted: 0, ignored: 1 });
});

test("legacy not_interested feedback is converted without converting ignored", () => {
  recordLegacyRecommendationRejections(1, {
    exposures: [
      {
        type: "tv",
        id: "456",
        generationId: "legacy-generation",
        interactions: [{ event: "not_interested" }],
      },
      {
        type: "tv",
        id: "789",
        generationId: "legacy-generation",
        interactions: [{ event: "ignored" }],
      },
    ],
  });

  assert.deepEqual([...getRejectedMediaKeys(1)], ["tv:456"]);
});

test("reject validates shared media identity", () => {
  assert.throws(
    () => recordInteractionEvents(1, [{
      mediaType: "movie",
      tmdbId: "0",
      eventType: "reject",
      surface: "for_you",
      clientEventId: "invalid-id",
    }]),
    /greater than zero/,
  );
});
