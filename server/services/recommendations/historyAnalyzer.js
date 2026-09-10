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
  "years",
  "languages",
  "mediaTypes",
  "popularity",
];

const TEMPORAL_HALF_LIFE_DAYS = 180;
const FAVORITE_TEMPORAL_MULTIPLIER = 1.25;

function createSignal() {
  return {
    positiveScore: 0,
    negativeScore: 0,
    appearances: 0,
    positiveAppearances: 0,
    negativeAppearances: 0,
    netScore: 0,
    evidenceScore: 0,
    confidence: 0,
    temporalPositiveScore: 0,
    temporalNegativeScore: 0,
    temporalNetScore: 0,
    temporalEvidenceScore: 0,
  };
}

function createProfile() {
  return Object.fromEntries(CONNECTION_TYPES.map((type) => [type, {}]));
}

function createTmdbRatingProfile() {
  return {
    buckets: {},
    observations: 0,
  };
}

function createTemporalProfile() {
  return {
    observations: 0,
    recentObservations: 0,
    favoriteObservations: 0,
    averageRecencyWeight: 0,
  };
}

function getTmdbRatingBucket(rating) {
  if (typeof rating !== "number") {
    return null;
  }

  const bucket = Math.floor(rating * 2) / 2;

  return bucket.toFixed(1);
}

function addTmdbRatingSignal(profile, tmdbRating, personalRating) {
  const bucket = getTmdbRatingBucket(tmdbRating);

  if (
    !bucket ||
    !Object.prototype.hasOwnProperty.call(RATING_WEIGHTS, personalRating)
  ) {
    return;
  }

  if (!profile.buckets[bucket]) {
    profile.buckets[bucket] = {
      observations: 0,
      ratingScores: {
        S: 0,
        A: 0,
        B: 0,
        C: 0,
        D: 0,
      },
      averageScore: 0,
    };
  }

  const bucketData = profile.buckets[bucket];

  bucketData.observations += 1;
  bucketData.ratingScores[personalRating] += 1;

  bucketData.averageScore =
    Object.entries(bucketData.ratingScores).reduce(
      (total, [rating, count]) => total + RATING_WEIGHTS[rating] * count,
      0,
    ) / bucketData.observations;

  profile.observations += 1;
}

function calculateConfidence(appearances) {
  if (appearances <= 0) {
    return 0;
  }

  return appearances / (appearances + 1);
}

function calculateEvidenceScore(netScore, confidence) {
  if (netScore === 0 || confidence <= 0) {
    return 0;
  }

  return netScore * confidence;
}

function calculateRecencyWeight(timestamp, now = Date.now()) {
  if (!timestamp) {
    return 1;
  }

  const time = Date.parse(timestamp);

  if (!Number.isFinite(time)) {
    return 1;
  }

  const ageDays = Math.max(0, (now - time) / 86_400_000);
  return Math.pow(0.5, ageDays / TEMPORAL_HALF_LIFE_DAYS);
}

function getInteractionTimestamp(media) {
  return (
    media.lastInteractedAt ||
    media.ratingUpdatedAt ||
    media.favoriteAt ||
    media.statusChangedAt ||
    null
  );
}

function addSignal(profile, type, value, ratingWeight, temporalWeight = ratingWeight) {
  if (value === null || value === undefined || value === "") {
    return;
  }

  const key = String(value);

  if (!profile[type][key]) {
    profile[type][key] = createSignal();
  }

  const signal = profile[type][key];

  signal.appearances += 1;

  if (ratingWeight > 0) {
    signal.positiveScore += ratingWeight;
    signal.positiveAppearances += 1;
    signal.temporalPositiveScore += temporalWeight;
  } else if (ratingWeight < 0) {
    signal.negativeScore += Math.abs(ratingWeight);
    signal.negativeAppearances += 1;
    signal.temporalNegativeScore += Math.abs(temporalWeight);
  }

  signal.netScore = signal.positiveScore - signal.negativeScore;
  signal.confidence = calculateConfidence(signal.appearances);
  signal.evidenceScore = calculateEvidenceScore(
    signal.netScore,
    signal.confidence,
  );

  signal.temporalNetScore =
    signal.temporalPositiveScore - signal.temporalNegativeScore;
  signal.temporalEvidenceScore = calculateEvidenceScore(
    signal.temporalNetScore,
    signal.confidence,
  );
}

