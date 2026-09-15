export const RECOMMENDATION_PAGE_SIZE = 20;
const MIN_PAGES = 3;
const MAX_PAGES = 12;
const HISTORY_SCALE = 5;

/**
 * Candidate retrieval capacity is deliberately independent from UI pagination.
 * The pool grows when the user has a larger history or has recently consumed
 * more of the recommendation inventory through navigation.
 */
export function calculateRecommendationCapacity({
  historyCount = 0,
  recentExposureCount = 0,
  pageSize = RECOMMENDATION_PAGE_SIZE,
} = {}) {
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || RECOMMENDATION_PAGE_SIZE));
  const safeHistoryCount = Math.max(0, Number(historyCount) || 0);
  const safeExposureCount = Math.max(0, Number(recentExposureCount) || 0);

  const historyPages = Math.min(
    4,
    Math.max(0, Math.ceil(Math.sqrt(safeHistoryCount) / HISTORY_SCALE)),
  );
  const exposurePages = Math.min(7, Math.ceil(safeExposureCount / safePageSize));
  const pages = Math.min(MAX_PAGES, Math.max(MIN_PAGES, MIN_PAGES + historyPages + exposurePages));

  return pages * safePageSize;
}

export function countRecentRecommendationExposures(feedback, now = Date.now(), lookbackDays = 90) {
  const threshold = now - lookbackDays * 86_400_000;
  return (feedback?.exposures || []).filter((exposure) => {
    const timestamp = Date.parse(exposure?.exposedAt);
    return Number.isFinite(timestamp) && timestamp >= threshold;
  }).length;
}

export const RECOMMENDATION_CAPACITY_POLICY = Object.freeze({
  pageSize: RECOMMENDATION_PAGE_SIZE,
  minPages: MIN_PAGES,
  maxPages: MAX_PAGES,
  historyScale: HISTORY_SCALE,
});
