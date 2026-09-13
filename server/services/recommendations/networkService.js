import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { analyzeHistory } from "./historyAnalyzer.js";
import { createTasteProfile } from "./tasteProfile.js";
import { buildGraph } from "./graphBuilder.js";
import { normalizeMediaRef } from "../../utils/mediaIdentity.js";
import { mapWithConcurrency } from "../../utils/runWithConcurrency.js";

const NETWORK_ENRICHMENT_CONCURRENCY = 6;

function normalizeRating(value) {
  if (typeof value !== "string") {
    return null;
  }

  const rating = value.trim().toUpperCase();
  return ["S", "A", "B", "C", "D"].includes(rating) ? rating : null;
}

function normalizeEvidence(item) {
  const ref = normalizeMediaRef(item?.type, item?.id);

  return {
    type: ref.type,
    id: ref.id,
    status: typeof item.status === "string" ? item.status : null,
    rating: normalizeRating(item.rating),
    favorite: item.favorite === true,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
    statusChangedAt:
      typeof item.statusChangedAt === "string" ? item.statusChangedAt : null,
    ratingUpdatedAt:
      typeof item.ratingUpdatedAt === "string" ? item.ratingUpdatedAt : null,
    favoriteAt: typeof item.favoriteAt === "string" ? item.favoriteAt : null,
    lastInteractedAt: typeof item.lastInteractedAt === "string" ? item.lastInteractedAt : null,
  };
}

export function validateNetworkHistory(history) {
  if (!Array.isArray(history)) {
    throw new TypeError("Network history must be an array.");
  }

  const seen = new Set();
  const normalized = [];

  for (let index = 0; index < history.length; index += 1) {
    const evidence = normalizeEvidence(history[index]);
    const key = `${evidence.type}:${evidence.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(evidence);
  }

  return normalized;
}

function toProfileMedia(record) {
  const connections = record.connections || [];
  const values = (type) =>
    connections
      .filter((connection) => connection.type === type)
      .map((connection) => ({
        id: connection.value,
        name: connection.label,
      }));

  return {
    ...record.mediaNode,
    type: record.mediaNode.mediaType,
    actors: values("actor"),
    directors: values("director"),
    genres: values("genre"),
    franchises: values("franchise"),
    studios: values("studio"),
    keywords: values("keyword"),
  };
}

function buildNetworkTasteProfile(mediaRecords) {
  const profileInput = mediaRecords.map(toProfileMedia);
  return createTasteProfile(analyzeHistory(profileInput));
}

export async function buildNetwork(history) {
  const normalizedHistory = validateNetworkHistory(history);
  const startedAt = Date.now();
  const enrichmentStartedAt = Date.now();

  const mediaRecords = await mapWithConcurrency(
    normalizedHistory,
    async (evidence) => {
      try {
        const metadata = await getMediaMetadata(evidence.type, evidence.id);

        if (!metadata) {
          return null;
        }

        return {
          mediaNode: {
            id: `media-${evidence.type}-${evidence.id}`,
            type: "media",
            mediaType: evidence.type,
            title: metadata.title,
            year: metadata.year,
            status: evidence.status,
            rating: evidence.rating,
            favorite: evidence.favorite,
            poster_path: metadata.poster_path,
            backdrop_path: metadata.backdrop_path,
            overview: metadata.overview,
            tmdbRating: metadata.rating,
            popularity: metadata.popularity,
            language: metadata.language,
            lastInteractedAt: evidence.lastInteractedAt,
          },
          connections: getMediaConnections(metadata),
        };
      } catch (error) {
        console.warn(
          `Failed to enrich network item ${evidence.type}:${evidence.id}`,
          error.message,
        );
        return null;
      }
    },
    NETWORK_ENRICHMENT_CONCURRENCY,
  );

  const enrichmentMs = Date.now() - enrichmentStartedAt;
  const enrichedRecords = mediaRecords.filter(Boolean);

  const profileStartedAt = Date.now();
  const tasteProfile = buildNetworkTasteProfile(enrichedRecords);
  const profileMs = Date.now() - profileStartedAt;

  const graphStartedAt = Date.now();
  const graph = buildGraph(enrichedRecords, tasteProfile);
  const graphMs = Date.now() - graphStartedAt;

  return {
    ...graph,
    meta: {
      requestedMedia: normalizedHistory.length,
      enrichedMedia: enrichedRecords.length,
      movieMedia: enrichedRecords.filter(
        (record) => record.mediaNode.mediaType === "movie",
      ).length,
      tvMedia: enrichedRecords.filter(
        (record) => record.mediaNode.mediaType === "tv",
      ).length,
      nodeCount: graph.nodes.length,
      mediaNodeCount: graph.nodes.filter((node) => node.type === "media").length,
      connectionNodeCount: graph.nodes.filter((node) => node.type === "connection").length,
      edgeCount: graph.edges.length,
      personalizedConnections: graph.nodes.filter(
        (node) =>
          node.type === "connection" && node.personalEvidence?.state !== "unknown",
      ).length,
      buildMs: Date.now() - startedAt,
      timingMs: {
        enrichment: enrichmentMs,
        profile: profileMs,
        graph: graphMs,
      },
    },
  };
}
