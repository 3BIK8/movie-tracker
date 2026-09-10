function normalizeKey(type, id) {
  return `${String(type || "").trim().toLowerCase()}:${String(id ?? "").trim()}`;
}

function getConnectionKeys(item) {
  return new Set(
    (item.connections || [])
      .map((connection) => `${connection.type}:${connection.value}`)
      .filter(Boolean),
  );
}

function jaccardSimilarity(a, b) {
  const aKeys = getConnectionKeys(a);
  const bKeys = getConnectionKeys(b);

  if (aKeys.size === 0 && bKeys.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const key of aKeys) {
    if (bKeys.has(key)) {
      intersection += 1;
    }
  }

  const union = new Set([...aKeys, ...bKeys]).size;
  return union === 0 ? 0 : intersection / union;
}

function isRelevant(item, relevantIds) {
  return relevantIds.has(normalizeKey(item.type, item.id));
}

export function precisionAtK(recommendations, relevantIds, k) {
  const topK = recommendations.slice(0, k);

  if (topK.length === 0) {
    return 0;
  }

  const relevant = topK.filter((item) => isRelevant(item, relevantIds)).length;
  return relevant / topK.length;
}

export function recallAtK(recommendations, relevantIds, k) {
  if (relevantIds.size === 0) {
    return 0;
  }

  const topK = recommendations.slice(0, k);
  const relevant = new Set(
    topK
      .filter((item) => isRelevant(item, relevantIds))
      .map((item) => normalizeKey(item.type, item.id)),
  );

  return relevant.size / relevantIds.size;
}

export function ndcgAtK(recommendations, relevantIds, k) {
  const topK = recommendations.slice(0, k);

  if (topK.length === 0 || relevantIds.size === 0) {
    return 0;
  }

  const dcg = topK.reduce((score, item, index) => {
    if (!isRelevant(item, relevantIds)) {
      return score;
    }

    return score + 1 / Math.log2(index + 2);
  }, 0);

  const idealLength = Math.min(k, relevantIds.size);
  const idealDcg = Array.from({ length: idealLength }, (_, index) =>
    1 / Math.log2(index + 2),
  ).reduce((total, value) => total + value, 0);

  return idealDcg === 0 ? 0 : dcg / idealDcg;
}

export function diversityAtK(recommendations, k) {
  const topK = recommendations.slice(0, k);

  if (topK.length < 2) {
    return topK.length === 1 ? 1 : 0;
  }

  let similaritySum = 0;
  let pairs = 0;

  for (let i = 0; i < topK.length; i += 1) {
    for (let j = i + 1; j < topK.length; j += 1) {
      similaritySum += jaccardSimilarity(topK[i], topK[j]);
      pairs += 1;
    }
  }

  return 1 - similaritySum / pairs;
}

export function noveltyAtK(recommendations, k) {
  const topK = recommendations.slice(0, k);

  if (topK.length === 0) {
    return 0;
  }

  const novelty = topK.reduce((total, item) => {
    const popularity = Number(item.popularity);

    if (!Number.isFinite(popularity) || popularity < 0) {
      return total + 1;
    }

    return total + 1 / Math.log2(popularity + 2);
  }, 0);

  return novelty / topK.length;
}

export function serendipityAtK(recommendations, relevantIds, history, k) {
  const topK = recommendations.slice(0, k);

  if (topK.length === 0) {
    return 0;
  }

  const likedHistory = history.filter((item) =>
    ["S", "A", "B"].includes(item.rating),
  );

  if (likedHistory.length === 0) {
    return 0;
  }

  const total = topK.reduce((sum, item) => {
    if (!isRelevant(item, relevantIds)) {
      return sum;
    }

    const maxSimilarity = likedHistory.reduce(
      (max, historyItem) => Math.max(max, jaccardSimilarity(item, historyItem)),
      0,
    );

    return sum + (1 - maxSimilarity);
  }, 0);

  return total / topK.length;
}

export function explorationQuality(exposures) {
  const exploration = exposures.filter(
    (exposure) => exposure.pool === "exploration",
  );

  if (exploration.length === 0) {
    return 0;
  }

  const positive = exploration.filter((exposure) =>
    (exposure.interactions || []).some(
      (interaction) =>
        (interaction.event === "status" && interaction.status === "watched") ||
        (interaction.event === "rating" && ["S", "A", "B"].includes(interaction.rating)),
    ),
  ).length;

  return positive / exploration.length;
}

export function evaluateRecommendationList({
  recommendations,
  relevantIds,
  history = [],
  k = 20,
  exposures = [],
}) {
  return {
    precisionAtK: precisionAtK(recommendations, relevantIds, k),
    recallAtK: recallAtK(recommendations, relevantIds, k),
    ndcgAtK: ndcgAtK(recommendations, relevantIds, k),
    diversityAtK: diversityAtK(recommendations, k),
    noveltyAtK: noveltyAtK(recommendations, k),
    serendipityAtK: serendipityAtK(
      recommendations,
      relevantIds,
      history,
      k,
    ),
    explorationQuality: explorationQuality(exposures),
  };
}

export { jaccardSimilarity };
