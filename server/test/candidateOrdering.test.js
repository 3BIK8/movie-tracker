import test from "node:test";
import assert from "node:assert/strict";

import { compareCandidatesByEvidence } from "../services/recommendations/candidateOrdering.js";

test("candidate ordering prioritizes evidence", () => {
  const candidates = [
    { type: "movie", id: "2", sourceEvidence: 3, sourceCount: 1 },
    { type: "movie", id: "1", sourceEvidence: 8, sourceCount: 1 },
  ];

  candidates.sort(compareCandidatesByEvidence);

  assert.deepEqual(candidates.map((candidate) => candidate.id), ["1", "2"]);
});

test("candidate ordering uses source count as the deterministic tie-breaker", () => {
  const candidates = [
    { type: "movie", id: "2", sourceEvidence: 5, sourceCount: 1 },
    { type: "movie", id: "1", sourceEvidence: 5, sourceCount: 3 },
  ];

  candidates.sort(compareCandidatesByEvidence);

  assert.deepEqual(candidates.map((candidate) => candidate.id), ["1", "2"]);
});

test("candidate ordering uses canonical media identity for final ties", () => {
  const candidates = [
    { type: "tv", id: "20", sourceEvidence: 5, sourceCount: 2 },
    { type: "movie", id: "10", sourceEvidence: 5, sourceCount: 2 },
    { type: "movie", id: "2", sourceEvidence: 5, sourceCount: 2 },
  ];

  candidates.sort(compareCandidatesByEvidence);

  assert.deepEqual(
    candidates.map((candidate) => `${candidate.type}:${candidate.id}`),
    ["movie:10", "movie:2", "tv:20"],
  );
});

test("candidate ordering is antisymmetric for distinct candidates", () => {
  const a = { type: "movie", id: "1", sourceEvidence: 4, sourceCount: 2 };
  const b = { type: "movie", id: "2", sourceEvidence: 4, sourceCount: 2 };

  assert.equal(Math.sign(compareCandidatesByEvidence(a, b)), -1);
  assert.equal(Math.sign(compareCandidatesByEvidence(b, a)), 1);
  assert.equal(compareCandidatesByEvidence(a, a), 0);
});
