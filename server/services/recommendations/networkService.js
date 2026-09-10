import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { buildGraph } from "./graphBuilder.js";
import { normalizeWatchHistory } from "../../utils/mediaIdentity.js";
import { mapWithConcurrency } from "../../utils/runWithConcurrency.js";

const NETWORK_ENRICHMENT_CONCURRENCY = 6;

function getTitle(item) {
  return item.type === "movie" ? item.title : item.name;
}

export async function buildNetwork(history) {
  const canonicalHistory = normalizeWatchHistory(history);

  const mediaRecords = await mapWithConcurrency(
    canonicalHistory,
    async (historyItem) => {
      try {
        const metadata = await getMediaMetadata(historyItem.type, historyItem.id);

        if (!metadata) {
          return null;
        }

        const mediaNodeId = `media-${historyItem.type}-${historyItem.id}`;

        const mediaNode = {
          id: mediaNodeId,
          type: "media",
          mediaType: historyItem.type,
          title: getTitle(historyItem),
          year: metadata.year,
          status: historyItem.status,
          poster_path: metadata.poster_path || historyItem.poster_path || null,
          backdrop_path: metadata.backdrop_path || null,
          overview: metadata.overview,
          rating: metadata.rating,
          popularity: metadata.popularity,
          actors: metadata.actors,
          directors: metadata.directors,
          genres: metadata.genres,
          keywords: metadata.keywords,
          franchises: metadata.franchises,
          studios: metadata.studios,
          language: metadata.language,
        };

        return {
          mediaNode,
          connections: getMediaConnections(metadata),
        };
      } catch (error) {
        console.warn(
          `Failed to enrich network item ${historyItem.type}:${historyItem.id}`,
          error.message,
        );
        return null;
      }
    },
    NETWORK_ENRICHMENT_CONCURRENCY,
  );

  return buildGraph(mediaRecords.filter(Boolean));
}
