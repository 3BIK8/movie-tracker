const RATING_WEIGHTS = {
  S: 1.0,
  A: 0.7,
  B: 0.3,
  C: 0,
  D: -1.0,
};

const FEEDBACK_WEIGHTS = {
  skipped: -0.15,
  ignored: -0.25,
};

/*
 * Recommendation hierarchy
 *
 * Strong:
 *   franchise > actor > studio > director
 *
 * Supporting:
 *   genre
 *
 * Context:
 *   decade / language
 *
 * Strong relationships should be capable of producing a recommendation
 * on their own. Genres and context should refine a recommendation rather
 * than create a large artificial baseline.
 */
const CONNECTION_WEIGHTS = {
  franchise: 3.0,
  actor: 1.8,
  studio: 1.0,
  director: 0.8,

  genre: 0.55,

  decade: 0.15,
  language: 0.05,

  mediaType: 0,
};

const STRONG_CONNECTION_TYPES = new Set([
  "franchise",
  "actor",
  "studio",
  "director",
]);

const SUPPORT_CONNECTION_TYPES = new Set(["genre"]);

const CONTEXT_CONNECTION_TYPES = new Set(["decade", "language"]);

const MAX_GENRE_SCORE = 1.2;
const MAX_CONTEXT_SCORE = 0.15;
const MAX_HISTORY_ANCHOR_SCORE = 2.5;

const HISTORY_ANCHOR_WEIGHTS = {
  franchise: 4.0,
  actor: 2.0,
  studio: 1.2,
  director: 1.0,
};

const HISTORY_ANCHOR_RATING_MULTIPLIERS = {
  S: 1.0,
  A: 0.75,
  B: 0.35,
};

const GENRE_DIMINISHING_RETURNS = [1.0, 0.25, 0.1];

const HISTORY_ANCHOR_DIMINISHING_RETURNS = [1.0, 0.6, 0.35];

/*
 * TV actor relationships are deliberately ignored.
 *
 * The user generally does not choose TV shows because of individual actors,
 * and keeping this rule here makes the scorer safe even if mixed history
 * accidentally reaches it.
 */
function isIgnoredConnection(type, mediaType) {
  return mediaType === "tv" && type === "actor";
}

function isStrongConnection(type) {
  return STRONG_CONNECTION_TYPES.has(type);
}

function getEvidenceClass(type) {
  if (STRONG_CONNECTION_TYPES.has(type)) {
    return "strong";
  }

  if (SUPPORT_CONNECTION_TYPES.has(type)) {
    return "support";
  }

  if (CONTEXT_CONNECTION_TYPES.has(type)) {
    return "context";
  }

  return "other";
}

function getConnectionKey(connection) {
  return `${connection.type}:${connection.value}`;
}

function diminishingReturns(count) {
  return Math.sqrt(count);
}

/*
 * Build learned preference for each connection.
 *
 * C-rated items are neutral and therefore contribute nothing.
 * D-rated items create explicit negative preference.
 * Recommendation skips/ignores create weaker implicit negative preference.
 */
function buildConnectionModel(ratedHistory, feedback = null, mediaType = null) {
  const model = new Map();

  for (const item of ratedHistory) {
    const ratingWeight = RATING_WEIGHTS[item.rating];

    if (ratingWeight === undefined || ratingWeight === 0) {
      continue;
    }

    for (const connection of item.connections || []) {
      if (isIgnoredConnection(connection.type, item.type)) {
        continue;
      }

      const key = getConnectionKey(connection);

      const existing = model.get(key) || {
        type: connection.type,
        value: connection.value,
        totalScore: 0,
        appearances: 0,
        positiveScore: 0,
        negativeScore: 0,
        explicitNegativeScore: 0,
        implicitNegativeScore: 0,
      };

      existing.totalScore += ratingWeight;
      existing.appearances += 1;

      if (ratingWeight > 0) {
        existing.positiveScore += ratingWeight;
      } else {
        existing.negativeScore += Math.abs(ratingWeight);
        existing.explicitNegativeScore += Math.abs(ratingWeight);
      }

      model.set(key, existing);
    }
  }

  for (const exposure of feedback?.exposures || []) {
    if (mediaType && exposure.type !== mediaType) {
      continue;
    }

    for (const interaction of exposure.interactions || []) {
      const feedbackWeight = FEEDBACK_WEIGHTS[interaction.event];

      if (feedbackWeight === undefined) {
        continue;
      }

      for (const connection of exposure.connections || []) {
        if (isIgnoredConnection(connection.type, exposure.type)) {
          continue;
        }

        const key = getConnectionKey(connection);
        const existing = model.get(key) || {
          type: connection.type,
          value: connection.value,
          totalScore: 0,
          appearances: 0,
          positiveScore: 0,
          negativeScore: 0,
          explicitNegativeScore: 0,
          implicitNegativeScore: 0,
        };

        existing.totalScore += feedbackWeight;
        existing.appearances += 1;
        existing.negativeScore += Math.abs(feedbackWeight);
        existing.implicitNegativeScore += Math.abs(feedbackWeight);

        model.set(key, existing);
      }
    }
  }

  for (const data of model.values()) {
    const average = data.totalScore / data.appearances;
    const confidence = data.appearances / (data.appearances + 2);

    data.preference = average * confidence;
    data.confidence = confidence;
  }

  return model;
}

