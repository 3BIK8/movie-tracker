import assert from "node:assert/strict";
import test from "node:test";

import { getWatchHistory } from "../repositories/watchHistoryRepository.js";

test("watch history repository returns the array contract consumed by recommendations", () => {
  const history = getWatchHistory();

  assert.equal(Array.isArray(history), true);
});
