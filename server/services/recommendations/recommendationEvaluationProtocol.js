function normalizeKey(type, id) {
  return `${String(type || "").trim().toLowerCase()}:${String(id ?? "").trim()}`;
}

function getInteractionTimestamp(item) {
  return (
    item.lastInteractedAt ||
    item.ratingUpdatedAt ||
    item.favoriteAt ||
    item.statusChangedAt ||
    item.updatedAt ||
    item.createdAt ||
    null
  );
}

function getSortableTimestamp(item) {
  const timestamp = Date.parse(getInteractionTimestamp(item));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isPositiveEvaluationInteraction(item) {
  return (
    item?.status === "watched" &&
    (["S", "A", "B"].includes(item.rating) || item.favorite === true)
  );
}

export function buildTemporalHoldout(
  history,
  {
    testFraction = 0.2,
    minTrainInteractions = 3,
    minTestInteractions = 1,
  } = {},
) {
  if (!Array.isArray(history) || history.length === 0) {
    return {
      train: [],
      test: [],
      relevantIds: new Set(),
      cutoff: null,
      evaluated: false,
      reason: "empty-history",
    };
  }

  if (!(testFraction > 0 && testFraction < 1)) {
    throw new Error("testFraction must be between 0 and 1");
  }

  const timestamped = history
    .map((item, index) => ({
      item,
      index,
      timestamp: getSortableTimestamp(item),
    }))
    .filter(({ timestamp }) => timestamp !== null)
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);

  if (timestamped.length < minTrainInteractions + minTestInteractions) {
    return {
      train: history.slice(),
      test: [],
      relevantIds: new Set(),
      cutoff: null,
      evaluated: false,
      reason: "insufficient-timestamped-history",
    };
  }

  const requestedTestSize = Math.max(
    minTestInteractions,
    Math.floor(timestamped.length * testFraction),
  );
  const testSize = Math.min(
    requestedTestSize,
    timestamped.length - minTrainInteractions,
  );
  const cutoff = timestamped[timestamped.length - testSize].timestamp;

  const train = history.filter((item) => {
    const timestamp = getSortableTimestamp(item);
    return timestamp !== null && timestamp < cutoff;
  });

  const test = history.filter((item) => {
    const timestamp = getSortableTimestamp(item);
    return timestamp !== null && timestamp >= cutoff;
  });

  const relevantIds = new Set(
    test
      .filter(isPositiveEvaluationInteraction)
      .map((item) => normalizeKey(item.type, item.id)),
  );

  const evaluated =
    train.length >= minTrainInteractions &&
    test.length >= minTestInteractions &&
    relevantIds.size > 0;

  return {
    train,
    test,
    relevantIds,
    cutoff: new Date(cutoff).toISOString(),
    evaluated,
    reason: evaluated ? null : "no-positive-holdout",
  };
}

export function aggregateMetricVectors(results) {
  const evaluated = results.filter((result) => result?.evaluated !== false);

  if (evaluated.length === 0) return {};

  const keys = Object.keys(evaluated[0].metrics || {});
  return Object.fromEntries(
    keys.map((key) => [
      key,
      evaluated.reduce((sum, result) => sum + Number(result.metrics[key] || 0), 0) /
        evaluated.length,
    ]),
  );
}

export { getInteractionTimestamp, isPositiveEvaluationInteraction, normalizeKey };
