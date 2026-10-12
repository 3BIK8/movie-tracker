import { getMediaEmbedding, listMediaEmbeddings } from "../repositories/embeddingRepository.js";

const model = process.env.EMBEDDER_MODEL || "Xenova/all-MiniLM-L6-v2";
const requested = process.argv.slice(2).map((value) => {
  const [type, id] = value.split(":");
  return { type, id };
});
const defaultTitles = [
  ["movie", "155", "The Dark Knight"],
  ["movie", "27205", "Inception"],
  ["movie", "238", "The Godfather"],
  ["movie", "603", "The Matrix"],
  ["movie", "496243", "Parasite"],
];

function cosine(left, right) {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

const embeddings = listMediaEmbeddings(model);
const byKey = new Map(embeddings.map((item) => [`${item.type}:${item.id}`, item]));
const targets = requested.length
  ? requested
  : defaultTitles.map(([type, id]) => ({ type, id }));

for (const targetRef of targets) {
  const key = `${targetRef.type}:${targetRef.id}`;
  const target = byKey.get(key) || getMediaEmbedding(targetRef.type, targetRef.id, model);
  if (!target) {
    console.log(`${key}: no embedding found`);
    continue;
  }

  const neighbors = embeddings
    .filter((item) => item.type === target.type && item.id !== target.id)
    .map((item) => ({ ...item, cosine: cosine(target.vector, item.vector) }))
    .sort((left, right) => right.cosine - left.cosine)
    .slice(0, 5);

  console.log(`${target.type}:${target.id} ${target.title || "(untitled)"}`);
  for (const neighbor of neighbors) {
    console.log(`  ${neighbor.cosine.toFixed(4)} ${neighbor.type}:${neighbor.id} ${neighbor.title || "(untitled)"}`);
  }
}
