import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { buildGraph } from "./graphBuilder.js";
import { normalizeMediaRef } from "../../utils/mediaIdentity.js";
import { mapWithConcurrency } from "../../utils/runWithConcurrency.js";

const NETWORK_ENRICHMENT_CONCURRENCY = 6;
const MAX_NETWORK_HISTORY_ITEMS = 180;

function normalizeEvidence(item) {
  const ref = normalizeMediaRef(item?.type, item?.id);

  return {
    type: ref.type,
    id: ref.id,
    status: typeof item.status === "string" ? item.status : null,
    rating: Number.isFinite(item.rating) ? item.rating : null,
    favorite: item.favorite === true,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
    statusChangedAt:
      typeof item.statusChangedAt === "string" ? item.statusChangedAt : null,
    ratingUpdatedAt:
      typeof item.ratingUpdatedAt === "string" ? item.ratingUpdatedAt : null,
    favoriteAt: typeof item.favoriteAt === "string" ? item.favoriteAt : null,
    lastInteractedAt:
      typeof item.lastInteractedAt === "string" ? item.lastInteractedAt : null,
  };
}

function validateNetworkHistory(history) {
  if (!Array.isArray(history)) {
    throw new TypeError("Network history must be an array.");
  }

  if (history.length > MAX_NETWORK_HISTORY_ITEMS) {
    throw new TypeError(
      `Network history cannot contain more than ${MAX_NETWORK_HISTORY_ITEMS} items.`,
    );
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

export async function buildNetwork(history) {
  const normalizedHistory = validateNetworkHistory(history);
  const startedAt = Date.now();

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

  const graph = buildGraph(mediaRecords.filter(Boolean));

  return {
    ...graph,
    meta: {
      requestedMedia: normalizedHistory.length,
      enrichedMedia: mediaRecords.filter(Boolean).length,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      buildMs: Date.now() - startedAt,
    },
  };
}
