import { getRejectedMediaKeys, recordInteractionEvents } from "../../repositories/feedbackRepository.js";
import {
  listQueuedFeedItems,
  markFeedItemsShown,
  transitionFeedItem,
} from "../../repositories/feedRepository.js";
import { updateSessionUserVector } from "../recommendations/userVectorService.js";

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
  const rows = db.prepare(`
    SELECT id, media_type AS type, tmdb_id AS tmdbId
    FROM feed_items WHERE user_id = ? AND state = 'queued'
  `).all(userId).filter((row) => !rejected.has(`${row.type}:${row.tmdbId}`));
  const update = db.prepare("UPDATE feed_items SET rank = ? WHERE user_id = ? AND id = ?");
  db.exec("BEGIN");
  try {
    rows.forEach((row, index) => update.run(index + 1, userId, row.id));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
