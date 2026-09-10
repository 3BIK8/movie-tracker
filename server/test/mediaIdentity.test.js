import test from "node:test";
import assert from "node:assert/strict";

import {
  createMediaKey,
  normalizeMediaId,
  normalizeMediaRef,
  normalizeMediaType,
  normalizeWatchHistory,
} from "../utils/mediaIdentity.js";

test("media identity canonicalizes type and numeric id", () => {
  assert.deepEqual(normalizeMediaRef(" MOVIE ", 123), {
    type: "movie",
    id: "123",
  });

  assert.deepEqual(normalizeMediaRef("tv", "00123"), {
    type: "tv",
    id: "123",
  });

  assert.equal(createMediaKey("MOVIE", "00123"), "movie:123");
});

test("media identity rejects unsupported types and invalid ids", () => {
  assert.throws(() => normalizeMediaType("person"), /Unsupported media type/);
  assert.throws(() => normalizeMediaId("abc"), /numeric identifier/);
  assert.throws(() => normalizeMediaId(0), /greater than zero/);
});

test("watch history normalization removes numeric/string id mismatches", () => {
  const history = normalizeWatchHistory([
    { type: "movie", id: 123, status: "watched" },
    { type: "tv", id: "00124", status: "to_watch" },
  ]);

  assert.deepEqual(history, [
    { type: "movie", id: "123", status: "watched" },
    { type: "tv", id: "124", status: "to_watch" },
  ]);
});

test("watch history normalization rejects malformed entries", () => {
  assert.throws(
    () => normalizeWatchHistory([{ type: "movie", id: "bad" }]),
    /index 0/,
  );
});
