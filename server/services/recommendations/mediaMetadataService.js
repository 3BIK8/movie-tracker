import { tmdbFetch } from "../../utils/tmdbClient.js";
import { normalizeMedia } from "./mediaNormalizer.js";

const metadataCache = new Map();

export async function getMediaMetadata(type, id) {
  const cacheKey = `${type}-${id}`;

  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey);
  }

  try {
    const data = await tmdbFetch(
      `/${type}/${id}?append_to_response=credits,keywords`,
    );

    const metadata = normalizeMedia(data, type);

    metadataCache.set(cacheKey, metadata);

    return metadata;
  } catch (error) {
    if (error.status === 404) {
      console.warn(`TMDB media not found: ${type}/${id}`);
      return null;
    }

    throw error;
  }
}
