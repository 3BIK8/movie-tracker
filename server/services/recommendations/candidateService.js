import { tmdbFetch } from "../../utils/tmdbClient.js";
import { isValidCandidate } from "./candidateFilter.js";
import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { mapWithConcurrency } from "../../utils/runWithConcurrency.js";
import { buildExplorationQueries } from "./explorationStrategy.js";
import { createMediaKey, normalizeMediaRef } from "../../utils/mediaIdentity.js";
import { compareCandidatesByEvidence } from "./candidateOrdering.js";
import { validateCandidateOutput } from "./candidateInvariants.js";
import {
  getDiscoveryPageCount,
  getSourceBudget,
  selectCandidatesForEnrichment,
} from "./candidateRetrievalPolicy.js";
import { discoverMultiHopCandidates } from "./multiHopCandidateRetrieval.js";
import { getHistoryExplorationSources } from "./historyExplorationSources.js";

const MAX_SOURCES_PER_TYPE = {
  franchises: 6,
  directors: 6,
  actors: 6,
  genres: 6,
  studios: 5,
  keywords: 6,
};

const MAX_PERSON_CAST_CREDITS = 60;
const MAX_PERSON_CREW_CREDITS = 40;
const EXPLORATION_BATCHES = 6;
const SOURCE_DISCOVERY_CONCURRENCY = 6;
const EXPLORATION_DISCOVERY_CONCURRENCY = 3;
const CANDIDATE_ENRICHMENT_CONCURRENCY = 6;
const EXPLORATION_ROTATION_HOURS = 6;

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createCandidateKey(type, id) {
  return createMediaKey(type, id);
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
    .map(
      (item) =>
        `${item.type}:${item.id}:${item.rating ?? ""}:${item.status ?? ""}`,
    )
    .sort()
    .join("|");
  const rotation = Math.floor(
    Date.now() / (EXPLORATION_ROTATION_HOURS * 3_600_000),
  );
  return `${mediaType}:${rotation}:${historyFingerprint}`;
}

