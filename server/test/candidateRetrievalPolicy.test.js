import test from "node:test";
import assert from "node:assert/strict";
import {
  CANDIDATE_RETRIEVAL_LIMITS,
  getDiscoveryPageCount,
  getEnrichmentBudget,
  getSourceBudget,
  selectCandidatesForEnrichment,
} from "../services/recommendations/candidateRetrievalPolicy.js";

function candidate(id, sources) {
  return {
    id: String(id),
    type: "movie",
    sources: sources.map((source, index) => ({
      type: source,
      value: `${source}-${id}-${index}`,
      evidenceScore: source === "actors" ? 2 : 1,
    })),
  };
}

test("bounded discovery uses extra pages only for paged connection dimensions", () => {
  assert.equal(getDiscoveryPageCount("genres"), 2);
  assert.equal(getDiscoveryPageCount("studios"), 2);
  assert.equal(getDiscoveryPageCount("keywords"), 2);
  assert.equal(getDiscoveryPageCount("actors"), 1);
  assert.equal(getDiscoveryPageCount("franchises"), 1);
});

test("enrichment budget scales with requested recommendation limit", () => {
  assert.equal(getEnrichmentBudget(100), 600);
  assert.equal(getEnrichmentBudget(25), 150);
  assert.equal(
    CANDIDATE_RETRIEVAL_LIMITS.maxEnrichmentMultiplier,
    6,
  );
});

test("source budget expands with profile coverage and remains bounded", () => {
  const sparseProfile = {
    actors: {
      "1": { evidenceScore: 2 },
      "2": { evidenceScore: 1 },
    },
  };

  const broadProfile = Object.fromEntries(
    ["actors", "directors", "genres", "franchises", "studios", "keywords"].map(
      (type) => [
        type,
        Object.fromEntries(
          Array.from({ length: 20 }, (_, index) => [
            `${type}-${index}`,
            { evidenceScore: 1 },
          ]),
        ),
      ],
    ),
  );

  assert.equal(getSourceBudget(sparseProfile), 20);
  assert.equal(getSourceBudget(broadProfile), 48);
  assert.equal(CANDIDATE_RETRIEVAL_LIMITS.minSourceBudget, 20);
  assert.equal(CANDIDATE_RETRIEVAL_LIMITS.maxSourceBudget, 48);
});

test("zero and non-positive evidence do not inflate source coverage", () => {
  assert.equal(
    getSourceBudget({
      actors: {
        "1": { evidenceScore: 0 },
        "2": { evidenceScore: -1 },
      },
    }),
    20,
  );
});

test("enrichment selection prioritizes multi-source and stronger evidence candidates", () => {
  const candidates = [
    candidate(1, ["genres"]),
    candidate(2, ["actors", "genres"]),
    candidate(3, ["actors"]),
  ];

  const selected = selectCandidatesForEnrichment(candidates, 0);
  assert.deepEqual(selected, candidates);

  const bounded = selectCandidatesForEnrichment(
    Array.from({ length: 5 }, (_, index) => candidate(index, ["genres"])),
    0,
  );
  assert.equal(bounded.length, 5);
});

test("large candidate pools are deterministically bounded before enrichment", () => {
  const candidates = Array.from({ length: 7 }, (_, index) =>
    candidate(index, index < 3 ? ["actors", "genres"] : ["genres"]),
  );

  const selected = selectCandidatesForEnrichment(candidates, 1);

  assert.equal(selected.length, 6);
  assert.deepEqual(
    selected.slice(0, 3).map((item) => item.id),
    ["0", "1", "2"],
  );
});
