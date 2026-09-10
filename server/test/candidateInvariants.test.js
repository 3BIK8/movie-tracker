import test from "node:test";
import assert from "node:assert/strict";

import { validateCandidateOutput } from "../services/recommendations/candidateInvariants.js";

test("candidate invariants accept a valid bounded output", () => {
  const candidates = [
    { type: "movie", id: "10", pool: "exploitation" },
    { type: "movie", id: "20", pool: "exploration" },
  ];

  assert.strictEqual(
    validateCandidateOutput(candidates, {
      mediaType: "movie",
      limit: 5,
      knownIds: new Set(["movie:99"]),
    }),
    candidates,
  );
});

test("candidate invariants reject duplicate identities", () => {
  assert.throws(
    () =>
      validateCandidateOutput(
        [
          { type: "movie", id: "10" },
          { type: "movie", id: 10 },
        ],
        { mediaType: "movie", limit: 5 },
      ),
    /Duplicate candidate identity: movie:10/,
  );
});

test("candidate invariants reject known media", () => {
  assert.throws(
    () =>
      validateCandidateOutput(
        [{ type: "movie", id: "10" }],
        { mediaType: "movie", limit: 5, knownIds: new Set(["movie:10"]) },
      ),
    /Known media leaked into candidate output: movie:10/,
  );
});

test("candidate invariants reject media-type leakage", () => {
  assert.throws(
    () =>
      validateCandidateOutput(
        [{ type: "tv", id: "10" }],
        { mediaType: "movie", limit: 5 },
      ),
    /Candidate media type mismatch/,
  );
});

test("candidate invariants enforce output limit", () => {
  assert.throws(
    () =>
      validateCandidateOutput(
        [
          { type: "movie", id: "1" },
          { type: "movie", id: "2" },
          { type: "movie", id: "3" },
        ],
        { mediaType: "movie", limit: 2 },
      ),
    /Candidate output exceeds limit: 3 > 2/,
  );
});

test("candidate invariants enforce the exploration quota", () => {
  assert.throws(
    () =>
      validateCandidateOutput(
        [
          { type: "movie", id: "1", pool: "exploration" },
          { type: "movie", id: "2", pool: "exploration" },
          { type: "movie", id: "3", pool: "exploration" },
        ],
        { mediaType: "movie", limit: 5 },
      ),
    /Candidate exploration quota exceeded: 3 > 2/,
  );
});