function getConnectionScore(connectionModel, connection) {
  const key = getConnectionKey(connection);
  const data = connectionModel.get(key);

  if (!data) {
    return null;
  }

  const connectionWeight = CONNECTION_WEIGHTS[connection.type] ?? 0;

  if (connectionWeight === 0) {
    return null;
  }

  return {
    ...connection,
    preference: data.preference,
    confidence: data.confidence,
    appearances: data.appearances,
    score:
      data.preference * connectionWeight * diminishingReturns(data.appearances),
  };
}

function aggregateGenreEvidence(evidence) {
  const positive = evidence
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const negative = evidence
    .filter((item) => item.score < 0)
    .map((item) => Math.abs(item.score))
    .sort((a, b) => b - a);

  let positiveScore = 0;

  for (let index = 0; index < positive.length; index += 1) {
    const multiplier =
      GENRE_DIMINISHING_RETURNS[index] ??
      GENRE_DIMINISHING_RETURNS[GENRE_DIMINISHING_RETURNS.length - 1] /
        (index + 1);

    positiveScore += positive[index].score * multiplier;
  }

  let negativeScore = 0;

  for (let index = 0; index < negative.length; index += 1) {
    const multiplier =
      GENRE_DIMINISHING_RETURNS[index] ??
      GENRE_DIMINISHING_RETURNS[GENRE_DIMINISHING_RETURNS.length - 1] /
        (index + 1);

    negativeScore += negative[index] * multiplier;
  }

  return {
    positiveScore: Math.min(positiveScore, MAX_GENRE_SCORE),
    negativeScore: Math.min(negativeScore, MAX_GENRE_SCORE),
  };
}

function aggregateContextEvidence(evidence) {
  const positive = evidence
    .filter((item) => item.score > 0)
    .reduce((sum, item) => sum + item.score, 0);

  const negative = evidence
    .filter((item) => item.score < 0)
    .reduce((sum, item) => sum + Math.abs(item.score), 0);

  return {
    positiveScore: Math.min(positive, MAX_CONTEXT_SCORE),
    negativeScore: Math.min(negative, MAX_CONTEXT_SCORE),
  };
}

function calculateHistoryAnchor(candidate, ratedHistory) {
  const anchors = [];

  for (const historyItem of ratedHistory) {
    if (
      historyItem.type !== candidate.type ||
      !HISTORY_ANCHOR_RATING_MULTIPLIERS[historyItem.rating]
    ) {
      continue;
    }

    const candidateConnections = new Set(
      (candidate.connections || [])
        .filter(
          (connection) => !isIgnoredConnection(connection.type, candidate.type),
        )
        .map(getConnectionKey),
    );

    let strongScore = 0;
    const matchedConnections = [];

    for (const connection of historyItem.connections || []) {
      if (isIgnoredConnection(connection.type, historyItem.type)) {
        continue;
      }

      if (!isStrongConnection(connection.type)) {
        continue;
      }

      const key = getConnectionKey(connection);

      if (!candidateConnections.has(key)) {
        continue;
      }

      const weight = HISTORY_ANCHOR_WEIGHTS[connection.type] ?? 0;

      if (weight === 0) {
        continue;
      }

      strongScore += weight;

      matchedConnections.push({
        type: connection.type,
        value: connection.value,
        weight,
      });
    }

    if (strongScore <= 0) {
      continue;
    }

    const ratingMultiplier =
      HISTORY_ANCHOR_RATING_MULTIPLIERS[historyItem.rating];

    anchors.push({
      historyItem,
      score: strongScore * ratingMultiplier,
      strongScore,
      matchedConnections,
    });
  }

  anchors.sort((a, b) => b.score - a.score);

  const selected = anchors.slice(0, 3);

  let anchorScore = 0;

  for (let index = 0; index < selected.length; index += 1) {
    anchorScore +=
      selected[index].score * HISTORY_ANCHOR_DIMINISHING_RETURNS[index];
  }

  anchorScore = Math.min(anchorScore, MAX_HISTORY_ANCHOR_SCORE);

  return {
    score: anchorScore,
    anchors: selected,
  };
}

