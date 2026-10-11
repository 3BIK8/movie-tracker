import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const databasePath = path.join(
  os.tmpdir(),
  `movie-tracker-recommendation-feedback-${process.pid}.sqlite`,
);
process.env.DATABASE_PATH = databasePath;

const { closeDatabase } = await import("../db/database.js");
const {
  getRecommendationFeedback,
  recordRecommendationFeedback,
} = await import("../repositories/recommendationExposureRepository.js");

test.after(() => {
  closeDatabase();
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
});

test("persists explicit rejection separately from passive ignore", () => {
  recordRecommendationFeedback({
    exposures: [
      {
        type: "movie",
        id: "123",
        generationId: "generation-1",
        exposedAt: new Date().toISOString(),
        interactions: [{ event: "not_interested" }],
      },
      {
        type: "movie",
        id: "456",
        generationId: "generation-1",
        exposedAt: new Date().toISOString(),
        interactions: [{ event: "ignored" }],
      },
    ],
  });

  const feedback = getRecommendationFeedback();
  const rejected = feedback.exposures.find((item) => item.id === "123");
  const ignored = feedback.exposures.find((item) => item.id === "456");

  assert.deepEqual(rejected.interactions, [{ event: "not_interested" }]);
  assert.deepEqual(ignored.interactions, [{ event: "ignored" }]);
});
