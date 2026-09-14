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

const CHANNEL_WEIGHTS = {
  franchise: 0.9,
  actor: 0.7,
  studio: 0.45,
  director: 0.4,
  genre: 0.65,
  keyword: 0.5,
  decade: 0.2,
  language: 0.1,
};

const CHANNEL_CAPS = {
  franchise: 0.9,
  actor: 0.7,
  studio: 0.45,
  director: 0.4,
  genre: 0.65,
  keyword: 0.5,
  decade: 0.2,
  language: 0.1,
};

const STRONG_CONNECTION_TYPES = new Set([
  "franchise",
  "actor",
  "studio",
  "director",
]);
const SUPPORT_CONNECTION_TYPES = new Set(["genre", "keyword"]);
const CONTEXT_CONNECTION_TYPES = new Set(["decade", "language"]);

const EXPOSURE_DECAY_DAYS = 14;
const EXPOSURE_MULTIPLIER_STEP = 0.18;
const MIN_EXPOSURE_MULTIPLIER = 0.15;
const QUALITY_FLOOR = 5.8;
const QUALITY_CEILING = 8.5;
const MAX_QUALITY_BONUS = 0.55;
const MAX_NEGATIVE_SCORE = 2.5;
const DIMINISHING_RETURNS = [1, 0.55, 0.3, 0.18];

function getConnectionKey(connection) {
  return `${connection.type}:${connection.value}`;
}

function isIgnoredConnection(type, mediaType) {
  return mediaType === "tv" && type === "actor";
}

function getEvidenceClass(type) {
  if (STRONG_CONNECTION_TYPES.has(type)) return "strong";
  if (SUPPORT_CONNECTION_TYPES.has(type)) return "support";
  if (CONTEXT_CONNECTION_TYPES.has(type)) return "context";
  return "other";
}

function buildConnectionModel(ratedHistory, feedback = null, mediaType = null) {
  const model = new Map();

  const ensure = (connection) => {
    const key = getConnectionKey(connection);
    if (!model.has(key)) {
      model.set(key, {
        type: connection.type,
        value: connection.value,
        totalScore: 0,
        appearances: 0,
        positiveScore: 0,
        negativeScore: 0,
        explicitNegativeScore: 0,
        implicitNegativeScore: 0,
      });
    }
    return model.get(key);
  };

  for (const item of ratedHistory) {
    const weight = RATING_WEIGHTS[item.rating];
    if (weight === undefined || weight === 0) continue;

    for (const connection of item.connections || []) {
      if (isIgnoredConnection(connection.type, item.type)) continue;
      const data = ensure(connection);
      data.totalScore += weight;
      data.appearances += 1;
      if (weight > 0) data.positiveScore += weight;
      else {
        data.negativeScore += Math.abs(weight);
        data.explicitNegativeScore += Math.abs(weight);
      }
    }
  }

  for (const exposure of feedback?.exposures || []) {
    if (mediaType && exposure.type !== mediaType) continue;

    for (const interaction of exposure.interactions || []) {
      const weight = FEEDBACK_WEIGHTS[interaction.event];
      if (weight === undefined) continue;

      for (const connection of exposure.connections || []) {
        if (isIgnoredConnection(connection.type, exposure.type)) continue;
        const data = ensure(connection);
        data.totalScore += weight;
        data.appearances += 1;
        data.negativeScore += Math.abs(weight);
        data.implicitNegativeScore += Math.abs(weight);
      }
    }
  }

  for (const data of model.values()) {
    const confidence = data.appearances / (data.appearances + 2);
    data.confidence = confidence;
    data.preference = (data.totalScore / data.appearances) * confidence;
  }

  return model;
}

function getChannelScales(model) {
  const scales = new Map();
  for (const data of model.values()) {
    const weight = CHANNEL_WEIGHTS[data.type] ?? 0;
    const magnitude = Math.abs(data.preference * weight);
    scales.set(data.type, Math.max(scales.get(data.type) || 0, magnitude));
  }
  return scales;
}

function scoreConnection(data, scale) {
  const raw = data.preference * (CHANNEL_WEIGHTS[data.type] ?? 0);
  if (!scale) return 0;
  return Math.max(-1, Math.min(1, raw / scale));
}

