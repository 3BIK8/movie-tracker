const STORAGE_KEY = "recommendation-feedback";
const MAX_EXPOSURES = 2000;

function normalizeKey(type, id) {
  return `${String(type || "").trim().toLowerCase()}:${String(id ?? "").trim()}`;
}

function readLedger() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object"
      ? { exposures: Array.isArray(parsed.exposures) ? parsed.exposures : [] }
      : { exposures: [] };
  } catch {
    return { exposures: [] };
  }
}

function writeLedger(ledger) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger));
}

export function recordRecommendationsShown(recommendations) {
  const ledger = readLedger();
  const timestamp = new Date().toISOString();

  for (const recommendation of recommendations || []) {
    const key = normalizeKey(recommendation.type, recommendation.id);
    const existing = ledger.exposures.find(
      (exposure) => exposure.key === key && exposure.generationId === recommendation.generationId,
    );

    if (existing) {
      continue;
    }

    ledger.exposures.push({
      key,
      type: recommendation.type,
      id: String(recommendation.id),
      title: recommendation.title || recommendation.name || "",
      pool: recommendation.pool || null,
      recommendationScore: recommendation.recommendationScore ?? null,
      diversityScore: recommendation.diversityScore ?? null,
      sourceCount: recommendation.sourceCount ?? null,
      generationId: recommendation.generationId || timestamp,
      exposedAt: timestamp,
      interactions: [],
    });
  }

  ledger.exposures = ledger.exposures.slice(-MAX_EXPOSURES);
  writeLedger(ledger);
}

export function recordRecommendationInteraction(type, id, event, metadata = {}) {
  const ledger = readLedger();
  const key = normalizeKey(type, id);
  const timestamp = new Date().toISOString();

  const exposures = ledger.exposures.filter((exposure) => exposure.key === key);

  for (const exposure of exposures) {
    exposure.interactions.push({
      event,
      timestamp,
      ...metadata,
    });
  }

  if (exposures.length > 0) {
    writeLedger(ledger);
  }
}

export function getRecommendationFeedback() {
  return readLedger();
}
