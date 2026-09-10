import { tmdbFetch } from "../../utils/tmdbClient.js";
import { isValidCandidate } from "./candidateFilter.js";
import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";

const MAX_SOURCES_PER_TYPE = {
  franchises: 5,
  directors: 4,
  actors: 6,
  genres: 3,
  studios: 2,
};

const EXPLORATION_PAGES = 20;
const EXPLORATION_BATCHES = 3;

/*
 * Exploration is deliberately independent from taste.
 *
 * We sample across different eras instead of using popularity
 * as a proxy for quality or relevance.
 */
const EXPLORATION_YEAR_RANGES = [
  [1950, 1969],
  [1970, 1979],
  [1980, 1989],
  [1990, 1999],
  [2000, 2009],
  [2010, 2019],
  [2020, 2026],
];

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createCandidateKey(type, id) {
  return `${type}-${id}`;
}

/*
 * Known means anything the user has already classified.
 *
 * We remove these candidates from BOTH channels because
 * exploration should search unknown space too.
 */
function getKnownMediaIds(history) {
  return new Set(
    history
      .filter(
        (item) =>
          item?.id != null &&
          ["watched", "to_watch", "not_sure"].includes(item.status),
      )
      .map((item) => createCandidateKey(item.type, item.id)),
  );
}

/*
 * Add a candidate while preserving where it came from.
 *
 * A candidate can be discovered through both channels.
 * If that happens, exploitation wins because the candidate
 * has actual taste evidence.
 */
function addCandidate(candidates, media, source, mediaType) {
  if (!media?.id) {
    return;
  }

  const candidate = {
    ...media,
    type: mediaType,
  };

  if (!isValidCandidate(candidate)) {
    return;
  }

  const key = createCandidateKey(mediaType, media.id);
  const isExploration = source.type === "exploration";

  if (!candidates.has(key)) {
    candidates.set(key, {
      id: media.id,
      type: mediaType,

      title: mediaType === "movie" ? media.title : media.name,

      releaseDate:
        mediaType === "movie"
          ? media.release_date || null
          : media.first_air_date || null,

      poster_path: media.poster_path || null,
      overview: media.overview || "",
      popularity: media.popularity ?? null,

      /*
       * Keep origin information throughout the pipeline.
       */
      pool: isExploration ? "exploration" : "exploitation",

      sources: [],
    });
  }

  const existing = candidates.get(key);

  /*
   * If the candidate was discovered through an actual
   * taste connection, it belongs to exploitation.
   */
  if (!isExploration) {
    existing.pool = "exploitation";
  }

  const alreadyExists = existing.sources.some(
    (item) => item.type === source.type && item.value === source.value,
  );

  if (!alreadyExists) {
    existing.sources.push({
      type: source.type,
      value: source.value,
      evidenceScore: source.evidenceScore ?? 0,
      confidence: source.confidence ?? 0,
      appearances: source.appearances ?? 0,
    });
  }
}

/*
 * -----------------------------
 * EXPLOITATION CANDIDATES
 * -----------------------------
 */

async function discoverMovieCredits(candidates, source) {
  const data = await tmdbFetch(`/person/${source.value}/movie_credits`);

  for (const media of data.cast || []) {
    addCandidate(candidates, media, source, "movie");
  }

  for (const media of data.crew || []) {
    if (media.job !== "Director") {
      continue;
    }

    addCandidate(candidates, media, source, "movie");
  }
}

async function discoverTvCredits(candidates, source) {
  /*
   * TV actor connections are intentionally ignored.
   */
  if (source.type === "actors") {
    return;
  }

  const data = await tmdbFetch(`/person/${source.value}/tv_credits`);

  for (const media of data.cast || []) {
    addCandidate(candidates, media, source, "tv");
  }

  for (const media of data.crew || []) {
    if (!["Director", "Creator"].includes(media.job)) {
      continue;
    }

    addCandidate(candidates, media, source, "tv");
  }
}