function aggregateChannelEvidence(evidence, type, scale) {
  const values = evidence
    .filter((item) => item.type === type)
    .sort((a, b) => Math.abs(b.normalizedScore) - Math.abs(a.normalizedScore));

  let positive = 0;
  let negative = 0;

  for (let index = 0; index < values.length; index += 1) {
    const contribution = values[index].normalizedScore * (DIMINISHING_RETURNS[index] || 0.12);
    if (contribution > 0) positive += contribution;
    else negative += Math.abs(contribution);
  }

  const cap = CHANNEL_CAPS[type] ?? scale;
  return {
    positiveScore: Math.min(positive * scale, cap),
    negativeScore: Math.min(negative * scale, cap),
  };
}

function getExposurePenalty(candidate, feedback) {
  const exposures = (feedback?.exposures || []).filter(
    (exposure) =>
      exposure.type === candidate.type && String(exposure.id) === String(candidate.id),
  );

  if (exposures.length === 0) {
    return { count: 0, weightedCount: 0, multiplier: 1, penalty: 0 };
  }

  const now = Date.now();
  let weightedCount = 0;
  for (const exposure of exposures) {
    const timestamp = Date.parse(exposure.exposedAt);
    if (!Number.isFinite(timestamp)) {
      weightedCount += 1;
      continue;
    }
    const ageDays = Math.max(0, (now - timestamp) / 86_400_000);
    weightedCount += Math.pow(0.5, ageDays / EXPOSURE_DECAY_DAYS);
  }

  const multiplier = Math.max(
    MIN_EXPOSURE_MULTIPLIER,
    1 - weightedCount * EXPOSURE_MULTIPLIER_STEP,
  );

  return {
    count: exposures.length,
    weightedCount,
    multiplier,
    penalty: 1 - multiplier,
  };
}

function calculateQualityBonus(candidate) {
  const rating = Number(candidate.tmdbRating ?? candidate.rating);
  if (!Number.isFinite(rating) || rating <= QUALITY_FLOOR) return 0;
  return (
    Math.min(QUALITY_CEILING, rating) - QUALITY_FLOOR
  ) / (QUALITY_CEILING - QUALITY_FLOOR) * MAX_QUALITY_BONUS;
}

function hasHardNegative(candidate, model) {
  for (const connection of candidate.connections || []) {
    if (!STRONG_CONNECTION_TYPES.has(connection.type)) continue;
    const data = model.get(getConnectionKey(connection));
    if (!data || data.appearances < 2 || data.confidence < 0.5) continue;
    if (data.explicitNegativeScore > data.positiveScore) return true;
  }
  return false;
}

function buildMatchedHistory(candidate, ratedHistory, connectionEvidence) {
  const positive = connectionEvidence.filter((item) => item.score > 0);
  const matches = new Map();

  for (const historyItem of ratedHistory) {
    if (historyItem.type !== candidate.type) continue;
    const matched = positive.filter((evidence) =>
      (historyItem.connections || []).some(
        (connection) =>
          connection.type === evidence.type && connection.value === evidence.value,
      ),
    );
    if (!matched.length) continue;

    const key = `${historyItem.type}:${historyItem.id}`;
    matches.set(key, {
      title: historyItem.title,
      rating: historyItem.rating,
      score: matched.reduce((sum, item) => sum + item.score, 0),
      connections: matched,
      strongConnections: matched.filter((item) => item.strength === "strong"),
      supportConnections: matched.filter((item) => item.strength === "support"),
      contextConnections: matched.filter((item) => item.strength === "context"),
      matchStrength: matched.some((item) => item.strength === "strong")
        ? "strong"
        : matched.some((item) => item.strength === "support")
          ? "support"
          : "context",
    });
  }

  return [...matches.values()].sort((a, b) => b.score - a.score);
}