function hasHardNegative(candidate, connectionModel) {
  for (const connection of candidate.connections || []) {
    if (!isStrongConnection(connection.type)) {
      continue;
    }

    const key = getConnectionKey(connection);
    const data = connectionModel.get(key);

    if (!data) {
      continue;
    }

    if (data.appearances < 2) {
      continue;
    }

    if (data.confidence < 0.5) {
      continue;
    }

    if (data.explicitNegativeScore <= data.positiveScore) {
      continue;
    }

    return true;
  }

  return false;
}

function calculateMatchStrength(connections) {
  if (
    connections.some((connection) =>
      STRONG_CONNECTION_TYPES.has(connection.type),
    )
  ) {
    return "strong";
  }

  if (
    connections.some((connection) =>
      SUPPORT_CONNECTION_TYPES.has(connection.type),
    )
  ) {
    return "support";
  }

  if (
    connections.some((connection) =>
      CONTEXT_CONNECTION_TYPES.has(connection.type),
    )
  ) {
    return "context";
  }

  return "weak";
}

function buildMatchedHistory(
  candidate,
  ratedHistory,
  connectionEvidence,
  historyAnchor,
) {
  const historyMap = new Map();
  const positiveEvidence = connectionEvidence.filter(
    (evidence) => evidence.score > 0,
  );

  for (const historyItem of ratedHistory) {
    if (historyItem.type !== candidate.type) {
      continue;
    }

    const matchedConnections = [];

    for (const evidence of positiveEvidence) {
      if (isIgnoredConnection(evidence.type, candidate.type)) {
        continue;
      }

      const hasConnection = historyItem.connections?.some(
        (connection) =>
          connection.type === evidence.type &&
          connection.value === evidence.value,
      );

      if (!hasConnection) {
        continue;
      }

      matchedConnections.push({
        type: evidence.type,
        value: evidence.value,
        score: evidence.score,
        strength: evidence.strength,
      });
    }

    if (matchedConnections.length === 0) {
      continue;
    }

    const key = `${historyItem.type}:${historyItem.id}`;
    const strongConnections = matchedConnections.filter(
      (connection) => connection.strength === "strong",
    );
    const supportConnections = matchedConnections.filter(
      (connection) => connection.strength === "support",
    );
    const contextConnections = matchedConnections.filter(
      (connection) => connection.strength === "context",
    );

    historyMap.set(key, {
      title: historyItem.title,
      rating: historyItem.rating,
      score: matchedConnections.reduce(
        (sum, connection) => sum + connection.score,
        0,
      ),
      connections: matchedConnections,
      strongConnections,
      supportConnections,
      contextConnections,
      matchStrength:
        strongConnections.length > 0
          ? "strong"
          : supportConnections.length > 0
            ? "support"
            : contextConnections.length > 0
              ? "context"
              : "weak",
    });
  }

  for (const anchor of historyAnchor.anchors) {
    const historyItem = anchor.historyItem;
    const key = `${historyItem.type}:${historyItem.id}`;

    const existing = historyMap.get(key) || {
      title: historyItem.title,
      rating: historyItem.rating,
      score: 0,
      connections: [],
      strongConnections: [],
      supportConnections: [],
      contextConnections: [],
      matchStrength: "weak",
    };

    existing.anchorScore = anchor.score;
    existing.anchorStrongScore = anchor.strongScore;

    for (const connection of anchor.matchedConnections) {
      const alreadyExists = existing.connections.some(
        (existingConnection) =>
          existingConnection.type === connection.type &&
          existingConnection.value === connection.value,
      );

      if (alreadyExists) {
        continue;
      }

      const diagnosticConnection = {
        type: connection.type,
        value: connection.value,
        score: connection.weight,
        strength: "strong",
      };

      existing.connections.push(diagnosticConnection);
      existing.strongConnections.push(diagnosticConnection);
    }

    existing.matchStrength = "strong";
    historyMap.set(key, existing);
  }

  const strengthOrder = {
    strong: 3,
    support: 2,
    context: 1,
    weak: 0,
  };

  return [...historyMap.values()].sort((a, b) => {
    const strengthDifference =
      strengthOrder[b.matchStrength] - strengthOrder[a.matchStrength];

    if (strengthDifference !== 0) {
      return strengthDifference;
    }

    return Math.abs(b.score) - Math.abs(a.score);
  });
}

