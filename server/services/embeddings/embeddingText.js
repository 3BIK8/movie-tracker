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

export function buildEmbeddingText(row) {
  const metadata = parseMetadata(row.metadataJson);
  return [
    row.title || metadata.title || metadata.name,
    metadata.tagline,
    metadata.overview,
    names(metadata.genres),
    names(metadata.keywords?.keywords || metadata.keywords?.results || metadata.keywords),
  ].filter(Boolean).join("\n");
}

export function hashEmbeddingText(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}
