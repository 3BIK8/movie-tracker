# Persistent watch history

The application uses a file-backed SQLite database as the server-side source of truth for watch history.

## Why SQLite

This is currently a single-user personal application. SQLite gives the project a real relational database, transactions, constraints, indexes, and durable persistence without adding a separate database server or another runtime dependency. The server CI already runs Node 24, which provides the `node:sqlite` API.

If the application later becomes multi-user or needs horizontally scaled server instances, the repository layer is the boundary where SQLite can be replaced with PostgreSQL without changing the client contract.

## Data model

- `users`: user identity boundary. The current personal application uses user `1`.
- `media`: canonical TMDB media records and cached metadata needed by the user's history.
- `watch_entries`: user-specific status, rating, favorite state, and interaction timestamps.
- `schema_migrations`: applied migration filenames.

User state is separated from media metadata so the database does not mix a person's interaction state with TMDB data.

## Runtime flow

```text
React
  ↓
/api/watch-history
  ↓
watchHistoryRepository
  ↓
SQLite

Recommendations / Network
  ↓
server reads the same SQLite history
  ↓
recommendation engine / network builder
```

The recommendation and network endpoints no longer accept the watch history from the browser. This is intentional: the browser is no longer responsible for selecting, compacting, or truncating the history used by server-side analysis.

## Legacy migration

On the first application startup after this change:

1. The client asks the server for the database history.
2. If the database is empty, the client reads the legacy `my-watch-history` LocalStorage key.
3. The client sends that history once to `/api/watch-history/migrate`.
4. The server writes it transactionally.
5. The client clears the legacy LocalStorage key after successful initialization.
6. All subsequent reads and writes use the database.

LocalStorage is therefore a one-time migration source, not an application data store.

## Database location

By default the server creates:

```text
server/data/movie-tracker.sqlite
```

Set `DATABASE_PATH` to override the location. SQLite WAL files are ignored by Git.

## Migrations

Migration files live in `server/db/migrations/` and are applied in filename order. Applied filenames are recorded in `schema_migrations`; an applied migration must never be edited in place. Add a new migration for schema changes.
