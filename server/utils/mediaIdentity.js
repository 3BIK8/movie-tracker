const MEDIA_TYPES = new Set(["movie", "tv"]);

export function normalizeMediaType(type) {
  if (typeof type !== "string") {
    throw new TypeError("Media type must be a string.");
  }

  const normalized = type.trim().toLowerCase();

  if (!MEDIA_TYPES.has(normalized)) {
    throw new TypeError(`Unsupported media type: ${type}`);
  }

  return normalized;
}

export function normalizeMediaId(id) {
  const value = String(id ?? "").trim();

  if (!/^\d+$/.test(value)) {
    throw new TypeError("Media id must be a positive numeric identifier.");
  }

  const normalized = value.replace(/^0+/, "") || "0";

  if (normalized === "0") {
    throw new TypeError("Media id must be greater than zero.");
  }

  return normalized;
}

export function normalizeMediaRef(type, id) {
  return {
    type: normalizeMediaType(type),
    id: normalizeMediaId(id),
  };
}

export function createMediaKey(type, id) {
  const ref = normalizeMediaRef(type, id);
  return `${ref.type}:${ref.id}`;
}

export function normalizeWatchHistory(history) {
  if (!Array.isArray(history)) {
    throw new TypeError("Watch history must be an array.");
  }

  return history.map((item, index) => {
    try {
      const ref = normalizeMediaRef(item?.type, item?.id);
      return { ...item, ...ref };
    } catch (error) {
      throw new TypeError(`Invalid watch-history item at index ${index}: ${error.message}`);
    }
  });
}
