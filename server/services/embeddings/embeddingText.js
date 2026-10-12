import crypto from "node:crypto";

function parseMetadata(metadataJson) {
  try {
    const metadata = JSON.parse(metadataJson || "{}");
    return metadata && typeof metadata === "object" ? metadata : {};
  } catch {
    return {};
  }
}

function names(values) {
  return (values || [])
    .map((value) => typeof value === "string" ? value : value?.name)
    .filter(Boolean)
    .join(", ");
}

function shortenOverview(value) {
  const overview = String(value || "").trim();
  if (overview.length <= 420) return overview;
  const boundary = overview.lastIndexOf(" ", 420);
  return `${overview.slice(0, boundary > 240 ? boundary : 420)}…`;
}

function repeatSignal(value, count) {
  return Array.from({ length: count }, () => value).join(", ");
}

export function buildEmbeddingText(row) {
  const metadata = parseMetadata(row.metadataJson);
  const genres = names(metadata.genres);
  const keywords = names(metadata.keywords?.keywords || metadata.keywords?.results || metadata.keywords);
  return [
    row.title || metadata.title || metadata.name,
    metadata.tagline,
    shortenOverview(metadata.overview),
    repeatSignal(genres, 2),
    repeatSignal(keywords, 2),
  ].filter(Boolean).join("\n");
}

export function hashEmbeddingText(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}
