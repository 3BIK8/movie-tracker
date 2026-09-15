const STORAGE_KEY = "recommendation-feedback";
const MAX_EXPOSURES = 500;
const DEFAULT_IGNORE_AFTER_DAYS = 7;

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
  const exposures = ledger.exposures.slice(-MAX_EXPOSURES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ exposures }));
  } catch (error) {
    if (error?.name !== "QuotaExceededError") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ exposures: exposures.slice(-50) }));
    } catch {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    }
  }
}

function hasMeaningfulInteraction(exposure) {
  return (exposure.interactions || []).some((interaction) =>
    ["opened", "status", "rating", "favorite", "not_interested"].includes(interaction.event),
  );
}

export function recordRecommendationsShown(recommendations) {
  const ledger = readLedger();
  const timestamp = new Date().toISOString();
  for (const recommendation of recommendations || []) {
    const key = normalizeKey(recommendation.type, recommendation.id);
    const existing = ledger.exposures.find(
      (exposure) => exposure.key === key && exposure.generationId === recommendation.generationId,
    );
    if (existing) continue;
    ledger.exposures.push({
      key,
      type: recommendation.type,
      id: String(recommendation.id),
      title: recommendation.title || recommendation.name || "",
      pool: recommendation.pool || null,
      recommendationScore: recommendation.recommendationScore ?? null,
      diversityScore: recommendation.diversityScore ?? null,
      sourceCount: recommendation.sourceCount ?? null,
      year: recommendation.year ?? null,
      popularity: recommendation.popularity ?? null,
      language: recommendation.language ?? null,
      connections: Array.isArray(recommendation.connections) ? recommendation.connections : [],
      generationId: recommendation.generationId || timestamp,
      exposedAt: timestamp,
      interactions: [],
    });
  }
  writeLedger(ledger);
}

export function recordRecommendationInteraction(type, id, event, metadata = {}) {
  const ledger = readLedger();
  const key = normalizeKey(type, id);
  const exposure = [...ledger.exposures].reverse().find((item) => item.key === key);
  if (!exposure) return;
  exposure.interactions.push({ event, timestamp: new Date().toISOString(), ...metadata });
  writeLedger(ledger);
}

export function recordRecommendationsSkipped(recommendations) {
  const ledger = readLedger();
  const timestamp = new Date().toISOString();
  for (const recommendation of recommendations || []) {
    const key = normalizeKey(recommendation.type, recommendation.id);
    const exposure = [...ledger.exposures].reverse().find(
      (item) => item.key === key && item.generationId === recommendation.generationId,
    );
    if (!exposure || hasMeaningfulInteraction(exposure)) continue;
    exposure.interactions.push({ event: "skipped", timestamp });
  }
  writeLedger(ledger);
}

export function finalizeIgnoredRecommendations(now = Date.now(), ignoreAfterDays = DEFAULT_IGNORE_AFTER_DAYS) {
  const ledger = readLedger();
  const threshold = now - ignoreAfterDays * 86_400_000;
  for (const exposure of ledger.exposures) {
    const exposedAt = Date.parse(exposure.exposedAt);
    if (!Number.isFinite(exposedAt) || exposedAt > threshold || hasMeaningfulInteraction(exposure) || (exposure.interactions || []).some((interaction) => interaction.event === "ignored")) continue;
    exposure.interactions.push({ event: "ignored", timestamp: new Date(now).toISOString() });
  }
  writeLedger(ledger);
  return ledger;
}

export function getRecommendationFeedback() {
  return readLedger();
}

export { DEFAULT_IGNORE_AFTER_DAYS };
