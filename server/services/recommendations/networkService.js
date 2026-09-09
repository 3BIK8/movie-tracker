import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { buildGraph } from "./graphBuilder.js";

function getTitle(item) {
  return item.type === "movie" ? item.title : item.name;
}

/* =========================================================
   Public API
   ========================================================= */

export async function buildNetwork(history) {
  const mediaRecords = [];

  for (const historyItem of history) {
    const metadata = await getMediaMetadata(historyItem.type, historyItem.id);

    if (!metadata) {
      continue;
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

    mediaRecords.push({
      mediaNode,
      connections: getMediaConnections(metadata),
    });
  }

  return buildGraph(mediaRecords);
}