function addMediaConnections(profile, media, ratingWeight, temporalWeight) {
  for (const actor of media.actors || []) {
    addSignal(profile, "actors", actor.id ?? actor.name, ratingWeight, temporalWeight);
  }

  for (const director of media.directors || []) {
    addSignal(profile, "directors", director.id ?? director.name, ratingWeight, temporalWeight);
  }

  for (const genre of media.genres || []) {
    addSignal(profile, "genres", genre.id ?? genre.name ?? genre, ratingWeight, temporalWeight);
  }

  for (const franchise of media.franchises || []) {
    addSignal(
      profile,
      "franchises",
      franchise.id ?? franchise.name,
      ratingWeight,
      temporalWeight,
    );
  }

  for (const studio of media.studios || []) {
    addSignal(profile, "studios", studio.id ?? studio.name, ratingWeight, temporalWeight);
  }

  if (media.year) {
    addSignal(profile, "years", media.year, ratingWeight, temporalWeight);
    addSignal(
      profile,
      "years",
      Math.floor(media.year / 10) * 10,
      ratingWeight,
      temporalWeight,
    );
  }

  if (media.language) {
    addSignal(profile, "languages", media.language, ratingWeight, temporalWeight);
  }

  if (media.type) {
    addSignal(profile, "mediaTypes", media.type, ratingWeight, temporalWeight);
  }

  if (typeof media.popularity === "number") {
    const popularityBucket =
      media.popularity < 10 ? "low" : media.popularity < 50 ? "medium" : "high";

    addSignal(profile, "popularity", popularityBucket, ratingWeight, temporalWeight);
  }
}

function calculateProfileStrength(profile, temporal) {
  const evidenceSignals = CONNECTION_TYPES.reduce(
    (total, type) =>
      total +
      Object.values(profile[type]).filter(
        (signal) => signal.evidenceScore !== 0,
      ).length,
    0,
  );

  const coverage = Math.min(1, temporal.observations / 20);
  const breadth = Math.min(1, evidenceSignals / 40);
  const recency = temporal.averageRecencyWeight;
  const score = 0.5 * coverage + 0.3 * breadth + 0.2 * recency;

  return {
    score,
    coverage,
    breadth,
    recency,
    evidenceSignals,
  };
}

function analyzeMediaType(history) {
  const profile = createProfile();
  const tmdbRatingProfile = createTmdbRatingProfile();
  const temporal = createTemporalProfile();
  const now = Date.now();

  for (const media of history) {
    if (
      media.status !== "watched" ||
      !Object.prototype.hasOwnProperty.call(RATING_WEIGHTS, media.rating)
    ) {
      continue;
    }

    const ratingWeight = RATING_WEIGHTS[media.rating];

    // C is explicitly neutral: it must not create observations, confidence,
    // or evidence that can influence the taste profile.
    if (ratingWeight === 0) {
      continue;
    }

    const recencyWeight = calculateRecencyWeight(
      getInteractionTimestamp(media),
      now,
    );
    const favoriteMultiplier = media.favorite
      ? FAVORITE_TEMPORAL_MULTIPLIER
      : 1;
    const temporalWeight = ratingWeight * recencyWeight * favoriteMultiplier;

    addMediaConnections(profile, media, ratingWeight, temporalWeight);
    addTmdbRatingSignal(tmdbRatingProfile, media.tmdbRating, media.rating);

    temporal.observations += 1;
    temporal.averageRecencyWeight += recencyWeight;

    if (recencyWeight >= 0.5) {
      temporal.recentObservations += 1;
    }

    if (media.favorite === true) {
      temporal.favoriteObservations += 1;
    }
  }

  if (temporal.observations > 0) {
    temporal.averageRecencyWeight /= temporal.observations;
  }

  return {
    connections: profile,
    tmdbRatingProfile,
    temporal,
    strength: calculateProfileStrength(profile, temporal),
  };
}

export function analyzeHistory(history) {
  const movies = history.filter((media) => media.type === "movie");
  const tv = history.filter((media) => media.type === "tv");

  return {
    movies: analyzeMediaType(movies),
    tv: analyzeMediaType(tv),
  };
}

export {
  FAVORITE_TEMPORAL_MULTIPLIER,
  TEMPORAL_HALF_LIFE_DAYS,
  calculateRecencyWeight,
};
