import assert from "node:assert/strict";
import test from "node:test";
import {
  getHistoryExplorationSources,
  MAX_HISTORY_EXPLORATION_SOURCES,
} from "../services/recommendations/historyExplorationSources.js";

test("history exploration uses watched connections without creating taste evidence", () => {
  const history = [
    {
      type: "movie",
      status: "watched",
      connections: [
        { type: "actor", value: 10 },
        { type: "genre", value: 28 },
        { type: "genre", value: 28 },
      ],
    },
    {
      type: "movie",
      status: "watched",
      connections: [
        { type: "actor", value: 10 },
        { type: "director", value: 20 },
      ],
    },
    {
      type: "movie",
      status: "to_watch",
      connections: [{ type: "actor", value: 99 }],
    },
    {
      type: "tv",
      status: "watched",
      connections: [{ type: "actor", value: 30 }],
    },
  ];

  const sources = getHistoryExplorationSources(history, "movie");

  assert.deepEqual(
    sources.find((source) => source.type === "actors" && source.value === "10"),
    {
      type: "actors",
      value: "10",
      evidenceScore: 0,
      confidence: 0,
      appearances: 2,
      pool: "exploration",
    },
  );

  assert.equal(
    sources.some((source) => source.value === "99"),
    false,
  );
  assert.equal(
    sources.some((source) => source.value === "30"),
    false,
  );
});

test("history exploration source selection is deterministic and bounded", () => {
  const connections = Array.from({ length: 100 }, (_, index) => ({
    type: "keyword",
    value: index + 1,
  }));

  const history = [
    {
      type: "movie",
      status: "watched",
      connections,
    },
  ];

  const first = getHistoryExplorationSources(history, "movie");
  const second = getHistoryExplorationSources(history, "movie");

  assert.deepEqual(first, second);
  assert.ok(first.length <= MAX_HISTORY_EXPLORATION_SOURCES);
  assert.ok(first.every((source) => source.pool === "exploration"));
  assert.ok(first.every((source) => source.evidenceScore === 0));
});
