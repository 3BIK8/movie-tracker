export const DEFAULT_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const DEFAULT_EMBEDDING_DIMENSION = 384;

export function assertEmbedding(vector, expectedDimension) {
  if (!(vector instanceof Float32Array) || vector.length !== expectedDimension) {
    throw new TypeError(`Embedder returned an invalid ${expectedDimension}-dimensional vector.`);
  }

  let norm = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) throw new TypeError("Embedder returned a non-finite value.");
    norm += value * value;
  }
  if (norm === 0) throw new TypeError("Embedder returned a zero vector.");
  return vector;
}

export function normalizeEmbedding(vector) {
  let norm = 0;
  for (const value of vector) norm += value * value;
  const normalized = new Float32Array(vector.length);
  const scale = 1 / Math.sqrt(norm);
  for (let index = 0; index < vector.length; index += 1) {
    normalized[index] = vector[index] * scale;
  }
  return normalized;
}
