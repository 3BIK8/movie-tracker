import { createHostedApiEmbedder } from "./hostedApiEmbedder.js";
import { createLocalXenovaEmbedder } from "./localXenovaEmbedder.js";

export function createConfiguredEmbedder() {
  const provider = String(process.env.EMBEDDER || "local").trim().toLowerCase();
  if (provider === "local") return createLocalXenovaEmbedder();
  if (provider === "hosted") return createHostedApiEmbedder();
  throw new Error(`Unsupported EMBEDDER provider: ${provider}`);
}
