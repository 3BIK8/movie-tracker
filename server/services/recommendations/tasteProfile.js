const TASTE_PROFILE_VERSION = 1;

const DIMENSIONS = [
  "actors",
  "directors",
  "genres",
  "franchises",
  "studios",
  "keywords",
  "years",
  "languages",
  "mediaTypes",
  "popularity",
];

const PROFILE_TYPES = ["movies", "tv"];

function getDirection(netScore) {
  if (netScore > 0) {
    return "positive";
  }

  if (netScore < 0) {
    return "negative";
  }

  return "neutral";
}

function normalizeSignal(signal) {
  const netScore = Number.isFinite(signal?.netScore) ? signal.netScore : 0;
  const confidence = Number.isFinite(signal?.confidence)
    ? Math.max(0, Math.min(1, signal.confidence))
    : 0;
  const appearances = Number.isInteger(signal?.appearances)
    ? Math.max(0, signal.appearances)
    : 0;
  const temporalNetScore = Number.isFinite(signal?.temporalNetScore)
    ? signal.temporalNetScore
    : netScore;
  const temporalEvidenceScore = Number.isFinite(signal?.temporalEvidenceScore)
    ? signal.temporalEvidenceScore
    : 0;

  return {
    direction: getDirection(netScore),
    netScore,
    evidenceScore: Number.isFinite(signal?.evidenceScore)
      ? signal.evidenceScore
      : 0,
    confidence,
    appearances,
    positiveAppearances: Number.isInteger(signal?.positiveAppearances)
      ? Math.max(0, signal.positiveAppearances)
      : 0,
    negativeAppearances: Number.isInteger(signal?.negativeAppearances)
      ? Math.max(0, signal.negativeAppearances)
      : 0,
    temporalNetScore,
    temporalEvidenceScore,
  };
}

function normalizeDimensions(connections) {
  return Object.fromEntries(
    DIMENSIONS.map((dimension) => {
      const source = connections?.[dimension] || {};
      const normalized = {};

      for (const [value, signal] of Object.entries(source)) {
        normalized[String(value)] = normalizeSignal(signal);
      }

      return [dimension, normalized];
    }),
  );
}

function calculateUncertainty(dimensions) {
  const signals = Object.values(dimensions).flatMap((dimension) =>
    Object.values(dimension),
  );

  if (signals.length === 0) {
    return {
      score: 1,
      signals: 0,
      lowConfidenceSignals: 0,
    };
  }

  const confidenceSum = signals.reduce(
    (sum, signal) => sum + signal.confidence,
    0,
  );
  const lowConfidenceSignals = signals.filter(
    (signal) => signal.confidence < 0.5,
  ).length;

  return {
    score: 1 - confidenceSum / signals.length,
    signals: signals.length,
    lowConfidenceSignals,
  };
}

function normalizeTemporal(temporal) {
  return {
    observations: Number.isInteger(temporal?.observations)
      ? Math.max(0, temporal.observations)
      : 0,
    recentObservations: Number.isInteger(temporal?.recentObservations)
      ? Math.max(0, temporal.recentObservations)
      : 0,
    favoriteObservations: Number.isInteger(temporal?.favoriteObservations)
      ? Math.max(0, temporal.favoriteObservations)
      : 0,
    averageRecencyWeight: Number.isFinite(temporal?.averageRecencyWeight)
      ? Math.max(0, Math.min(1, temporal.averageRecencyWeight))
      : 0,
  };
}

function normalizeStrength(strength) {
  return {
    score: Number.isFinite(strength?.score)
      ? Math.max(0, Math.min(1, strength.score))
      : 0,
    coverage: Number.isFinite(strength?.coverage)
      ? Math.max(0, Math.min(1, strength.coverage))
      : 0,
    breadth: Number.isFinite(strength?.breadth)
      ? Math.max(0, Math.min(1, strength.breadth))
      : 0,
    recency: Number.isFinite(strength?.recency)
      ? Math.max(0, Math.min(1, strength.recency))
      : 0,
    evidenceSignals: Number.isInteger(strength?.evidenceSignals)
      ? Math.max(0, strength.evidenceSignals)
      : 0,
  };
}

function normalizeMediaProfile(analysis) {
  const dimensions = normalizeDimensions(analysis?.connections);

  return {
    dimensions,
    tmdbRatingProfile: analysis?.tmdbRatingProfile || {
      buckets: {},
      observations: 0,
    },
    temporal: normalizeTemporal(analysis?.temporal),
    strength: normalizeStrength(analysis?.strength),
    uncertainty: calculateUncertainty(dimensions),
    feedback: {
      skipped: analysis?.feedback?.skipped || 0,
      ignored: analysis?.feedback?.ignored || 0,
      applied: analysis?.feedback?.applied || 0,
    },
  };
}

export function createTasteProfile(analysis) {
  return {
    version: TASTE_PROFILE_VERSION,
    dimensions: [...DIMENSIONS],
    mediaTypes: {
      movies: normalizeMediaProfile(analysis?.movies),
      tv: normalizeMediaProfile(analysis?.tv),
    },
  };
}

export function assertTasteProfile(profile) {
  if (!profile || profile.version !== TASTE_PROFILE_VERSION) {
    throw new TypeError("Invalid taste profile version.");
  }

  if (!Array.isArray(profile.dimensions)) {
    throw new TypeError("Taste profile dimensions must be an array.");
  }

  for (const dimension of DIMENSIONS) {
    if (!profile.dimensions.includes(dimension)) {
      throw new TypeError(`Taste profile is missing dimension: ${dimension}.`);
    }
  }

  for (const type of PROFILE_TYPES) {
    if (!profile.mediaTypes?.[type]) {
      throw new TypeError(`Taste profile is missing media type: ${type}.`);
    }
  }

  return true;
}

export {
  DIMENSIONS,
  PROFILE_TYPES,
  TASTE_PROFILE_VERSION,
};
