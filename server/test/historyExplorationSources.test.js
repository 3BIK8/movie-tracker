import assert from "node:assert/strict";
import test from "node:test";
import {
  getHistoryExplorationSources,
  MAX_HISTORY_EXPLORATION_SOURCES,
} from "../services/recommendations/historyExplorationSources.js";

test("history exploration uses library connections without creating taste evidence", () => {
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

  const result = getHistoryExplorationSources(history, "movie");
  const sources = result.sources;

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

  assert.equal(result.watchedHistoryItems, 3);
  assert.equal(result.historyConnectionCount, 5);
  assert.equal(sources.some((source) => source.value === "99"), true);
  assert.equal(sources.some((source) => source.value === "30"), false);
  assert.equal(sources.some((source) => source.type === "directors"), false);
});

test("history exploration falls back to canonical metadata fields", () => {
  const history = [
    {
      type: "movie",
      status: "watched",
      actors: [{ id: 10, name: "Actor" }],
      directors: [{ id: 20, name: "Director" }],
      genres: [{ id: 28, name: "Action" }],
      keywords: [{ id: 99, name: "Keyword" }],
    },
    {
      type: "movie",
      status: null,
      rating: "A",
      actors: [{ id: 30, name: "Rated Actor" }],
    },
    {
      type: "movie",
      status: "to_watch",
      actors: [{ id: 40, name: "Future Actor" }],
    },
  ];

  const result = getHistoryExplorationSources(history, "movie");
  const values = result.sources.map((source) => `${source.type}:${source.value}`);

  assert.equal(result.watchedHistoryItems, 2);
  assert.ok(values.includes("actors:10"));
  assert.ok(values.includes("genres:28"));
  assert.ok(values.includes("keywords:99"));
  assert.ok(values.includes("actors:40"));
  assert.equal(values.includes("actors:30"), false);
  assert.equal(values.includes("directors:20"), false);
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
  assert.ok(first.sources.length <= MAX_HISTORY_EXPLORATION_SOURCES);
  assert.ok(first.sources.every((source) => source.pool === "exploration"));
  assert.ok(first.sources.every((source) => source.evidenceScore === 0));
});
