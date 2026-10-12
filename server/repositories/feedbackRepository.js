import { db } from "../db/database.js";
import { normalizeMediaRef } from "../utils/mediaIdentity.js";

const EVENT_TYPES = new Set([
  "impression",
  "dwell",
  "expand",
  "open",
  "add",
  "rate",
  "favorite",
  "skip",
  "reject",
  "undo_reject",
]);
const MAX_EVENTS_PER_BATCH = 200;

function requireUserId(userId) {
  if (!Number.isInteger(userId) || userId < 1) {
    throw new TypeError("A valid user id is required.");
  }
}

function normalizeEvent(event) {
  const { type, id } = normalizeMediaRef(event?.mediaType, event?.tmdbId);
  const eventType = String(event?.eventType || "").trim().toLowerCase();
  const clientEventId = String(event?.clientEventId || "").trim();

  if (!EVENT_TYPES.has(eventType)) {
    throw new TypeError(`Unsupported interaction event: ${event?.eventType}`);
  }
  if (!clientEventId || clientEventId.length > 200) {
    throw new TypeError("Interaction event requires a client event id.");
  }

  const value = event?.value == null ? null : Number(event.value);
  if (value !== null && !Number.isFinite(value)) {
    throw new TypeError("Interaction event value must be finite.");
  }

  const timestamp = event?.ts ? new Date(event.ts) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError("Interaction event timestamp is invalid.");
  }

  return {
    type,
    id,
    eventType,
    value,
    surface: String(event?.surface || "unknown").trim().slice(0, 80) || "unknown",
    feedItemId: event?.feedItemId == null ? null : String(event.feedItemId).slice(0, 200),
    sessionId: event?.sessionId == null ? null : String(event.sessionId).slice(0, 200),
    clientEventId,
    ts: timestamp.toISOString(),
  };
}

export function recordInteractionEvents(userId, rawEvents) {
  requireUserId(userId);
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    throw new TypeError("Interaction events must be a non-empty array.");
  }
  if (rawEvents.length > MAX_EVENTS_PER_BATCH) {
    throw new RangeError(`A maximum of ${MAX_EVENTS_PER_BATCH} events may be submitted.`);
  }

  const events = rawEvents.map(normalizeEvent);
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO interaction_events (
      user_id, media_type, tmdb_id, event_type, value, surface,
      feed_item_id, session_id, client_event_id, ts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRejection = db.prepare(`
    INSERT OR IGNORE INTO rejections (user_id, media_type, tmdb_id, created_at)
    VALUES (?, ?, ?, ?)
  `);
  const deleteRejection = db.prepare(`
    DELETE FROM rejections
    WHERE user_id = ? AND media_type = ? AND tmdb_id = ?
  `);

  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const event of events) {
      const result = insertEvent.run(
        userId,
        event.type,
        event.id,
        event.eventType,
        event.value,
        event.surface,
        event.feedItemId,
        event.sessionId,
        event.clientEventId,
        event.ts,
      );

      if (result.changes !== 1) continue;
      inserted += 1;

      if (event.eventType === "reject") {
        insertRejection.run(userId, event.type, event.id, event.ts);
      } else if (event.eventType === "undo_reject") {
        deleteRejection.run(userId, event.type, event.id);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { accepted: inserted, ignored: events.length - inserted };
}

export function getRejectedMediaKeys(userId) {
  requireUserId(userId);
  return new Set(
    db.prepare(`
      SELECT media_type, tmdb_id
      FROM rejections
      WHERE user_id = ?
    `).all(userId).map((row) => `${row.media_type}:${row.tmdb_id}`),
  );
}

export function listRejections(userId) {
  requireUserId(userId);
  return db.prepare(`
    SELECT media_type AS type, tmdb_id AS id, created_at AS createdAt
    FROM rejections
    WHERE user_id = ?
    ORDER BY created_at DESC, media_type, tmdb_id
  `).all(userId);
}

export function recordLegacyRecommendationRejections(userId, feedback) {
  const events = [];
  for (const exposure of feedback?.exposures || []) {
    const rejected = (exposure.interactions || []).some(
      (interaction) => interaction.event === "not_interested",
    );
    if (!rejected) continue;
    events.push({
      mediaType: exposure.type,
      tmdbId: exposure.id,
      eventType: "reject",
      surface: "recommendations",
      clientEventId: `legacy-reject:${exposure.type}:${exposure.id}:${exposure.generationId || "legacy"}`,
      ts: exposure.exposedAt,
    });
  }

  return events.length ? recordInteractionEvents(userId, events) : { accepted: 0, ignored: 0 };
}

export { EVENT_TYPES, MAX_EVENTS_PER_BATCH };
