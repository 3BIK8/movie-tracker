import { tmdbFetch } from "../../utils/tmdbClient.js";
import { normalizeMedia } from "./mediaNormalizer.js";
import { normalizeMediaRef } from "../../utils/mediaIdentity.js";

const metadataCache = new Map();

export async function getMediaMetadata(type, id) {
  const ref = normalizeMediaRef(type, id);
  const cacheKey = `${ref.type}:${ref.id}`;

  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey);
  }

  try {
    const data = await tmdbFetch(
      `/${ref.type}/${ref.id}?append_to_response=credits,keywords`,
    );

    const metadata = normalizeMedia(data, ref.type);

    metadataCache.set(cacheKey, metadata);

    return metadata;
  } catch (error) {
    if (error.status === 404) {
      console.warn(`TMDB media not found: ${ref.type}/${ref.id}`);
      return null;
    }

    throw error;
  }
}
