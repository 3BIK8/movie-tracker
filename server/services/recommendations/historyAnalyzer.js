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

function addSignal(profile, type, value, ratingWeight) {
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
  } else if (ratingWeight < 0) {
    signal.negativeScore += Math.abs(ratingWeight);

    signal.negativeAppearances += 1;
  }

  signal.netScore = signal.positiveScore - signal.negativeScore;

  signal.confidence = calculateConfidence(signal.appearances);

  signal.evidenceScore = calculateEvidenceScore(
    signal.netScore,
    signal.confidence,
  );
}

function addMediaConnections(profile, media, ratingWeight) {
  for (const actor of media.actors || []) {
    addSignal(profile, "actors", actor.id ?? actor.name, ratingWeight);
  }

  for (const director of media.directors || []) {
    addSignal(profile, "directors", director.id ?? director.name, ratingWeight);
  }

  for (const genre of media.genres || []) {
    addSignal(profile, "genres", genre.id ?? genre.name ?? genre, ratingWeight);
  }

  for (const franchise of media.franchises || []) {
    addSignal(
      profile,
      "franchises",
      franchise.id ?? franchise.name,
      ratingWeight,
    );
  }

  for (const studio of media.studios || []) {
    addSignal(profile, "studios", studio.id ?? studio.name, ratingWeight);
  }

  if (media.year) {
    addSignal(profile, "years", media.year, ratingWeight);

    addSignal(profile, "years", Math.floor(media.year / 10) * 10, ratingWeight);
  }

  if (media.language) {
    addSignal(profile, "languages", media.language, ratingWeight);
  }

  if (media.type) {
    addSignal(profile, "mediaTypes", media.type, ratingWeight);
  }

  if (typeof media.popularity === "number") {
    const popularityBucket =
      media.popularity < 10 ? "low" : media.popularity < 50 ? "medium" : "high";

    addSignal(profile, "popularity", popularityBucket, ratingWeight);
  }
}

function analyzeMediaType(history) {
  const profile = createProfile();
  const tmdbRatingProfile = createTmdbRatingProfile();

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

    addMediaConnections(profile, media, ratingWeight);

    addTmdbRatingSignal(tmdbRatingProfile, media.tmdbRating, media.rating);
  }

  return {
    connections: profile,
    tmdbRatingProfile,
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
