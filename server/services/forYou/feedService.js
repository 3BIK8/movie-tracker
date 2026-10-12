import { getRejectedMediaKeys, recordInteractionEvents } from "../../repositories/feedbackRepository.js";
import {
  listQueuedFeedItems,
  markFeedItemsShown,
  transitionFeedItem,
} from "../../repositories/feedRepository.js";
import { updateSessionUserVector } from "../recommendations/userVectorService.js";
import { getUserVector } from "../../repositories/userVectorRepository.js";
import { scoreForYouCandidates } from "./forYouRanker.js";

const MODEL = process.env.EMBEDDER_MODEL || "Xenova/all-MiniLM-L6-v2";

export async function readForYouFeed(userId, limit) {
  const items = listQueuedFeedItems(userId, limit);
  markFeedItemsShown(userId, items.map((item) => item.id));
  return items;
}

export async function recordFeedEvents(userId, events) {
  if (!Array.isArray(events)) throw new TypeError("Feed events must be an array.");
  const normalizedEvents = events.map((event) => ({
    ...event,
    eventType: event.eventType === "like" ? "favorite"
      : event.eventType === "dislike" ? "skip"
        : event.eventType === "save" ? "add"
          : event.eventType === "not_interested" ? "reject"
          : event.eventType,
  }));
  const result = recordInteractionEvents(userId, normalizedEvents);
  for (const event of normalizedEvents) {
    if (["favorite", "reject", "skip", "add", "open"].includes(event.eventType)) {
      updateSessionUserVector(userId, MODEL, {
        mediaType: event.mediaType,
        tmdbId: event.tmdbId,
        eventType: event.eventType === "like" ? "favorite" : event.eventType,
      });
    }
    if (event.feedItemId && ["open", "skip", "reject", "add"].includes(event.eventType)) {
      transitionFeedItem(userId, event.feedItemId, event.eventType === "open" ? "opened" : event.eventType === "add" ? "added" : event.eventType === "reject" ? "rejected" : "skipped");
    }
  }
  return result;
}

export async function rescoreQueuedFeed(userId) {
  const rejected = getRejectedMediaKeys(userId);
  const session = getUserVector(userId, "session", MODEL);
  const rows = db.prepare(`
    SELECT f.id, f.media_type AS type, f.tmdb_id AS tmdbId, f.score,
      e.vector, e.dim
    FROM feed_items f
    JOIN media_embeddings e
      ON e.media_type = f.media_type AND e.tmdb_id = f.tmdb_id
      AND e.model = ?
    WHERE f.user_id = ? AND f.state = 'queued'
  `).all(MODEL, userId).filter((row) => !rejected.has(`${row.type}:${row.tmdbId}`));
  const candidates = rows.map((row) => ({
    ...row,
    vector: new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4),
  }));
  const rescored = scoreForYouCandidates(candidates, {
    sessionVector: session?.vector || null,
  });
  const updateScore = db.prepare("UPDATE feed_items SET score = ?, rank = ? WHERE user_id = ? AND id = ?");
  db.exec("BEGIN");
  try {
    rescored.forEach((row, index) => updateScore.run(row.score, index + 1, userId, row.id));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
