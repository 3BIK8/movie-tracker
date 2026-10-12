# Recommendation architecture

## Product boundaries

The application intentionally has different discovery concepts:

- Library: the user's actual watch history and library state.
- Recommendations: titles the user might plausibly have watched, inferred from the library. This is historical similarity, not a "what should I watch next?" engine.
- Discover: the normal TMDB-backed recent/searchable catalog feed.
- Network: a visual explanation of relationships inside the user's watch history.
- Future personalized discovery: a separate product surface for titles the user may want to watch. It is not part of the current recommendation engine.

## Recommendation pipeline

```text
Library state
    ↓
History enrichment / metadata cache
    ↓
Taste + connection representation
    ↓
Historical candidate retrieval
    ├── direct library connections
    ├── bounded multi-hop connections
    └── history-grounded expansion
    ↓
Hard exclusions
    ├── library items
    └── permanent Not interested items
    ↓
Historical similarity scoring
    ├── genres / keywords / franchises
    ├── supporting people signals
    └── objective quality
    ↓
Navigation-aware suppression
    ├── recently visible → temporary cooldown
    ├── skipped → no taste penalty
    └── Not interested → permanent exclusion
    ↓
Diversity + ranking
    ↓
Adaptive recommendation inventory
    ↓
UI page
```

Generic TMDB exploration that is not grounded in the user's history must not leak into this pipeline. A future personalized discovery system can reuse the underlying metadata and connection infrastructure without sharing the recommendation objective.

## State boundaries

- Library state is authoritative for watched / to-watch / unsure status.
- Recommendation exposure state records what the user actually saw in the server-side
  `recommendation_feedback` table. The browser may retain a bounded local copy for
  responsive interaction, but the server persists the submitted ledger and uses it
  during analysis.
- Recommendation interaction state records opened, skipped, passive ignored, and
  explicit Not interested events. `not_interested` is permanent suppression;
  `ignored` is only a passive non-response signal.
- Recommendation scoring may use library state and item-level feedback, but navigation events do not rewrite the user's taste profile.
- UI page size is independent from server candidate capacity. Capacity adapts to history size and recent inventory consumption.
## Authoritative feedback transition

The existing Recommendations page still records its exposure ledger in browser
storage and writes legacy exposure records to `recommendation_feedback`. During
the transition, those records are retained for exposure and diagnostics.

Permanent rejection is now server-owned. Authenticated clients send
`POST /api/feedback/events` with a batch of normalized interaction events.
`POST /api/feed/events` is a compatibility alias for the same ingestion service;
it does not have separate persistence or ranking behavior. A `reject` event
inserts a user-scoped row in `rejections` and an `interaction_events` row in
one transaction. `undo_reject` removes the rejection and records the undo
event. Replayed `clientEventId` values are idempotent per user.

The existing Recommendations route also translates legacy
`not_interested` interactions into authoritative rejection events, so clearing
local storage cannot make a server-recorded rejection eligible again. Both the
legacy candidate pipeline and future SQLite-only For You queries must exclude
the authenticated user's `rejections`.

Legacy exposure storage will be removed in a follow-up after the For You feed
is stable and its migration period is complete.

## Embedding backfill

Phase 2 adds `media_embeddings`, keyed by media identity and embedding model.
The backfill reads persisted `media` metadata and builds input text from the
title, tagline, overview, genres, and keywords. Input text is hashed with
SHA-256; unchanged hashes are skipped so rerunning the job is safe.

Embedding generation is intentionally unavailable on request paths. Run
`npm run backfill:embeddings` from `server/` with `EMBEDDER=local` for the
default local `Xenova/all-MiniLM-L6-v2` model, or `EMBEDDER=hosted` with the
hosted provider environment variables. Both implementations return
L2-normalized vectors and are isolated behind the embedder interface.

## For You user vectors

Phase 3 stores per-user `long` and `session` vectors in
`user_vectors`. The For You weights are defined only in
`server/services/recommendations/forYouConfig.js`; they are deliberately
separate from the existing Recommendations profile weights:

- `watched`: `+1.0`
- `to_watch`: `+0.2`
- `not_sure`: `0`

Ratings and interaction events have their own weights in that same module.
`rebuildLongUserVector` applies the configured time decay to persisted library
state and events. `updateSessionUserVector` uses an EMA and resets after the
configured inactivity window. Phase 3 provides vector persistence and scoring
primitives; the persistent feed queue and request endpoints remain Phase 4.

## Phase 4a offline ranking

Phase 4a adds pure services only. Embedding kNN retrieval excludes the user's
library and authoritative rejections. The ranker combines long-vector,
interest-vector, and session-vector cosine scores with a weak metadata quality
prior, negative similarity, and exposure fatigue. Embedding MMR adds
similarity-based novelty and cluster saturation penalties. TMDB
recommendation/similar results are represented by a background seeding adapter;
they are not fetched by request handlers.

`npm run evaluate:for-you` prints the current user's top 20 offline candidates,
including source and score breakdown. Phase 4a does not create feed queue rows,
routes, refill jobs, or UI.
