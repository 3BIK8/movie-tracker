const RATING_WEIGHTS = {
  S: 0.08,
  A: 0.05,
  B: 0.02,
  C: 0,
  D: -0.08,
};

const LIBRARY_WEIGHTS = { watched: 0.35, to_watch: 0.45, not_sure: 0.15 };
const CONNECTION_TYPES = ["actors", "directors", "genres", "franchises", "studios", "keywords", "years", "languages", "mediaTypes", "popularity"];
const TEMPORAL_HALF_LIFE_DAYS = 180;
const FAVORITE_TEMPORAL_MULTIPLIER = 1.1;
const FEEDBACK_WEIGHTS = { skipped: -0.15, ignored: -0.25 };

function createSignal() {
  return { positiveScore: 0, negativeScore: 0, appearances: 0, positiveAppearances: 0, negativeAppearances: 0, netScore: 0, evidenceScore: 0, confidence: 0, temporalPositiveScore: 0, temporalNegativeScore: 0, temporalNetScore: 0, temporalEvidenceScore: 0 };
}
function createProfile() { return Object.fromEntries(CONNECTION_TYPES.map((type) => [type, {}])); }
function createTmdbRatingProfile() { return { buckets: {}, observations: 0 }; }
function createTemporalProfile() { return { observations: 0, recentObservations: 0, favoriteObservations: 0, averageRecencyWeight: 0 }; }
function getTmdbRatingBucket(rating) { return typeof rating === "number" ? (Math.floor(rating * 2) / 2).toFixed(1) : null; }
function addTmdbRatingSignal(profile, tmdbRating, personalRating) {
  const bucket = getTmdbRatingBucket(tmdbRating);
  if (!bucket || !Object.prototype.hasOwnProperty.call(RATING_WEIGHTS, personalRating)) return;
  if (!profile.buckets[bucket]) profile.buckets[bucket] = { observations: 0, ratingScores: { S: 0, A: 0, B: 0, C: 0, D: 0 }, averageScore: 0 };
  const data = profile.buckets[bucket];
  data.observations += 1;
  data.ratingScores[personalRating] += 1;
  data.averageScore = Object.entries(data.ratingScores).reduce((sum, [rating, count]) => sum + RATING_WEIGHTS[rating] * count, 0) / data.observations;
  profile.observations += 1;
}
function calculateConfidence(appearances) { return appearances <= 0 ? 0 : appearances / (appearances + 1); }
function calculateEvidenceScore(netScore, confidence) { return netScore === 0 || confidence <= 0 ? 0 : netScore * confidence; }
function calculateRecencyWeight(timestamp, now = Date.now()) {
  if (!timestamp) return 1;
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return 1;
  return Math.pow(0.5, Math.max(0, (now - time) / 86_400_000) / TEMPORAL_HALF_LIFE_DAYS);
}
function getInteractionTimestamp(media) { return media.lastInteractedAt || media.ratingUpdatedAt || media.favoriteAt || media.statusChangedAt || null; }
function getLibraryWeight(status) { return LIBRARY_WEIGHTS[status] ?? 0; }
function getRatingAdjustment(rating) { return RATING_WEIGHTS[rating] ?? 0; }
function addSignal(profile, type, value, baseWeight, temporalWeight = baseWeight) {
  if (value === null || value === undefined || value === "") return;
  const key = String(value);
  if (!profile[type][key]) profile[type][key] = createSignal();
  const signal = profile[type][key];
  signal.appearances += 1;
  if (baseWeight > 0) {
    signal.positiveScore += baseWeight;
    signal.positiveAppearances += 1;
    signal.temporalPositiveScore += temporalWeight;
  } else if (baseWeight < 0) {
    signal.negativeScore += Math.abs(baseWeight);
    signal.negativeAppearances += 1;
    signal.temporalNegativeScore += Math.abs(temporalWeight);
  }
  signal.netScore = signal.positiveScore - signal.negativeScore;
  signal.confidence = calculateConfidence(signal.appearances);
  signal.evidenceScore = calculateEvidenceScore(signal.netScore, signal.confidence);
  signal.temporalNetScore = signal.temporalPositiveScore - signal.temporalNegativeScore;
  signal.temporalEvidenceScore = calculateEvidenceScore(signal.temporalNetScore, signal.confidence);
}
function addMediaConnections(profile, media, baseWeight, temporalWeight) {
  for (const actor of media.actors || []) addSignal(profile, "actors", actor.id ?? actor.name, baseWeight, temporalWeight);
  for (const director of media.directors || []) addSignal(profile, "directors", director.id ?? director.name, baseWeight, temporalWeight);
  for (const genre of media.genres || []) addSignal(profile, "genres", genre.id ?? genre.name ?? genre, baseWeight, temporalWeight);
  for (const franchise of media.franchises || []) addSignal(profile, "franchises", franchise.id ?? franchise.name, baseWeight, temporalWeight);
  for (const studio of media.studios || []) addSignal(profile, "studios", studio.id ?? studio.name, baseWeight, temporalWeight);
  for (const keyword of media.keywords || []) addSignal(profile, "keywords", keyword.id ?? keyword.name, baseWeight, temporalWeight);
  if (media.year) {
    addSignal(profile, "years", media.year, baseWeight, temporalWeight);
    addSignal(profile, "years", Math.floor(media.year / 10) * 10, baseWeight, temporalWeight);
  }
  if (media.language) addSignal(profile, "languages", media.language, baseWeight, temporalWeight);
  if (media.type) addSignal(profile, "mediaTypes", media.type, baseWeight, temporalWeight);
  if (typeof media.popularity === "number") addSignal(profile, "popularity", media.popularity < 10 ? "low" : media.popularity < 50 ? "medium" : "high", baseWeight, temporalWeight);
}
function getFeedbackConnectionTarget(type) { return { actor: "actors", director: "directors", genre: "genres", franchise: "franchises", studio: "studios", keyword: "keywords", decade: "years", language: "languages", mediaType: "mediaTypes" }[type]; }
function applyFeedbackSignals(profile, feedback, mediaType, now) {
  const summary = { skipped: 0, ignored: 0, applied: 0 };
  for (const exposure of feedback?.exposures || []) {
    if (exposure.type !== mediaType) continue;
    for (const interaction of exposure.interactions || []) {
      const ratingWeight = FEEDBACK_WEIGHTS[interaction.event];
      if (ratingWeight === undefined) continue;
      const temporalWeight = ratingWeight * calculateRecencyWeight(exposure.exposedAt, now);
      for (const connection of exposure.connections || []) {
        const target = getFeedbackConnectionTarget(connection.type);
        if (!target) continue;
        addSignal(profile, target, connection.value, ratingWeight, temporalWeight);
        summary.applied += 1;
      }
      summary[interaction.event] += 1;
    }
  }
  return summary;
}
function calculateProfileStrength(profile, temporal) {
  const evidenceSignals = CONNECTION_TYPES.reduce((total, type) => total + Object.values(profile[type]).filter((signal) => signal.evidenceScore !== 0).length, 0);
  const coverage = Math.min(1, temporal.observations / 20);
  const breadth = Math.min(1, evidenceSignals / 40);
  const recency = temporal.averageRecencyWeight;
  return { score: 0.5 * coverage + 0.3 * breadth + 0.2 * recency, coverage, breadth, recency, evidenceSignals };
}
function analyzeMediaType(history, feedback, mediaType) {
  const profile = createProfile();
  const tmdbRatingProfile = createTmdbRatingProfile();
  const temporal = createTemporalProfile();
  const now = Date.now();
  for (const media of history) {
    if (!["watched", "to_watch", "not_sure"].includes(media.status)) continue;
    const baseWeight = getLibraryWeight(media.status) + getRatingAdjustment(media.rating);
    if (baseWeight === 0) continue;
    const recencyWeight = calculateRecencyWeight(getInteractionTimestamp(media), now);
    const temporalWeight = baseWeight * recencyWeight * (media.favorite ? FAVORITE_TEMPORAL_MULTIPLIER : 1);
    addMediaConnections(profile, media, baseWeight, temporalWeight);
    addTmdbRatingSignal(tmdbRatingProfile, media.tmdbRating, media.rating);
    temporal.observations += 1;
    temporal.averageRecencyWeight += recencyWeight;
    if (recencyWeight >= 0.5) temporal.recentObservations += 1;
    if (media.favorite === true) temporal.favoriteObservations += 1;
  }
  const feedbackSummary = applyFeedbackSignals(profile, feedback, mediaType, now);
  if (temporal.observations > 0) temporal.averageRecencyWeight /= temporal.observations;

  // Directors and studios are retained as metadata, but deliberately removed
  // from the recommendation profile so they cannot become retrieval sources.
  for (const type of ["directors", "studios"]) {
    for (const signal of Object.values(profile[type])) {
      signal.evidenceScore = 0;
      signal.temporalEvidenceScore = 0;
      signal.netScore = 0;
    }
  }

  return { connections: profile, tmdbRatingProfile, temporal, feedback: feedbackSummary, strength: calculateProfileStrength(profile, temporal) };
}
export function analyzeHistory(history, feedback = null) {
  return { movies: analyzeMediaType(history.filter((media) => media.type === "movie"), feedback, "movie"), tv: analyzeMediaType(history.filter((media) => media.type === "tv"), feedback, "tv") };
}
export { FAVORITE_TEMPORAL_MULTIPLIER, FEEDBACK_WEIGHTS, TEMPORAL_HALF_LIFE_DAYS, calculateRecencyWeight };
