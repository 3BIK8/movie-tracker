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
- Recommendation exposure state records what the user actually saw.
- Recommendation interaction state records opened, skipped, and explicit Not interested events.
- Recommendation scoring may use library state and item-level feedback, but navigation events do not rewrite the user's taste profile.
- UI page size is independent from server candidate capacity. Capacity adapts to history size and recent inventory consumption.
