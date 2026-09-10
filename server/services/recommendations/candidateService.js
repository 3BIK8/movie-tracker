import { tmdbFetch } from "../../utils/tmdbClient.js";
import { isValidCandidate } from "./candidateFilter.js";
import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { mapWithConcurrency } from "../../utils/runWithConcurrency.js";
import { buildExplorationQueries } from "./explorationStrategy.js";

const MAX_SOURCES_PER_TYPE = {
  franchises: 5,
  directors: 4,
  actors: 6,
  genres: 3,
  studios: 2,
};

const EXPLORATION_BATCHES = 3;
const SOURCE_DISCOVERY_CONCURRENCY = 6;
const EXPLORATION_DISCOVERY_CONCURRENCY = 3;
const CANDIDATE_ENRICHMENT_CONCURRENCY = 6;

function stableHash(value) {
  let hash = 2166136261;

  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createCandidateKey(type, id) {
  return `${type}-${id}`;
}

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

function createExplorationSeed(history, mediaType) {
  const historyFingerprint = history
    .map((item) => `${item.type}:${item.id}:${item.rating ?? ""}:${item.status ?? ""}`)
    .sort()
    .join("|");

  return `${mediaType}:${historyFingerprint}`;
}

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
      pool: isExploration ? "exploration" : "exploitation",
      sources: [],
    });
  }

  const existing = candidates.get(key);

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

async function discoverMovieCredits(candidates, source) {
  const data = await tmdbFetch(`/person/${source.value}/movie_credits`);

  for (const media of data.cast || []) {
    addCandidate(candidates, media, source, "movie");
  }

  for (const media of data.crew || []) {
    if (media.job === "Director") {
      addCandidate(candidates, media, source, "movie");
    }
  }
}

async function discoverTvCredits(candidates, source) {
  if (source.type === "actors") {
    return;
  }

  const data = await tmdbFetch(`/person/${source.value}/tv_credits`);

  for (const media of data.cast || []) {
    addCandidate(candidates, media, source, "tv");
  }

  for (const media of data.crew || []) {
    if (["Director", "Creator"].includes(media.job)) {
      addCandidate(candidates, media, source, "tv");
    }
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

async function generateExplorationCandidates(
  candidates,
  mediaType,
  profile,
  history,
) {
  const queries = buildExplorationQueries(
    mediaType,
    profile,
    EXPLORATION_BATCHES,
    null,
    createExplorationSeed(history, mediaType),
  );

  await mapWithConcurrency(
    queries,
    async (query) => {
      try {
        const data = await tmdbFetch(query.endpoint);

        for (const media of data.results || []) {
          addCandidate(
            candidates,
            media,
            {
              type: "exploration",
              value: `${query.strategy}:${query.yearRange}`,
              evidenceScore: 0,
              confidence: 0,
              appearances: 0,
            },
            mediaType,
          );
        }
      } catch (error) {
        console.warn(
          `Exploration source failed for ${mediaType}:${query.strategy}`,
          error.message,
        );
      }
    },
    EXPLORATION_DISCOVERY_CONCURRENCY,
  );
}

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

async function enrichCandidates(candidates) {
  const enrichedResults = await mapWithConcurrency(
    candidates,
    async (candidate) => {
      try {
        const metadata = await getMediaMetadata(candidate.type, candidate.id);

        if (!metadata) {
          return null;
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

        return isValidCandidate(enrichedCandidate) ? enrichedCandidate : null;
      } catch (error) {
        console.warn(
          `Candidate enrichment failed for ${candidate.type}:${candidate.id}`,
          error.message,
        );
        return null;
      }
    },
    CANDIDATE_ENRICHMENT_CONCURRENCY,
  );

  return enrichedResults.filter(Boolean);
}

function selectExplorationCandidates(candidates, limit) {
  const byStrategy = new Map();

  for (const candidate of candidates) {
    const strategies = candidate.sources
      .filter((source) => source.type === "exploration")
      .map((source) => source.value.split(":")[0]);

    const strategy = strategies[0] || "unknown";

    if (!byStrategy.has(strategy)) {
      byStrategy.set(strategy, []);
    }

    byStrategy.get(strategy).push(candidate);
  }

  for (const group of byStrategy.values()) {
    group.sort((a, b) => {
      const hashDifference =
        stableHash(createCandidateKey(a.type, a.id)) -
        stableHash(createCandidateKey(b.type, b.id));

      if (hashDifference !== 0) {
        return hashDifference;
      }

      return String(a.title).localeCompare(String(b.title));
    });
  }

  const groups = [...byStrategy.values()];
  const selected = [];
  let index = 0;

  while (selected.length < limit && groups.length > 0) {
    let added = false;

    for (const group of groups) {
      if (index < group.length && selected.length < limit) {
        selected.push({
          ...group[index],
          sourceEvidence: 0,
          sourceCount: 0,
        });
        added = true;
      }
    }

    if (!added) {
      break;
    }

    index += 1;
  }

  return selected;
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

  await mapWithConcurrency(
    strongConnections,
    async (source) => {
      try {
        await generateFromSource(candidates, source, mediaType);
      } catch (error) {
        console.warn(
          `Candidate source failed: ${source.type}:${source.value}`,
          error.message,
        );
      }
    },
    SOURCE_DISCOVERY_CONCURRENCY,
  );

  await generateExplorationCandidates(candidates, mediaType, profile, history);

  const discovered = [...candidates.values()].filter(
    (candidate) => !knownIds.has(createCandidateKey(candidate.type, candidate.id)),
  );

  const enriched = await enrichCandidates(discovered);
  const exploitation = enriched.filter((candidate) => candidate.pool === "exploitation");
  const exploration = enriched.filter((candidate) => candidate.pool === "exploration");
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

  const selectedExploration = selectExplorationCandidates(
    exploration,
    explorationLimit,
  );

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
