function normalizeType(type) {
  return typeof type === "string" ? type.trim().toLowerCase() : "";
}

function normalizeId(id) {
  const value = String(id ?? "").trim();
  return /^\d+$/.test(value) ? value.replace(/^0+/, "") || "0" : "";
}

export function createRecommendationMediaKey(type, id) {
  const normalizedType = normalizeType(type);
  const normalizedId = normalizeId(id);

  if (!normalizedType || !normalizedId) {
    return null;
  }

  return `${normalizedType}:${normalizedId}`;
}

export function getExcludedRecommendationIds(history) {
  return new Set(
    (Array.isArray(history) ? history : [])
      .filter((item) =>
        ["watched", "to_watch", "not_sure"].includes(item?.status),
      )
      .map((item) => createRecommendationMediaKey(item?.type, item?.id))
      .filter(Boolean),
  );
}

export function filterDisplayedRecommendations(recommendations, history) {
  const excludedIds = getExcludedRecommendationIds(history);

  return (Array.isArray(recommendations) ? recommendations : []).filter(
    (recommendation) => {
      const key = createRecommendationMediaKey(
        recommendation?.type,
        recommendation?.id,
      );

      return key !== null && !excludedIds.has(key);
    },
  );
}
