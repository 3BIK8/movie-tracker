const MAX_NETWORK_HISTORY_ITEMS = 180;
const MAX_NETWORK_PAYLOAD_BYTES = 40 * 1024;

function normalizeTimestamp(value) {
  return typeof value === "string" && value ? value : null;
}

function compactItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const type = typeof item.type === "string" ? item.type.trim().toLowerCase() : "";
  const id = String(item.id ?? "").trim();

  if (!/^(movie|tv)$/.test(type) || !/^\d+$/.test(id) || id === "0") {
    return null;
  }

  return {
    type,
    id: id.replace(/^0+/, ""),
    status: typeof item.status === "string" ? item.status : null,
    rating: Number.isFinite(item.rating) ? item.rating : null,
    favorite: item.favorite === true,
    createdAt: normalizeTimestamp(item.createdAt),
    statusChangedAt: normalizeTimestamp(item.statusChangedAt),
    ratingUpdatedAt: normalizeTimestamp(item.ratingUpdatedAt),
    favoriteAt: normalizeTimestamp(item.favoriteAt),
    lastInteractedAt: normalizeTimestamp(item.lastInteractedAt || item.updatedAt),
  };
}

function sortByRecency(items) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.lastInteractedAt || a.createdAt || "") || 0;
    const bTime = Date.parse(b.lastInteractedAt || b.createdAt || "") || 0;

    if (bTime !== aTime) {
      return bTime - aTime;
    }

    return `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`);
  });
}

export function compactNetworkHistory(history) {
  const source = Array.isArray(history) ? history : Object.values(history || {});
  const seen = new Set();
  const compacted = [];

  for (const item of source) {
    const compactItemValue = compactItem(item);

    if (!compactItemValue) {
      continue;
    }

    const key = `${compactItemValue.type}:${compactItemValue.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    compacted.push(compactItemValue);
  }

  const prioritized = sortByRecency(compacted).slice(0, MAX_NETWORK_HISTORY_ITEMS);
  let result = prioritized;

  while (result.length > 0) {
    const payload = JSON.stringify({ history: result });

    if (new TextEncoder().encode(payload).byteLength <= MAX_NETWORK_PAYLOAD_BYTES) {
      return result;
    }

    result = result.slice(0, -1);
  }

  return [];
}

export const NETWORK_REQUEST_LIMITS = Object.freeze({
  maxItems: MAX_NETWORK_HISTORY_ITEMS,
  maxPayloadBytes: MAX_NETWORK_PAYLOAD_BYTES,
});