async function discoverByPerson(candidates, source, mediaType) {
  if (mediaType === "movie") {
    await discoverMovieCredits(candidates, source);
    return;
  }

  await discoverTvCredits(candidates, source);
}

async function discoverByGenre(candidates, source, mediaType) {
  const data = await tmdbFetch(
    `/discover/${mediaType}?with_genres=${source.value}&page=1`,
  );

  for (const media of data.results || []) {
    addCandidate(candidates, media, source, mediaType);
  }
}

async function discoverByStudio(candidates, source, mediaType) {
  const data = await tmdbFetch(
    `/discover/${mediaType}?with_companies=${source.value}&page=1`,
  );

  for (const media of data.results || []) {
    addCandidate(candidates, media, source, mediaType);
  }
}

async function discoverByFranchise(candidates, source) {
  const data = await tmdbFetch(`/collection/${source.value}`);

  for (const media of data.parts || []) {
    addCandidate(candidates, media, source, "movie");
  }
}

async function generateFromSource(candidates, source, mediaType) {
  switch (source.type) {
    case "actors":
    case "directors":
      await discoverByPerson(candidates, source, mediaType);
      break;

    case "genres":
      await discoverByGenre(candidates, source, mediaType);
      break;

    case "studios":
      await discoverByStudio(candidates, source, mediaType);
      break;

    case "franchises":
      if (mediaType === "movie") {
        await discoverByFranchise(candidates, source);
      }
      break;

    default:
      break;
  }
}

/*
 * -----------------------------
 * EXPLORATION CANDIDATES
 * -----------------------------
 *
 * Exploration is intentionally unrelated to the taste model.
 *
 * For TV we must use first_air_date rather than
 * primary_release_date.
 */
async function generateExplorationCandidates(candidates, mediaType) {
  const dateField =
    mediaType === "movie" ? "primary_release_date" : "first_air_date";

  for (let i = 0; i < EXPLORATION_BATCHES; i++) {
    const [minYear, maxYear] =
      EXPLORATION_YEAR_RANGES[
        randomInteger(0, EXPLORATION_YEAR_RANGES.length - 1)
      ];

    const page = randomInteger(1, EXPLORATION_PAGES);

    const endpoint =
      `/discover/${mediaType}` +
      `?${dateField}.gte=${minYear}-01-01` +
      `&${dateField}.lte=${maxYear}-12-31` +
      `&page=${page}`;

    try {
      const data = await tmdbFetch(endpoint);

      for (const media of data.results || []) {
        addCandidate(
          candidates,
          media,
          {
            type: "exploration",
            value: `${minYear}-${maxYear}`,
            evidenceScore: 0,
            confidence: 0,
            appearances: 0,
          },
          mediaType,
        );
      }
    } catch (error) {
      console.warn(
        `Exploration source failed for ${mediaType}:`,
        error.message,
      );
    }
  }
}

/*
 * Only positive connections are used to generate
 * exploitation candidates.
 *
 * Negative connections are handled later by the scorer,
 * because they are suppression signals rather than
 * discovery signals.
 */
function getStrongConnections(profile, limit = 20) {
  const connections = [];

  for (const type of Object.keys(MAX_SOURCES_PER_TYPE)) {
    const values = profile[type] || {};

    const sources = Object.entries(values)
      .filter(([, data]) => data.evidenceScore > 0)
      .map(([value, data]) => ({
        type,
        value,

        positiveScore: data.positiveScore,
        negativeScore: data.negativeScore,

        appearances: data.appearances,
        positiveAppearances: data.positiveAppearances,
        negativeAppearances: data.negativeAppearances,

        netScore: data.netScore,
        evidenceScore: data.evidenceScore,
        confidence: data.confidence,
      }))
      .sort((a, b) => {
        if (b.evidenceScore !== a.evidenceScore) {
          return b.evidenceScore - a.evidenceScore;
        }

        return b.appearances - a.appearances;
      })
      .slice(0, MAX_SOURCES_PER_TYPE[type]);

    connections.push(...sources);
  }

  return connections
    .sort((a, b) => b.evidenceScore - a.evidenceScore)
    .slice(0, limit);
}

