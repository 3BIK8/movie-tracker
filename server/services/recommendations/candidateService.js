import { tmdbFetch } from "../../utils/tmdbClient.js";
import { isValidCandidate } from "./candidateFilter.js";
import { getMediaMetadata } from "./mediaMetadataService.js";

const MAX_SOURCES_PER_TYPE = {
  franchises: 5,
  directors: 4,
  actors: 6,
  genres: 3,
  studios: 2,
};

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

function getKnownMediaIds(history) {
  return new Set(
    history
      .filter(
        (item) =>
          item?.id != null &&
          ["watched", "to_watch", "not_sure"].includes(item.status),
      )
      .map((item) => `${item.type}-${item.id}`),
  );
}

function createCandidateKey(type, id) {
  return `${type}-${id}`;
}

function addCandidate(candidates, media, source, mediaType) {
  if (!media?.id) {
    return;
  }
  console.log(
    "CANDIDATE DISCOVERED:",
    mediaType,
    media.id,
    media.title || media.name,
    "SOURCE:",
    source.type,
    source.value,
  );
  const candidate = {
    ...media,
    type: mediaType,
  };

  if (!isValidCandidate(candidate)) {
    return;
  }

  const key = createCandidateKey(mediaType, media.id);

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

      sources: [],
    });
  }

  const existing = candidates.get(key);

  const alreadyExists = existing.sources.some(
    (item) => item.type === source.type && item.value === source.value,
  );

  if (!alreadyExists) {
    existing.sources.push({
      type: source.type,
      value: source.value,
      evidenceScore: source.evidenceScore,
      confidence: source.confidence,
      appearances: source.appearances,
    });
  }
}

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
  // TV actor connections are intentionally ignored.
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

function calculateCandidateEvidence(candidate) {
  return candidate.sources.reduce(
    (total, source) => total + source.evidenceScore,
    0,
  );
}

/*
 * Candidate discovery gives us cheap TMDB search
 * results, but those results do not necessarily
 * contain the complete metadata needed by the
 * scorer.
 *
 * We therefore enrich candidates before returning
 * them.
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

        popularity: metadata.popularity,

        tmdbRating: metadata.rating,
      };

      if (!isValidCandidate(enrichedCandidate)) {
        continue;
      }

      enriched.push(enrichedCandidate);
    } catch (error) {
      console.warn(
        `Candidate enrichment failed: ${candidate.type}:${candidate.id}`,
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

  const discovered = [...candidates.values()].filter(
    (candidate) =>
      !knownIds.has(createCandidateKey(candidate.type, candidate.id)),
  );

  const enriched = await enrichCandidates(discovered);

  console.log("CANDIDATE COUNTS:", {
    mediaType,
    discovered: discovered.length,
    enriched: enriched.length,
  });

  const ranked = enriched
    .map((candidate) => ({
      ...candidate,
      sourceEvidence: calculateCandidateEvidence(candidate),
      sourceCount: candidate.sources.length,
    }))
    .sort((a, b) => {
      if (b.sourceEvidence !== a.sourceEvidence) {
        return b.sourceEvidence - a.sourceEvidence;
      }

      return (b.popularity || 0) - (a.popularity || 0);
    });

  // Randomize the complete candidate pool.
  // This is temporary until we implement proper
  // diversity and recommendation exposure tracking.
  const randomized = [...ranked];

  for (let i = randomized.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));

    [randomized[i], randomized[randomIndex]] = [
      randomized[randomIndex],
      randomized[i],
    ];
  }

  return randomized.slice(0, limit);
}
