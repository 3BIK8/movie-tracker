import { createConfiguredEmbedder } from "../services/embeddings/embedderFactory.js";
import { backfillEmbeddings } from "../services/embeddings/backfillEmbeddings.js";

const result = await backfillEmbeddings({ embedder: createConfiguredEmbedder() });
console.log(JSON.stringify(result, null, 2));