export function scoreCandidate(candidate, ratedHistory, connectionModel) {
  const relevantHistory = ratedHistory.filter(
    (item) =>
      item.type === candidate.type &&
      item.status === "watched" &&
      RATING_WEIGHTS[item.rating] !== undefined,
  );

  const relevantConnectionModel =
    connectionModel || buildConnectionModel(relevantHistory);

  const strongEvidence = [];
  const genreEvidence = [];
  const contextEvidence = [];
  const connectionEvidence = [];
  const seenConnections = new Set();

  for (const connection of candidate.connections || []) {
    if (isIgnoredConnection(connection.type, candidate.type)) {
      continue;
    }

    const key = getConnectionKey(connection);

    if (seenConnections.has(key)) {
      continue;
    }

    seenConnections.add(key);

    const evidence = getConnectionScore(relevantConnectionModel, connection);

    if (!evidence || evidence.score === 0) {
      continue;
    }

    const evidenceClass = getEvidenceClass(connection.type);
    const diagnosticEvidence = {
      type: connection.type,
      value: connection.value,
      score: evidence.score,
      preference: evidence.preference,
      confidence: evidence.confidence,
      appearances: evidence.appearances,
      primary: evidenceClass === "strong",
      strength: evidenceClass,
    };

    connectionEvidence.push(diagnosticEvidence);

    if (evidenceClass === "strong") {
      strongEvidence.push(evidence);
    } else if (evidenceClass === "support") {
      genreEvidence.push(diagnosticEvidence);
    } else if (evidenceClass === "context") {
      contextEvidence.push(diagnosticEvidence);
    }
  }

  let positiveStrongScore = strongEvidence
    .filter((evidence) => evidence.score > 0)
    .reduce((sum, evidence) => sum + evidence.score, 0);

  let negativeStrongScore = strongEvidence
    .filter((evidence) => evidence.score < 0)
    .reduce((sum, evidence) => sum + Math.abs(evidence.score), 0);

  const genreScore = aggregateGenreEvidence(genreEvidence);
  const contextScore = aggregateContextEvidence(contextEvidence);

  if (positiveStrongScore <= 0 && genreScore.positiveScore <= 0) {
    contextScore.positiveScore = 0;
  }

  if (negativeStrongScore <= 0 && genreScore.negativeScore <= 0) {
    contextScore.negativeScore = 0;
  }

  const historyAnchor = calculateHistoryAnchor(candidate, relevantHistory);

  const positiveScore =
    positiveStrongScore +
    genreScore.positiveScore +
    contextScore.positiveScore +
    historyAnchor.score;

  const negativeScore =
    negativeStrongScore + genreScore.negativeScore + contextScore.negativeScore;

  const recommendationScore = positiveScore - negativeScore;
  const hardNegative = hasHardNegative(candidate, relevantConnectionModel);
  const finalScore = hardNegative
    ? Math.min(recommendationScore, -Math.max(negativeScore, 1))
    : recommendationScore;

  const meaningfulPositiveEvidence =
    positiveStrongScore > 0 || genreScore.positiveScore > 0;

  if (!meaningfulPositiveEvidence) {
    positiveStrongScore = 0;
  }

  connectionEvidence.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  const matchedHistory = buildMatchedHistory(
    candidate,
    relevantHistory,
    connectionEvidence,
    historyAnchor,
  );

  return {
    ...candidate,
    recommendationScore: finalScore,
    positiveScore,
    negativeScore,
    strongScore: positiveStrongScore - negativeStrongScore,
    genreScore: genreScore.positiveScore - genreScore.negativeScore,
    contextScore: contextScore.positiveScore - contextScore.negativeScore,
    historyAnchorScore: historyAnchor.score,
    hardNegative,
    sourceEvidence: connectionEvidence.reduce(
      (sum, evidence) => sum + Math.abs(evidence.score),
      0,
    ),
    sourceCount: connectionEvidence.length,
    matchedHistory,
    connectionEvidence,
    scoreBreakdown: {
      strong: positiveStrongScore - negativeStrongScore,
      genres: genreScore.positiveScore - genreScore.negativeScore,
      context: contextScore.positiveScore - contextScore.negativeScore,
      historyAnchor: historyAnchor.score,
      negative: negativeScore,
      final: finalScore,
    },
  };
}

export function rankCandidates(candidates, ratedHistory, feedback = null) {
  const mediaTypes = new Set(
    candidates.map((candidate) => candidate.type).filter(Boolean),
  );

  const isolatedHistory = ratedHistory.filter(
    (item) =>
      mediaTypes.has(item.type) &&
      item.status === "watched" &&
      RATING_WEIGHTS[item.rating] !== undefined,
  );

  return candidates
    .map((candidate) => {
      const connectionModel = buildConnectionModel(
        isolatedHistory,
        feedback,
        candidate.type,
      );
      return scoreCandidate(candidate, isolatedHistory, connectionModel);
    })
    .sort((a, b) => b.recommendationScore - a.recommendationScore);
}

export function scoreCandidates(candidates, ratedHistory, feedback = null) {
  return rankCandidates(candidates, ratedHistory, feedback);
}
