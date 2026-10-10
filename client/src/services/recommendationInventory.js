export function shouldOfferRecommendationRefill(recommendationCount, pageSize = 20) {
  const count = Number(recommendationCount);
  const size = Number(pageSize);

  return (
    Number.isFinite(count) &&
    Number.isFinite(size) &&
    count >= 0 &&
    size > 0 &&
    count < size
  );
}
