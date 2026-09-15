const RATING_WEIGHTS = {
  S: 0.08,
  A: 0.05,
  B: 0.02,
  C: 0,
  D: -0.08,
};

const LIBRARY_WEIGHTS = {
  watched: 0.35,
  to_watch: 0.45,
  not_sure: 0.15,
};

const FEEDBACK_WEIGHTS = { skipped: -0.15, ignored: -0.25 };

// Personalization is intentionally content-first. Credits are supporting
// evidence, not taste labels; studios and directors are not taste signals.
const CHANNEL_CAPS = {
  franchise: 0.55,
  actor: 0.12,
  studio: 0,
  director: 0,
  genre: 0.8,
  keyword: 0.95,
  decade: 0.08,
  language: 0.04,
};

const STRONG_CONNECTION_TYPES = new Set(["franchise"]);
const SUPPORT_CONNECTION_TYPES = new Set(["genre", "keyword"]);
const CONTEXT_CONNECTION_TYPES = new Set(["decade", "language"]);
const EXPOSURE_DECAY_DAYS = 14;
const EXPOSURE_MULTIPLIER_STEP = 0.18;
const MIN_EXPOSURE_MULTIPLIER = 0.15;
const IMPRESSION_COOLDOWN_DAYS = 90;
const QUALITY_FLOOR = 5.8;
const QUALITY_CEILING = 8.5;
const MAX_QUALITY_BONUS = 0.8;
const MAX_NEGATIVE_SCORE = 1.5;
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

function getLibraryWeight(item) {
  return LIBRARY_WEIGHTS[item?.status] ?? 0;
}

function getRatingAdjustment(item) {
  return RATING_WEIGHTS[item?.rating] ?? 0;
}

