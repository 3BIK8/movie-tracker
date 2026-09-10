import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HISTORY_FILE = path.join(__dirname, "my-watch-history.json");
const RESULT_FILE = path.join(__dirname, "recommendation-test-result.json");

const API_URL = "http://localhost:5000/api/recommendations/analyze";

function summarizeRecommendations(items = []) {
  return items.map((item, index) => ({
    rank: index + 1,
    title: item.title,
    year: item.year,
    pool: item.pool,
    score:
      typeof item.recommendationScore === "number"
        ? Number(item.recommendationScore.toFixed(2))
        : null,
    taste:
      typeof item.tasteScore === "number"
        ? Number(item.tasteScore.toFixed(2))
        : null,
    negative:
      typeof item.negativeScore === "number"
        ? Number(item.negativeScore.toFixed(2))
        : null,
    sources: item.sourceCount ?? null,
    matched: item.matchedHistory?.[0]?.title || null,
  }));
}

function printDetailedRecommendations(items = [], limit = 20) {
  const recommendations = items.slice(0, limit);

  for (const [index, item] of recommendations.entries()) {
    console.log(
      `\n${"=".repeat(80)}\n` +
        `#${index + 1} ${item.title} (${item.year ?? "N/A"})\n` +
        `Pool: ${item.pool}\n` +
        `Recommendation score: ${item.recommendationScore ?? 0}\n` +
        `Taste score: ${item.tasteScore ?? 0}\n` +
        `Negative score: ${item.negativeScore ?? 0}\n`,
    );

    console.log("POSITIVE CONNECTION EVIDENCE:");

    if (!item.connectionEvidence?.length) {
      console.log("  None");
    } else {
      for (const evidence of item.connectionEvidence) {
        console.log(
          `  - ${evidence.type}:${evidence.value}` +
            ` | score=${Number(evidence.score?.toFixed?.(3) ?? evidence.score)}` +
            ` | preference=${Number(
              evidence.preference?.toFixed?.(3) ?? evidence.preference,
            )}` +
            ` | confidence=${Number(
              evidence.confidence?.toFixed?.(3) ?? evidence.confidence,
            )}` +
            ` | appearances=${evidence.appearances ?? 0}` +
            ` | primary=${evidence.primary}`,
        );
      }
    }

    console.log("\nNEGATIVE CONNECTION EVIDENCE:");

    if (!item.negativeConnections?.length) {
      console.log("  None");
    } else {
      for (const evidence of item.negativeConnections) {
        console.log(
          `  - ${evidence.type}:${evidence.value}` +
            ` | penalty=${Number(
              Math.abs(evidence.score)?.toFixed?.(3) ??
                Math.abs(evidence.score),
            )}` +
            ` | preference=${Number(
              evidence.preference?.toFixed?.(3) ?? evidence.preference,
            )}` +
            ` | confidence=${Number(
              evidence.confidence?.toFixed?.(3) ?? evidence.confidence,
            )}` +
            ` | appearances=${evidence.appearances ?? 0}`,
        );
      }
    }

    console.log("\nMATCHED HISTORY:");

    if (!item.matchedHistory?.length) {
      console.log("  None");
    } else {
      for (const match of item.matchedHistory.slice(0, 5)) {
        console.log(
          `  - ${match.title}` +
            ` (${match.rating ?? "unrated"})` +
            ` | score=${Number(match.score?.toFixed?.(3) ?? match.score)}`,
        );

        for (const connection of match.connections || []) {
          console.log(
            `      ${connection.type}:${connection.value}` +
              ` | score=${Number(
                connection.score?.toFixed?.(3) ?? connection.score,
              )}`,
          );
        }
      }
    }
  }
}

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

  console.log("\nMOVIES:");

  console.table(summarizeRecommendations(result.recommendations?.movies));

  console.log("\nTV:");

  console.table(summarizeRecommendations(result.recommendations?.tv));

  console.log("\n\n" + "#".repeat(80));
  console.log("MOVIE DIAGNOSTICS — TOP 20");
  console.log("#".repeat(80));

  printDetailedRecommendations(result.recommendations?.movies, 20);

  console.log("\n\n" + "#".repeat(80));
  console.log("TV DIAGNOSTICS — TOP 20");
  console.log("#".repeat(80));

  printDetailedRecommendations(result.recommendations?.tv, 20);

  await fs.writeFile(RESULT_FILE, JSON.stringify(result, null, 2));

  console.log(`\nRecommendation analysis saved to:\n${RESULT_FILE}`);
}

main().catch((error) => {
  console.error("Recommendation test failed:");
  console.error(error.message);
  process.exit(1);
});