export function scoreCandidate(candidate, ratedHistory, connectionModel = null, feedback = null) {
  const relevantHistory = ratedHistory.filter(
    (item) =>
      item.type === candidate.type &&
      item.status === "watched" &&
      RATING_WEIGHTS[item.rating] !== undefined,
  );
  const model = connectionModel || buildConnectionModel(relevantHistory, feedback, candidate.type);
  const scales = getChannelScales(model);
  const connectionEvidence = [];

  for (const connection of candidate.connections || []) {
    if (isIgnoredConnection(connection.type, candidate.type)) continue;
    const data = model.get(getConnectionKey(connection));
    if (!data || data.preference === 0) continue;

    const evidenceClass = getEvidenceClass(connection.type);
    const normalizedScore = scoreConnection(data, scales.get(connection.type));
    connectionEvidence.push({
      type: connection.type,
      value: connection.value,
      score: normalizedScore * (CHANNEL_CAPS[connection.type] ?? 0),
      normalizedScore,
      preference: data.preference,
      confidence: data.confidence,
      appearances: data.appearances,
      primary: evidenceClass === "strong",
      strength: evidenceClass,
    });
  }

  const channelScores = {};
  const channelTypes = new Set(connectionEvidence.map((item) => item.type));
  for (const type of channelTypes) {
    channelScores[type] = aggregateChannelEvidence(
      connectionEvidence,
      type,
      CHANNEL_CAPS[type] ?? 0,
    );
  }

  let positiveConnectionScore = 0;
  let negativeConnectionScore = 0;
  for (const score of Object.values(channelScores)) {
    positiveConnectionScore += score.positiveScore;
    negativeConnectionScore += score.negativeScore;
  }

  const qualityBonus = calculateQualityBonus(candidate);
  const hasTasteEvidence = positiveConnectionScore > 0;
  const qualityContribution = hasTasteEvidence ? qualityBonus : 0;
  const basePositiveScore = positiveConnectionScore + qualityContribution;
  const negativeScore = Math.min(MAX_NEGATIVE_SCORE, negativeConnectionScore);
  const exposure = getExposurePenalty(candidate, feedback);
  const rawScore = basePositiveScore - negativeScore;
  const exposedScore = rawScore * exposure.multiplier;
  const hardNegative = hasHardNegative(candidate, model);
  const finalScore = hardNegative
    ? Math.min(exposedScore, -Math.max(negativeScore, 1))
    : exposedScore;

  const matchedHistory = buildMatchedHistory(
    candidate,
    relevantHistory,
    connectionEvidence,
  );

  connectionEvidence.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  return {
    ...candidate,
    recommendationScore: finalScore,
    positiveScore: basePositiveScore,
    negativeScore,
    strongScore: ["franchise", "actor", "studio", "director"]
      .reduce((sum, type) => sum + (channelScores[type]?.positiveScore || 0) - (channelScores[type]?.negativeScore || 0), 0),
    genreScore: (channelScores.genre?.positiveScore || 0) - (channelScores.genre?.negativeScore || 0),
    contextScore: ["decade", "language"]
      .reduce((sum, type) => sum + (channelScores[type]?.positiveScore || 0) - (channelScores[type]?.negativeScore || 0), 0),
    historyAnchorScore: 0,
    hardNegative,
    exposureCount: exposure.count,
    exposurePenalty: exposure.penalty,
    exposureMultiplier: exposure.multiplier,
    qualityBonus,
    sourceEvidence: connectionEvidence.reduce((sum, evidence) => sum + Math.abs(evidence.score), 0),
    sourceCount: connectionEvidence.length,
    matchedHistory,
    connectionEvidence,
    scoreBreakdown: {
      channels: channelScores,
      quality: qualityContribution,
      negative: negativeScore,
      exposureMultiplier: exposure.multiplier,
      exposurePenalty: exposure.penalty,
      final: finalScore,
    },
  };
}

export function rankCandidates(candidates, ratedHistory, feedback = null) {
  const mediaTypes = new Set(candidates.map((candidate) => candidate.type).filter(Boolean));
  const isolatedHistory = ratedHistory.filter(
    (item) =>
      mediaTypes.has(item.type) &&
      item.status === "watched" &&
      RATING_WEIGHTS[item.rating] !== undefined,
  );

  const models = new Map();
  for (const type of mediaTypes) {
    const history = isolatedHistory.filter((item) => item.type === type);
    models.set(type, buildConnectionModel(history, feedback, type));
  }

  return candidates
    .map((candidate) =>
      scoreCandidate(candidate, isolatedHistory, models.get(candidate.type), feedback),
    )
    .sort((a, b) => {
      if (b.recommendationScore !== a.recommendationScore) {
        return b.recommendationScore - a.recommendationScore;
      }
      return `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`);
    });
}

export function scoreCandidates(candidates, ratedHistory, feedback = null) {
  return rankCandidates(candidates, ratedHistory, feedback);
}

export const RECOMMENDATION_SCORING_POLICY = Object.freeze({
  channelWeights: CHANNEL_WEIGHTS,
  channelCaps: CHANNEL_CAPS,
  qualityFloor: QUALITY_FLOOR,
  qualityCeiling: QUALITY_CEILING,
  maxQualityBonus: MAX_QUALITY_BONUS,
  exposureDecayDays: EXPOSURE_DECAY_DAYS,
  minExposureMultiplier: MIN_EXPOSURE_MULTIPLIER,
});