function buildConnectionModel(history, feedback = null, mediaType = null) {
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

  for (const item of history) {
    if (item?.type !== mediaType) continue;
    const weight = getLibraryWeight(item) + getRatingAdjustment(item);
    if (weight === 0) continue;

    for (const connection of item.connections || []) {
      if (isIgnoredConnection(connection.type, item.type)) continue;
      const data = ensure(connection);
      data.totalScore += weight;
      data.appearances += 1;
      if (weight > 0) {
        data.positiveScore += weight;
      } else {
        data.negativeScore += Math.abs(weight);
        if (getRatingAdjustment(item) < 0) data.explicitNegativeScore += Math.abs(getRatingAdjustment(item));
        else data.implicitNegativeScore += Math.abs(weight);
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
    data.confidence = data.appearances / (data.appearances + 2);
    const average = data.totalScore / data.appearances;
    data.preference = average * (0.35 + 0.5 * data.confidence);
  }
  return model;
}

function scoreConnection(data) {
  return Math.max(-1, Math.min(1, data.preference));
}

function aggregateChannelEvidence(evidence, type) {
  const cap = CHANNEL_CAPS[type] ?? 0;
  if (cap <= 0) return { positiveScore: 0, negativeScore: 0 };

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
  return {
    positiveScore: Math.min(positive * cap, cap),
    negativeScore: Math.min(negative * cap, cap),
  };
}

function getExposurePenalty(candidate, feedback) {
  const exposures = (feedback?.exposures || []).filter(
    (exposure) => exposure.type === candidate.type && String(exposure.id) === String(candidate.id),
  );
  if (!exposures.length) return { count: 0, weightedCount: 0, multiplier: 1, penalty: 0 };

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
  const multiplier = Math.max(MIN_EXPOSURE_MULTIPLIER, 1 - weightedCount * EXPOSURE_MULTIPLIER_STEP);
  return { count: exposures.length, weightedCount, multiplier, penalty: 1 - multiplier };
}

function calculateQualityBonus(candidate) {
  const rating = Number(candidate.tmdbRating ?? candidate.rating);
  if (!Number.isFinite(rating) || rating <= QUALITY_FLOOR) return 0;
  return ((Math.min(QUALITY_CEILING, rating) - QUALITY_FLOOR) /
    (QUALITY_CEILING - QUALITY_FLOOR)) * MAX_QUALITY_BONUS;
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

function buildMatchedHistory(candidate, history, connectionEvidence) {
  const positive = connectionEvidence.filter((item) => item.score > 0);
  const matches = new Map();
  for (const historyItem of history) {
    if (historyItem.type !== candidate.type) continue;
    const matched = positive.filter((evidence) =>
      (historyItem.connections || []).some(
        (connection) => connection.type === evidence.type && connection.value === evidence.value,
      ),
    );
    if (!matched.length) continue;
    matches.set(`${historyItem.type}:${historyItem.id}`, {
      title: historyItem.title,
      rating: historyItem.rating,
      score: matched.reduce((sum, item) => sum + item.score, 0),
      connections: matched,
      strongConnections: matched.filter((item) => item.strength === "strong"),
      supportConnections: matched.filter((item) => item.strength === "support"),
      contextConnections: matched.filter((item) => item.strength === "context"),
      matchStrength: matched.some((item) => item.strength === "strong") ? "strong" : "support",
    });
  }
  return [...matches.values()].sort((a, b) => b.score - a.score);
}

function getSuppressedRecommendationKeys(feedback, now = Date.now()) {
  const suppressed = new Set();
  const cooldownMs = IMPRESSION_COOLDOWN_DAYS * 86_400_000;

  for (const exposure of feedback?.exposures || []) {
    if (!["movie", "tv"].includes(exposure?.type)) continue;

    const key = `${exposure.type}:${String(exposure.id)}`;
    const hasPermanentNegative = (exposure.interactions || []).some(
      (interaction) => ["ignored", "not_interested"].includes(interaction?.event),
    );
    if (hasPermanentNegative) {
      suppressed.add(key);
      continue;
    }

    const exposedAt = Date.parse(exposure.exposedAt);
    if (!Number.isFinite(exposedAt) || now - exposedAt < cooldownMs) {
      suppressed.add(key);
    }
  }

  return suppressed;
}

export function scoreCandidate(candidate, history, connectionModel = null, feedback = null) {
  const relevantHistory = history.filter(
    (item) => item.type === candidate.type && ["watched", "to_watch", "not_sure"].includes(item.status),
  );
  const model = connectionModel || buildConnectionModel(relevantHistory, feedback, candidate.type);
  const connectionEvidence = [];

  for (const connection of candidate.connections || []) {
    if (isIgnoredConnection(connection.type, candidate.type)) continue;
    const data = model.get(getConnectionKey(connection));
    if (!data || data.preference === 0) continue;
    const evidenceClass = getEvidenceClass(connection.type);
    const normalizedScore = scoreConnection(data);
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
  for (const type of new Set(connectionEvidence.map((item) => item.type))) {
    channelScores[type] = aggregateChannelEvidence(connectionEvidence, type);
  }

  let positiveConnectionScore = 0;
  let negativeConnectionScore = 0;
  for (const score of Object.values(channelScores)) {
    positiveConnectionScore += score.positiveScore;
    negativeConnectionScore += score.negativeScore;
  }

  const qualityBonus = calculateQualityBonus(candidate);
  const qualityContribution = qualityBonus;
  const basePositiveScore = positiveConnectionScore + qualityContribution;
  const negativeScore = Math.min(MAX_NEGATIVE_SCORE, negativeConnectionScore);
  const exposure = getExposurePenalty(candidate, feedback);
  const rawScore = basePositiveScore - negativeScore;
  const exposedScore = rawScore * exposure.multiplier;
  const hardNegative = hasHardNegative(candidate, model);
  const finalScore = hardNegative ? Math.min(exposedScore, -Math.max(negativeScore, 1)) : exposedScore;

  connectionEvidence.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const matchedHistory = buildMatchedHistory(candidate, relevantHistory, connectionEvidence);

  return {
    ...candidate,
    recommendationScore: finalScore,
    positiveScore: basePositiveScore,
    negativeScore,
    strongScore: channelScores.franchise ? channelScores.franchise.positiveScore - channelScores.franchise.negativeScore : 0,
    genreScore: (channelScores.genre?.positiveScore || 0) - (channelScores.genre?.negativeScore || 0),
    contextScore: ["decade", "language"].reduce((sum, type) => sum + (channelScores[type]?.positiveScore || 0) - (channelScores[type]?.negativeScore || 0), 0),
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

export function rankCandidates(candidates, history, feedback = null) {
  const mediaTypes = new Set(candidates.map((candidate) => candidate.type).filter(Boolean));
  const isolatedHistory = history.filter((item) => mediaTypes.has(item.type) && ["watched", "to_watch", "not_sure"].includes(item.status));
  const models = new Map();
  for (const type of mediaTypes) {
    models.set(type, buildConnectionModel(isolatedHistory.filter((item) => item.type === type), feedback, type));
  }
  const suppressedKeys = getSuppressedRecommendationKeys(feedback);

  return candidates
    .filter((candidate) => !suppressedKeys.has(`${candidate.type}:${String(candidate.id)}`))
    .map((candidate) => scoreCandidate(candidate, isolatedHistory, models.get(candidate.type), feedback))
    .sort((a, b) =>
      b.recommendationScore !== a.recommendationScore
        ? b.recommendationScore - a.recommendationScore
        : `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`),
    );
}

export function scoreCandidates(candidates, history, feedback = null) {
  return rankCandidates(candidates, history, feedback);
}

export const RECOMMENDATION_SCORING_POLICY = Object.freeze({
  ratingWeights: RATING_WEIGHTS,
  libraryWeights: LIBRARY_WEIGHTS,
  channelCaps: CHANNEL_CAPS,
  qualityFloor: QUALITY_FLOOR,
  qualityCeiling: QUALITY_CEILING,
  maxQualityBonus: MAX_QUALITY_BONUS,
  exposureDecayDays: EXPOSURE_DECAY_DAYS,
  minExposureMultiplier: MIN_EXPOSURE_MULTIPLIER,
  impressionCooldownDays: IMPRESSION_COOLDOWN_DAYS,
});