function addCandidate(candidates, media, source, mediaType) {
  if (!media?.id) return;
  const ref = normalizeMediaRef(mediaType, media.id);
  const candidate = { ...media, ...ref };
  if (!isValidCandidate(candidate)) return;

  const key = createCandidateKey(candidate.type, candidate.id);
  const isExploration =
    source.type === "exploration" || source.pool === "exploration";

  if (!candidates.has(key)) {
    candidates.set(key, {
      id: candidate.id,
      type: candidate.type,
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
  if (!isExploration) existing.pool = "exploitation";

  const alreadyExists = existing.sources.some(
    (item) => item.type === source.type && item.value === source.value,
  );

  if (!alreadyExists) {
    existing.sources.push({
      type: source.type,
      value: source.value,
      pool: source.pool,
      evidenceScore: source.evidenceScore ?? 0,
      confidence: source.confidence ?? 0,
      appearances: source.appearances ?? 0,
    });
  }
}

async function discoverMovieCredits(candidates, source) {
  const data = await tmdbFetch(`/person/${source.value}/movie_credits`);
  for (const media of (data.cast || []).slice(0, MAX_PERSON_CAST_CREDITS)) {
    addCandidate(candidates, media, source, "movie");
  }
  for (const media of (data.crew || [])
    .filter((item) => item.job === "Director")
    .slice(0, MAX_PERSON_CREW_CREDITS)) {
    addCandidate(candidates, media, source, "movie");
  }
}

async function discoverTvCredits(candidates, source) {
  if (source.type === "actors") return;
  const data = await tmdbFetch(`/person/${source.value}/tv_credits`);
  for (const media of (data.cast || []).slice(0, MAX_PERSON_CAST_CREDITS)) {
    addCandidate(candidates, media, source, "tv");
  }
  for (const media of (data.crew || [])
    .filter((item) => ["Director", "Creator"].includes(item.job))
    .slice(0, MAX_PERSON_CREW_CREDITS)) {
    addCandidate(candidates, media, source, "tv");
  }
}

async function discoverByPerson(candidates, source, mediaType) {
  if (mediaType === "movie") return discoverMovieCredits(candidates, source);
  return discoverTvCredits(candidates, source);
}

async function discoverByPagedDiscover(candidates, source, mediaType, parameter) {
  const pageCount = getDiscoveryPageCount(source.type);
  for (let page = 1; page <= pageCount; page += 1) {
    const data = await tmdbFetch(
      `/discover/${mediaType}?${parameter}=${source.value}&page=${page}`,
    );
    for (const media of data.results || []) addCandidate(candidates, media, source, mediaType);
    if (!data.total_pages || page >= data.total_pages) break;
  }
}

async function discoverByGenre(candidates, source, mediaType) {
  return discoverByPagedDiscover(candidates, source, mediaType, "with_genres");
}
async function discoverByStudio(candidates, source, mediaType) {
  return discoverByPagedDiscover(candidates, source, mediaType, "with_companies");
}
async function discoverByKeyword(candidates, source, mediaType) {
  return discoverByPagedDiscover(candidates, source, mediaType, "with_keywords");
}
async function discoverByFranchise(candidates, source) {
  const data = await tmdbFetch(`/collection/${source.value}`);
  for (const media of (data.parts || []).slice(0, 60)) {
    addCandidate(candidates, media, source, "movie");
  }
}

async function generateFromSource(candidates, source, mediaType) {
  switch (source.type) {
    case "actors":
    case "directors":
      return discoverByPerson(candidates, source, mediaType);
    case "genres":
      return discoverByGenre(candidates, source, mediaType);
    case "studios":
      return discoverByStudio(candidates, source, mediaType);
    case "keywords":
      return discoverByKeyword(candidates, source, mediaType);
    case "franchises":
      if (mediaType === "movie") return discoverByFranchise(candidates, source);
      return undefined;
    default:
      return undefined;
  }
}

async function generateHistoryExplorationCandidates(candidates, mediaType, history) {
  const { sources, watchedHistoryItems, historyConnectionCount } =
    getHistoryExplorationSources(history, mediaType);

  await mapWithConcurrency(
    sources,
    async (source) => {
      try {
        await generateFromSource(candidates, source, mediaType);
      } catch (error) {
        console.warn(
          `History exploration source failed: ${mediaType}:${source.type}:${source.value}`,
          error.message,
        );
      }
    },
    SOURCE_DISCOVERY_CONCURRENCY,
  );

  return { sourceCount: sources.length, watchedHistoryItems, historyConnectionCount };
}

async function generateExplorationCandidates(candidates, mediaType, profile, history) {
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

  return { queryCount: queries.length };
}

function getStrongConnections(profile, limit = getSourceBudget(profile)) {
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
      .sort((a, b) =>
        b.evidenceScore !== a.evidenceScore
          ? b.evidenceScore - a.evidenceScore
          : `${a.type}:${a.value}`.localeCompare(`${b.type}:${b.value}`),
      )
      .slice(0, MAX_SOURCES_PER_TYPE[type]);
    connections.push(...sources);
  }

  return connections
    .sort((a, b) =>
      b.evidenceScore !== a.evidenceScore
        ? b.evidenceScore - a.evidenceScore
        : `${a.type}:${a.value}`.localeCompare(`${b.type}:${b.value}`),
    )
    .slice(0, limit);
}

async function enrichCandidates(candidates) {
  const enrichedResults = await mapWithConcurrency(
    candidates,
    async (candidate) => {
      try {
        const metadata = await getMediaMetadata(candidate.type, candidate.id);
        if (!metadata) return null;

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
          voteCount: metadata.voteCount,
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

function getExplorationSourceGroup(source) {
  if (source.pool === "exploration") return `history:${source.type}`;
  if (source.type === "exploration") return source.value.split(":")[0];
  return "unknown";
}

function selectExplorationCandidates(candidates, limit) {
  const byStrategy = new Map();
  for (const candidate of candidates) {
    const strategy =
      candidate.sources
        .filter((source) => source.pool === "exploration" || source.type === "exploration")
        .map(getExplorationSourceGroup)[0] || "unknown";
    if (!byStrategy.has(strategy)) byStrategy.set(strategy, []);
    byStrategy.get(strategy).push(candidate);
  }

  for (const group of byStrategy.values()) {
    group.sort((a, b) => {
      const difference =
        stableHash(createCandidateKey(a.type, a.id)) -
        stableHash(createCandidateKey(b.type, b.id));
      return difference || String(a.title).localeCompare(String(b.title));
    });
  }

  const groups = [...byStrategy.values()];
  const selected = [];
  let index = 0;
  while (selected.length < limit && groups.length) {
    let added = false;
    for (const group of groups) {
      if (index < group.length && selected.length < limit) {
        selected.push({ ...group[index], sourceEvidence: 0, sourceCount: 0 });
        added = true;
      }
    }
    if (!added) break;
    index += 1;
  }
  return selected;
}

function calculateCandidateEvidence(candidate) {
  return candidate.sources.reduce((sum, source) => sum + source.evidenceScore, 0);
}

function elapsedMs(startedAt) {
  return Math.round(performance.now() - startedAt);
}

export async function generateCandidates(
  profile,
  history,
  mediaType,
  limit = 100,
  diagnostics = null,
) {
  const phaseDiagnostics = diagnostics || {};
  const sourceBudget = getSourceBudget(profile);
  const strongConnections = getStrongConnections(profile, sourceBudget);
  const knownIds = getKnownMediaIds(history);
  const candidates = new Map();

  phaseDiagnostics.sourceCount = strongConnections.length;
  phaseDiagnostics.sourceDiscoveryStarted = performance.now();
  await mapWithConcurrency(
    strongConnections,
    async (source) => {
      try {
        await generateFromSource(candidates, source, mediaType);
      } catch (error) {
        console.warn(`Candidate source failed: ${source.type}:${source.value}`, error.message);
      }
    },
    SOURCE_DISCOVERY_CONCURRENCY,
  );
  phaseDiagnostics.sourceDiscoveryMs = elapsedMs(phaseDiagnostics.sourceDiscoveryStarted);
  delete phaseDiagnostics.sourceDiscoveryStarted;
  phaseDiagnostics.directCandidates = candidates.size;

  const multiHopStartedAt = performance.now();
  const multiHopResults = await discoverMultiHopCandidates([...candidates.values()], mediaType);
  phaseDiagnostics.multiHopMs = elapsedMs(multiHopStartedAt);
  phaseDiagnostics.multiHopDiscovered = multiHopResults.length;
  for (const { media, source } of multiHopResults) addCandidate(candidates, media, source, mediaType);

  const historyStartedAt = performance.now();
  const historyExploration = await generateHistoryExplorationCandidates(candidates, mediaType, history);
  phaseDiagnostics.historyExplorationMs = elapsedMs(historyStartedAt);
  phaseDiagnostics.historyExplorationSources = historyExploration.sourceCount;
  phaseDiagnostics.watchedHistoryItems = historyExploration.watchedHistoryItems;
  phaseDiagnostics.historyConnectionCount = historyExploration.historyConnectionCount;

  const explorationStartedAt = performance.now();
  const exploration = await generateExplorationCandidates(candidates, mediaType, profile, history);
  phaseDiagnostics.explorationDiscoveryMs = elapsedMs(explorationStartedAt);
  phaseDiagnostics.explorationQueryCount = exploration.queryCount;

  const deduplicationStartedAt = performance.now();
  const discovered = [...candidates.values()].filter(
    (candidate) => !knownIds.has(createCandidateKey(candidate.type, candidate.id)),
  );
  const enrichmentInput = selectCandidatesForEnrichment(discovered, limit);
  phaseDiagnostics.deduplicationMs = elapsedMs(deduplicationStartedAt);
  phaseDiagnostics.discovered = discovered.length;
  phaseDiagnostics.enrichmentInput = enrichmentInput.length;

  const enrichmentStartedAt = performance.now();
  const enriched = await enrichCandidates(enrichmentInput);
  phaseDiagnostics.enrichmentMs = elapsedMs(enrichmentStartedAt);
  phaseDiagnostics.enriched = enriched.length;

  const selectionStartedAt = performance.now();
  const exploitation = enriched.filter((candidate) => candidate.pool === "exploitation");
  const explorationCandidates = enriched.filter((candidate) => candidate.pool === "exploration");
  const explorationLimit = Math.min(Math.floor(limit * 0.4), explorationCandidates.length);
  const exploitationLimit = Math.min(limit - explorationLimit, exploitation.length);

  const rankedExploitation = exploitation
    .map((candidate) => ({
      ...candidate,
      sourceEvidence: calculateCandidateEvidence(candidate),
      sourceCount: candidate.sources.length,
    }))
    .sort(compareCandidatesByEvidence)
    .slice(0, exploitationLimit);

  const selectedExploration = selectExplorationCandidates(explorationCandidates, explorationLimit);
  const output = [...rankedExploitation, ...selectedExploration];
  phaseDiagnostics.selectionMs = elapsedMs(selectionStartedAt);

  const validationStartedAt = performance.now();
  validateCandidateOutput(output, { mediaType, limit, knownIds });
  phaseDiagnostics.validationMs = elapsedMs(validationStartedAt);
  phaseDiagnostics.exploitation = exploitation.length;
  phaseDiagnostics.exploration = explorationCandidates.length;
  phaseDiagnostics.exploitationPool = rankedExploitation.length;
  phaseDiagnostics.explorationPool = selectedExploration.length;
  phaseDiagnostics.total = Object.entries(phaseDiagnostics)
    .filter(([key, value]) => key.endsWith("Ms") && key !== "total")
    .reduce((sum, [, value]) => sum + value, 0);

  console.log("CANDIDATE COUNTS:", { mediaType, sourceBudget, ...phaseDiagnostics });
  return output;
}