/*
 * Candidate discovery results are intentionally NOT
 * globally sorted by popularity or source evidence.
 *
 * The scorer needs to see BOTH channels.
 */
async function enrichCandidates(candidates) {
  const enriched = [];

  for (const candidate of candidates) {
    try {
      const metadata = await getMediaMetadata(candidate.type, candidate.id);

      if (!metadata) {
        continue;
      }

      const enrichedCandidate = {
        ...candidate,

        title: metadata.title,
        year: metadata.year,
        overview: metadata.overview,

        poster_path: metadata.poster_path || candidate.poster_path || null,

        backdrop_path: metadata.backdrop_path || null,

        actors: metadata.actors,
        directors: metadata.directors,
        genres: metadata.genres,
        keywords: metadata.keywords,
        franchises: metadata.franchises,
        studios: metadata.studios,
        language: metadata.language,

        rating: metadata.rating,
        tmdbRating: metadata.rating,
        popularity: metadata.popularity,

        connections: getMediaConnections(metadata),
      };

      if (!isValidCandidate(enrichedCandidate)) {
        continue;
      }

      enriched.push(enrichedCandidate);
    } catch (error) {
      console.warn(
        `Candidate enrichment failed for ${candidate.type}:${candidate.id}`,
        error.message,
      );
    }
  }

  return enriched;
}

export async function generateCandidates(
  profile,
  history,
  mediaType,
  limit = 100,
) {
  const strongConnections = getStrongConnections(profile);

  const knownIds = getKnownMediaIds(history);

  const candidates = new Map();

  /*
   * CHANNEL A:
   * Taste-driven exploitation.
   */
  for (const source of strongConnections) {
    try {
      await generateFromSource(candidates, source, mediaType);
    } catch (error) {
      console.warn(
        `Candidate source failed: ${source.type}:${source.value}`,
        error.message,
      );
    }
  }

  /*
   * CHANNEL B:
   * Completely independent exploration.
   */
  await generateExplorationCandidates(candidates, mediaType);

  /*
   * Remove known titles from BOTH channels.
   */
  const discovered = [...candidates.values()].filter(
    (candidate) =>
      !knownIds.has(createCandidateKey(candidate.type, candidate.id)),
  );

  const enriched = await enrichCandidates(discovered);

  /*
   * Do NOT use popularity here.
   *
   * Do NOT globally slice here.
   *
   * The recommendation scorer needs access to
   * both exploitation and exploration candidates.
   */
  const exploitation = enriched.filter(
    (candidate) => candidate.pool === "exploitation",
  );

  const exploration = enriched.filter(
    (candidate) => candidate.pool === "exploration",
  );

  /*
   * We only cap the candidate pool after enrichment.
   *
   * The cap is based on generation evidence,
   * never popularity.
   *
   * Exploration keeps its own quota.
   */
  const explorationLimit = Math.min(Math.ceil(limit * 0.4), exploration.length);

  const exploitationLimit = Math.min(limit * 2, exploitation.length);

  const rankedExploitation = exploitation
    .map((candidate) => ({
      ...candidate,
      sourceEvidence: calculateCandidateEvidence(candidate),
      sourceCount: candidate.sources.length,
    }))
    .sort((a, b) => b.sourceEvidence - a.sourceEvidence)
    .slice(0, exploitationLimit);

  const selectedExploration = exploration
    .map((candidate) => ({
      ...candidate,
      sourceEvidence: 0,
      sourceCount: 0,
    }))
    .slice(0, explorationLimit);

  console.log("CANDIDATE COUNTS:", {
    mediaType,
    discovered: discovered.length,
    enriched: enriched.length,
    exploitation: exploitation.length,
    exploration: exploration.length,
    exploitationPool: rankedExploitation.length,
    explorationPool: selectedExploration.length,
  });

  return [...rankedExploitation, ...selectedExploration];
}

function calculateCandidateEvidence(candidate) {
  return candidate.sources.reduce(
    (total, source) => total + (source.evidenceScore || 0),
    0,
  );
}
