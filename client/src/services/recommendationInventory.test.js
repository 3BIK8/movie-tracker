import test from "node:test";
import assert from "node:assert/strict";
import { shouldOfferRecommendationRefill } from "./recommendationInventory.js";

test("offers a refill when the inventory is empty", () => {
  assert.equal(shouldOfferRecommendationRefill(0), true);
});

test("offers a refill when fewer than one full page remains", () => {
  assert.equal(shouldOfferRecommendationRefill(19), true);
});

test("does not offer a refill when a full page is available", () => {
  assert.equal(shouldOfferRecommendationRefill(20), false);
  assert.equal(shouldOfferRecommendationRefill(21), false);
});

test("rejects invalid counts and page sizes", () => {
  assert.equal(shouldOfferRecommendationRefill(-1), false);
  assert.equal(shouldOfferRecommendationRefill(0, 0), false);
  assert.equal(shouldOfferRecommendationRefill(Number.NaN), false);
});
