import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_FILE = path.join(__dirname, "my-watch-history.json");

const RESULT_FILE = path.join(__dirname, "recommendation-test-result.json");

const API_URL = "http://localhost:5000/api/recommendations/analyze";

async function main() {
  const historyFile = await fs.readFile(HISTORY_FILE, "utf-8");

  const data = JSON.parse(historyFile);

  // The browser stores history as:
  // {
  //   "movie-122": {...},
  //   "tv-1396": {...}
  // }
  //
  // The API expects an array.
  const history = Array.isArray(data)
    ? data
    : Object.values(data.history ?? data);

  console.log(`Loaded ${history.length} history items.`);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ history }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || `Request failed: ${response.status}`);
  }

  await fs.writeFile(RESULT_FILE, JSON.stringify(result, null, 2));

  console.log(`Recommendation analysis saved to:\n${RESULT_FILE}`);
}

main().catch((error) => {
  console.error("Recommendation test failed:");
  console.error(error.message);
  process.exit(1);
});
