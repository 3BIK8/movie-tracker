const RATING_WEIGHTS = {
  S: 1.0,
  A: 0.7,
  B: 0.3,
  C: 0,
  D: -1.0,
};

const CONNECTION_TYPES = [
  "actors",
  "directors",
  "genres",
  "franchises",
  "studios",
];

function shouldUseConnectionType(mediaType, type) {
  // Actor information is not useful for predicting
  // TV discovery for this user.
  if (mediaType === "tv" && type === "actors") {
    return false;
  }

  return true;
}

function getConnectionValues(media, type) {
  switch (type) {
    case "actors":
      return new Set(
        (media.actors || []).map((item) => String(item.id ?? item.name)),
      );

    case "directors":
      return new Set(
        (media.directors || []).map((item) => String(item.id ?? item.name)),
      );

    case "genres":
      return new Set(
        (media.genres || []).map((item) =>
          String(item.id ?? item.name ?? item),
        ),
      );

    case "franchises":
      return new Set(
        (media.franchises || []).map((item) => String(item.id ?? item.name)),
      );

    case "studios":
      return new Set(
        (media.studios || []).map((item) => String(item.id ?? item.name)),
      );

    default:
      return new Set();
  }
}

/*
 * Build the user's observed relationship with
 * each connection.
 *
 * Example:
 *
 * actor X:
 *   S: 3
 *   A: 2
 *   B: 0
 *   D: 0
 *
 * This is not a permanent "actor weight".
 * It is simply an observation from the user's
 * current history.
 */
function buildConnectionModel(ratedHistory) {
  const model = Object.fromEntries(
    CONNECTION_TYPES.map((type) => [type, new Map()]),
  );

  for (const media of ratedHistory) {
    const ratingWeight = RATING_WEIGHTS[media.rating];

    if (ratingWeight === undefined) {
      continue;
    }

    for (const type of CONNECTION_TYPES) {
      if (!shouldUseConnectionType(media.type, type)) {
        continue;
      }

      const values = getConnectionValues(media, type);

      for (const value of values) {
        if (!model[type].has(value)) {
          model[type].set(value, {
            appearances: 0,
            totalScore: 0,
            ratings: {
              S: 0,
              A: 0,
              B: 0,
              C: 0,
              D: 0,
            },
            historyIds: new Set(),
          });
        }

        const signal = model[type].get(value);

        signal.appearances += 1;
        signal.totalScore += ratingWeight;

        signal.ratings[media.rating] += 1;

        signal.historyIds.add(`${media.type}:${media.id}`);
      }
    }
  }

  return model;
}

/*
 * Connection preference is simply:
 *
 * observed rating signal / observations
 *
 * The small prior prevents a connection seen once
 * from becoming absurdly strong.
 */
function calculateConnectionPreference(signal) {
  if (!signal || signal.appearances === 0) {
    return 0;
  }

  const prior = 2;

  return signal.totalScore / (signal.appearances + prior);
}

/*
 * Confidence increases naturally as we see the
 * same connection repeatedly.
 *
 * 1 appearance  -> low confidence
 * 5 appearances -> higher confidence
 * 20 appearances -> very high confidence
 */
function calculateConfidence(appearances) {
  if (appearances <= 0) {
    return 0;
  }

  return appearances / (appearances + 2);
}

function getConnectionScore(model, type, value) {
  const signal = model[type]?.get(value);

  if (!signal) {
    return 0;
  }

  const preference = calculateConnectionPreference(signal);

  const confidence = calculateConfidence(signal.appearances);

  return preference * confidence;
}

function getSharedConnections(candidate, historyItem, mediaType) {
  const shared = [];

  for (const type of CONNECTION_TYPES) {
    if (!shouldUseConnectionType(mediaType, type)) {
      continue;
    }

    const candidateValues = getConnectionValues(candidate, type);

    const historyValues = getConnectionValues(historyItem, type);

    for (const value of candidateValues) {
      if (historyValues.has(value)) {
        shared.push({
          type,
          value,
        });
      }
    }
  }

  return shared;
}

/*
 * Score one candidate against the user's history.
 *
 * IMPORTANT:
 *
 * We are intentionally NOT saying:
 *
 * genre = 0.25
 * actor = 1.0
 * studio = 0.55
 *
 * Those are arbitrary assumptions.
 *
 * Instead, every connection gets its current
 * observed signal from the user's own history.
 */
function scoreCandidate(candidate, ratedHistory, connectionModel, mediaType) {
  const evidence = [];

  for (const historyItem of ratedHistory) {
    const shared = getSharedConnections(candidate, historyItem, mediaType);

    for (const connection of shared) {
      const connectionScore = getConnectionScore(
        connectionModel,
        connection.type,
        connection.value,
      );

      if (connectionScore === 0) {
        continue;
      }

      const ratingWeight = RATING_WEIGHTS[historyItem.rating];

      const contribution = connectionScore * Math.max(ratingWeight, 0);

      evidence.push({
        type: connection.type,

        value: connection.value,

        score: connectionScore,

        historyTitle: historyItem.title || historyItem.name,

        historyRating: historyItem.rating,

        contribution,
      });
    }
  }

  /*
   * Multiple pieces of evidence are useful,
   * but we don't artificially multiply the score
   * by every matching genre.
   *
   * Each connection contributes once.
   */
  evidence.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const recommendationScore = evidence.reduce(
    (total, item) => total + item.contribution,
    0,
  );

  return {
    recommendationScore,

    positiveScore: recommendationScore,

    negativeScore: 0,

    matchedHistory: getMatchedHistory(evidence),

    connectionEvidence: evidence.slice(0, 20),
  };
}

function getMatchedHistory(evidence) {
  const historyMap = new Map();

  for (const item of evidence) {
    if (!historyMap.has(item.historyTitle)) {
      historyMap.set(item.historyTitle, {
        title: item.historyTitle,
        rating: item.historyRating,
        score: 0,
        connections: [],
      });
    }

    const history = historyMap.get(item.historyTitle);

    history.score += item.contribution;

    history.connections.push(item);
  }

  return [...historyMap.values()].sort((a, b) => b.score - a.score).slice(0, 5);
}

export function scoreCandidates(candidates, history, mediaType) {
  if (!Array.isArray(candidates)) {
    return [];
  }

  if (!Array.isArray(history)) {
    return [];
  }

  /*
   * Only actual watched + rated media becomes
   * training data.
   *
   * This is important:
   *
   * to_watch ≠ preference
   * not_sure ≠ preference
   *
   * We only learn from something the user actually
   * watched and explicitly rated.
   */
  const ratedHistory = history.filter(
    (item) =>
      item?.type === mediaType &&
      item?.status === "watched" &&
      Object.prototype.hasOwnProperty.call(RATING_WEIGHTS, item.rating),
  );

  const connectionModel = buildConnectionModel(ratedHistory);

  return candidates
    .map((candidate) => ({
      ...candidate,

      ...scoreCandidate(candidate, ratedHistory, connectionModel, mediaType),
    }))
    .sort((a, b) => {
      if (b.recommendationScore !== a.recommendationScore) {
        return b.recommendationScore - a.recommendationScore;
      }

      /*
       * Popularity remains ONLY a tie breaker.
       * It does not teach the model what the user likes.
       */
      return (b.popularity || 0) - (a.popularity || 0);
    });
}
