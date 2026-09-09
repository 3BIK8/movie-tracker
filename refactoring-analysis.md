Here is the comprehensive repository-wide code architecture audit and refactoring analysis.

---

# 1. ARCHITECTURE OVERVIEW

### Current Frontend Architecture
The frontend is a **React 19 + Vite** single-page application that renders three main views (`Discover`, `Library`, `Network`) controlled by local tab state in `App.jsx`.
- **View Navigation:** Simple state-based view switching in `App.jsx` (`discover`, `library`, `network`).
- **State & Data Sync:** Local component state backed by custom React hooks. Global UI synchronization for user watch history uses an event-driven `localStorage` wrapper (`watchlist.js`) that broadcasts custom DOM events (`watch-history-updated`).
- **Graph Engine:** Integrates `Cytoscape.js` for canvas-based graph visualization of user watch connections.
- **UI Animation & Rendering:** Uses `motion` (Framer Motion) and React Portals (`ExpandedCard.jsx`) for overlay positioning outside standard CSS grid flows.

### Current Backend Architecture
The backend is a lightweight **Express 5 (ESM)** Node.js API server running on port 5000.
- **API Architecture:** Layered REST backend (`server.js` -> `routes` -> `services` -> `utils/config`).
- **Data Persistence:** Stateless server with no database. Client watch history is posted dynamically to build network graphs on demand.
- **Integration Layer:** `tmdbClient.js` provides a resilient fetch client with timeouts, retry mechanisms, and rate/error handling to communicate with TMDB API v3.

### Major Responsibilities & Data Flows
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT (React 19)                                    │
│                                                                                        │
│  [App.jsx] (Tab Router)                                                                │
│     ├── [Discover.jsx] ─────> useDiscoverSearch ─────────┐                             │
│     ├── [Library.jsx] ──────> useWatchHistory ────────┐  │                             │
│     └── [Network.jsx] ──────> useNetworkGraph ──────┐ │  │                             │
│                                                     │ │  │                             │
│  [watchlist.js] <── (Custom DOM Event) ─────────────┼─┘  │                             │
│   (localStorage)                                    │    │                             │
└─────────────────────────────────────────────────────┼────┼─────────────────────────────┘
                                                      │    │
                                            HTTP POST │    │ HTTP GET
                                      /network        │    │ /discover, /details
                                                      ▼    ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SERVER (Express 5)                                   │
│                                                                                        │
│  [Routes Layer]                                                                        │
│     ├── discoverRoutes.js                                                              │
│     ├── detailsRoutes.js                                                               │
│     └── recommendationsRoutes.js                                                       │
│                                                                                        │
│  [Services Layer]                                                                      │
│     ├── discoverService.js (App 30-item <-> TMDB 20-item page adapter + scoring)        │
│     ├── detailsService.js  (Media details + cast/crew formatting)                      │
│     └── networkService.js  (Orchestrates graph generation)                             │
│           ├── mediaMetadataService.js (In-memory TMDB metadata caching)                │
│           ├── mediaNormalizer.js      (Normalizes movie/TV schemas)                    │
│           ├── connectionExtractor.js  (Extracts actor, director, genre, etc.)          │
│           └── graphBuilder.js         (Generates Nodes and Edges)                      │
│                                                                                        │
│  [Utils Layer]                                                                         │
│     └── tmdbClient.js (Fetch with timeout, abort signal, retries)                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                                      │
                                                      ▼
                                           [External TMDB API v3]
```

### Dependency & Logic Placement Summary
- **Business Logic:** Split between server services (`discoverService.js` pagination mapping, `tmdbScoring.js`, `graphBuilder.js`) and client helpers (`watchlist.js`).
- **UI Logic:** Client hooks (`useAnchoredPanel.js`, `useConnectionSearch.js`) and React components.
- **Data Access Logic:** `client/src/services/api.js` on the frontend, and `server/utils/tmdbClient.js` on the backend.

---

# 2. RESPONSIBILITY ANALYSIS

Analysis of all 67 files in the repository:

| # | File Path | Primary Responsibility | Secondary Responsibilities | Cohesive? | Recommendation | Reason |
|---|-----------|────────────────────────|────────────────────────────|-----------|────────────────|--------|
| 1 | `client/eslint.config.js` | Linter configuration | Global ignores & flat config | Yes | Remain as-is | Standard configuration. |
| 2 | `client/package-lock.json` | Dependency lockfile | Package tree resolution | Yes | Remain as-is | Managed by npm. |
| 3 | `client/package.json` | Project manifest | Build scripts & dependencies | Yes | Remain as-is | Standard package configuration. |
| 4 | `client/src/App.jsx` | Top-level view router | Navigation header rendering | Yes | Remain as-is | Clean, minimal root layout. |
| 5 | `client/src/components/CastList.jsx` | Renders cast & director/creator section | Normalizes director vs creator title | Yes | Remain as-is | Single focus on cast presentation. |
| 6 | `client/src/components/CastPerson.jsx` | Renders single cast item | Image fallback rendering | Yes | Remain as-is | Pure presentational component. |
| 7 | `client/src/components/ExpandedCard.jsx` | Portal panel rendering | Escape key listener & motion animation | Yes | Remain as-is | Delegates positioning to `useAnchoredPanel`. |
| 8 | `client/src/components/MediaInfo.jsx` | Media metadata rendering (title, year, genres) | Overview formatting | Yes | Remain as-is | Pure display component. |
| 9 | `client/src/components/MovieCard.jsx` | Grid item container | Anchored panel lifecycle & status binding | Yes | Remain as-is | Clean composition component. |
| 10 | `client/src/components/MoviePoster.jsx` | Poster image & hover wrapper | Keyboard interaction handling | Yes | Remain as-is | Cohesive poster display component. |
| 11 | `client/src/components/network/FranchiseDetails.jsx` | Render franchise node details | Connected titles section | **No** | **Refactor** | Duplicates layout shell with other connection detail components. |
| 12 | `client/src/components/network/GenericConnectionDetails.jsx` | Render fallback connection details | Connection label lookup | **No** | **Refactor** | Duplicates layout shell and duplicates `CONNECTION_LABELS`. |
| 13 | `client/src/components/network/GenreDetails.jsx` | Render genre node details | Connected titles list | **No** | **Refactor** | Identical structure to `GenericConnectionDetails`. |
| 14 | `client/src/components/network/MediaDetails.jsx` | Render media node details | Person list formatting | Yes | Refactor (Minor) | Duplicates person list rendering blocks for crew vs cast. |
| 15 | `client/src/components/network/MediaList.jsx` | Render list of connected titles | Poster thumbnail fallback | Yes | Remain as-is | Clean presentational component. |
| 16 | `client/src/components/network/NetworkDetailsPanel.jsx` | Routing details panel view based on node type | Empty state rendering | Yes | Remain as-is | Cohesive dispatch panel. |
| 17 | `client/src/components/network/PersonDetails.jsx` | Render actor/director node details | Profile image fallback | **No** | **Refactor** | Duplicates layout shell with other connection detail views. |
| 18 | `client/src/components/network/StudioDetails.jsx` | Render studio node details | Studio logo container | **No** | **Refactor** | Duplicates layout shell with other connection detail views. |
| 19 | `client/src/components/Pagination.jsx` | Renders pagination controls | Input validation & enter key submission | Yes | Remain as-is | Focused UI component. |
| 20 | `client/src/components/WatchActions.jsx` | Renders action status buttons | Click propagation stopping | Yes | Remain as-is | Focused UI component. |
| 21 | `client/src/constants/tmdb.js` | TMDB image URL builder constant/util | Fallback size handling | Yes | Remain as-is | Clean utility constant. |
| 22 | `client/src/hooks/useAnchoredPanel.js` | Calculates overlay position relative to target | Resizing & scrolling event listeners | Yes | Remain as-is | Pure layout computation and lifecycle coupling. |
| 23 | `client/src/hooks/useDiscoverSearch.js` | Search state & discovery API fetcher | Form submit & type switcher actions | Yes | Remain as-is | Feature hook combining search state and data execution. |
| 24 | `client/src/hooks/useMediaDetails.js` | Lazy data fetcher for single title details | Cancel flag async management | Yes | Remain as-is | Focused data hook. |
| 25 | `client/src/hooks/useWatchHistory.js` | Subscription to watch history storage updates | State holder for library items | Yes | Remain as-is | Simple event subscriber hook. |
| 26 | `client/src/hooks/useWatchStatus.js` | Single item watch status reader/writer | Event listener binding | Yes | Remain as-is | Simple state hook. |
| 27 | `client/src/index.css` | CSS entry point | Style file imports | Yes | Remain as-is | Standard style aggregator. |
| 28 | `client/src/main.jsx` | React root entry point | DOM mount | Yes | Remain as-is | Standard entry file. |
| 29 | `client/src/pages/Discover.jsx` | Discovery page layout | Form controls & grid orchestration | Yes | Remain as-is | Clean page container. |
| 30 | `client/src/pages/Library.jsx` | Library page layout | Category filtering | Yes | Remain as-is | Clean page container. |
| 31 | `client/src/pages/network/ConnectionExplorer.jsx` | Connection search input & list | Selection button rendering | Yes | Remain as-is | Cohesive explorer sidebar widget. |
| 32 | `client/src/pages/network/connectionTypes.js` | Connection type mapping array & labels | Label lookup object | Yes | Refactor (Location) | Imported by components outside `pages/`. Should move to `constants/`. |
| 33 | `client/src/pages/network/networkStyles.js` | Cytoscape CSS configuration array | Node/edge visual style declarations | Yes | Remain as-is | Pure configuration file. |
| 34 | `client/src/pages/network/useConnectionSearch.js` | Filters & sorts network connection nodes | Search string filtering | Yes | Remain as-is | Focused calculation hook. |
| 35 | `client/src/pages/network/useNetworkGraph.js` | Cytoscape instantiation, canvas layout, node selection, edge highlighting, API loading, element filtering | Graph event listeners & Cytoscape CSS class toggles | **No** | **SPLIT** | **God Hook:** Combines graph canvas engine, data fetching, element filtering, and UI selection logic. |
| 36 | `client/src/pages/Network.jsx` | Network page view orchestrator | Filter toggles & focus state | Yes | Remain as-is | Clean page container. |
| 37 | `client/src/services/api.js` | HTTP client wrapper for backend API | Fetch options & error throwing | Yes | Remain as-is | Centralized frontend API service. |
| 38 | `client/src/services/watchlist.js` | LocalStorage CRUD for watch history | DOM Event dispatcher | Yes | Remain as-is | Clean local persistence service. |
| 39 | `client/src/styles/base.css` | Global CSS variables & reset | Base typography | Yes | Remain as-is | CSS module. |
| 40 | `client/src/styles/controls.css` | Form & button group styles | Responsive layout queries | Yes | Remain as-is | CSS module. |
| 41 | `client/src/styles/expanded-details.css` | Expanded card styles | Cast list styling | Yes | Remain as-is | CSS module. |
| 42 | `client/src/styles/layout.css` | Page layout constraints | Main header & nav styling | Yes | Remain as-is | CSS module. |
| 43 | `client/src/styles/movie-grid.css` | Responsive poster grid styles | Card sizing | Yes | Remain as-is | CSS module. |
| 44 | `client/src/styles/movie-poster.css` | Poster container styles | Hover overlay watch actions styling | Yes | Remain as-is | CSS module. |
| 45 | `client/src/styles/network.css` | Network graph page CSS | Layout, sidebar, details panel styles | Yes | Remain as-is | Unified stylesheet for network view. |
| 46 | `client/src/styles/pagination.css` | Pagination control styles | Layout alignment | Yes | Remain as-is | CSS module. |
| 47 | `client/vite.config.js` | Vite bundler config | React plugin registration | Yes | Remain as-is | Standard build config. |
| 48 | `server/config/tmdb.js` | TMDB API configuration constants | Timeouts & page limits | Yes | Remain as-is | Standard config file. |
| 49 | `server/package-lock.json` | Server lockfile | Server dependency tree | Yes | Remain as-is | Managed by npm. |
| 50 | `server/package.json` | Server manifest | Express scripts & dependencies | Yes | Remain as-is | Standard manifest. |
| 51 | `server/routes/detailsRoutes.js` | Route handler for `/api/details` | Query validation | Yes | Remain as-is | Clean Express route. |
| 52 | `server/routes/discoverRoutes.js` | Route handler for `/api/discover` | Query defaults | Yes | Remain as-is | Clean Express route. |
| 53 | `server/routes/healthRoutes.js` | Healthcheck route | Status JSON response | Yes | Remain as-is | Clean Express route. |
| 54 | `server/routes/recommendationsRoutes.js` | Route handler for `/api/recommendations/network` | Request body validation | Yes | Remain as-is | Clean Express route. |
| 55 | `server/server.js` | Express server bootstrap | Middleware & route mounting | Yes | Remain as-is | Standard server entry point. |
| 56 | `server/services/detailsService.js` | TMDB detail fetching service | Cast/crew data normalization | Yes | Remain as-is | Cohesive service file. |
| 57 | `server/services/discoverService.js` | App <-> TMDB page size adapter (30 vs 20) | Multi-page fetch aggregator & scoring | Yes | Remain as-is | Cohesive adapter service. |
| 58 | `server/services/recommendations/candidateService.js` | Calculates top profile connections | Array sorting & slicing | **No** | **REMOVE / INTEGRATE** | **Orphaned Dead Code:** Unused across the entire codebase. |
| 59 | `server/services/recommendations/connectionExtractor.js` | Transforms media metadata into edge connection tuples | Decade/Language/MediaType extraction | Yes | Remain as-is | Cohesive extractor service. |
| 60 | `server/services/recommendations/graphBuilder.js` | Constructs network Nodes and Edges | Builds media-to-media relationship links | Yes | Remain as-is | Cohesive graph generator. |
| 61 | `server/services/recommendations/historyAnalyzer.js` | Builds weighted signal profile from watch history | Category weight accumulator | **No** | **REMOVE / INTEGRATE** | **Orphaned Dead Code:** Never imported or used in network generation. |
| 62 | `server/services/recommendations/mediaMetadataService.js` | Fetches TMDB media with credits & keywords | In-memory key-value caching | Yes | Remain as-is | Cohesive cached metadata provider. |
| 63 | `server/services/recommendations/mediaNormalizer.js` | Normalizes TMDB movie & TV payloads | Crew/Cast/Franchise/Studio extraction | Yes | Remain as-is | Cohesive schema normalizer. |
| 64 | `server/services/recommendations/networkService.js` | Orchestrates network generation pipeline | Media record object assembly | Yes | Remain as-is | Clean service facade. |
| 65 | `server/utils/tmdbClient.js` | Robust HTTP client for TMDB API | AbortController timeouts & automatic retries | Yes | Remain as-is | Excellent utility client. |
| 66 | `server/utils/tmdbErrorHandler.js` | Express error response formatter | Maps TMDB status codes to 502/503 | Yes | Remain as-is | Cohesive Express utility. |
| 67 | `server/utils/tmdbScoring.js` | Mathematical scoring algorithm for media items | Likelihood bucket assignment | Yes | Remain as-is | Pure calculation utility. |

---

# 3. REFACTORING CANDIDATES

### Prioritized Table

| Priority | Current File | Problem | Proposed Split / Action | Reason |
|----------|--------------|---------|-------------------------|--------|
| **P0** | `client/src/pages/network/useNetworkGraph.js` | **God Hook.** Combines network API fetching, element filtering, Cytoscape canvas initialization, layout configuration, event listeners, and Cytoscape DOM class mutation. | Split into:<br>1. `useNetworkGraph.js` (Canvas ref & Cytoscape lifecycle)<br>2. `filterGraphElements.js` (Pure node/edge filter function)<br>3. `cytoscapeEvents.js` (Event handlers for highlight/dim) | High complexity and poor testability. Imperative Cytoscape manipulation is mixed directly with React hook state. |
| **P1** | `client/src/components/network/GenreDetails.jsx`<br>`FranchiseDetails.jsx`<br>`StudioDetails.jsx`<br>`PersonDetails.jsx`<br>`GenericConnectionDetails.jsx` | Severe structural duplication. Every component duplicates the exact same connection header HTML, count badge layout, and `MediaList` section. | Extract shared layout into `ConnectionDetailsLayout.jsx`. | Reduces boilerplate by 60% in `src/components/network/` and ensures consistent styling. |
| **P1** | `server/services/recommendations/candidateService.js`<br>`server/services/recommendations/historyAnalyzer.js` | **Orphaned Files.** Written for a profile-scoring recommendation algorithm, but never imported or used anywhere. | Remove files OR move to an explicitly marked `experiments/` directory if reserved for future features. | Reduces dead code clutter and avoids developer confusion. |
| **P2** | `client/src/components/network/GenericConnectionDetails.jsx` | Redefines `getConnectionLabel()` internally, duplicating `CONNECTION_LABELS` defined in `client/src/pages/network/connectionTypes.js`. | Import `CONNECTION_LABELS` directly and remove local lookup function. | Single Source of Truth violation. |
| **P2** | `client/src/pages/network/connectionTypes.js` | Defined inside `pages/network/`, but imported by components in `components/network/`. | Move file to `client/src/constants/connectionTypes.js`. | Violates clean dependency direction (components should not depend on page-level folders). |
| **P3** | `client/src/components/network/MediaDetails.jsx` | Duplicates person rendering code twice (once for Directors/Creators and once for Cast). | Extract `NetworkPersonList.jsx` or inline `.map()` helper function. | Cleaner JSX structure. |

---

### Detailed Split Specification for `useNetworkGraph.js`

#### Current Structure
```
client/src/pages/network/useNetworkGraph.js (235 lines)
```

#### Proposed Structure
```
client/src/pages/network/
    ├── hooks/
    │   └── useNetworkGraph.js        # Minimal hook holding canvas ref and Cytoscape lifecycle
    └── utils/
        ├── filterGraphElements.js    # Pure utility: filters nodes/edges by activeTypes & focus
        └── cytoscapeEvents.js        # Event handlers: mouseover/mouseout/tap class toggles
```

#### File Details

1. `filterGraphElements.js`
   - **Responsibility:** Pure input-to-output data transformer.
   - **Logic:** Takes raw `networkData` (`nodes`, `edges`), `activeTypes` Set, and `focusedConnection` object. Returns filtered `{ elements }` formatted for Cytoscape.

2. `cytoscapeEvents.js`
   - **Responsibility:** Imperative Cytoscape class management (`highlighted`, `dimmed`, `show-label`).
   - **Logic:** Exports `attachGraphEventListeners(cy, onNodeSelect, isFocused)` to isolate Cytoscape DOM-like class toggles from React state render loops.

3. `useNetworkGraph.js`
   - **Responsibility:** Managing container ref, triggering API fetch, calling `filterGraphElements`, instantiating/destroying Cytoscape instances, and returning UI state (`selectedNode`, `loading`, `error`).

---

# 4. COMPONENT ANALYSIS

### Components Doing Too Much
- **`useNetworkGraph` (Custom Hook acting as View-Controller):** Handles network fetching, graph filtering, canvas initialization, layout engine, event listening, and Cytoscape styling.

### Components That Should Become Smaller / Shared
- **`ConnectionDetailsLayout.jsx` (New Component):**
  The connection detail components (`GenreDetails`, `FranchiseDetails`, `StudioDetails`, `PersonDetails`, `GenericConnectionDetails`) all share this structure:
  ```jsx
  // Shared Template Pattern:
  <div className="network-connection-heading">
    {iconOrImage}
    <div>
      <span className="network-details-type">{typeLabel}</span>
      <h2>{title}</h2>
    </div>
  </div>
  <div className="network-stat">
    <span className="network-stat-value">{count}</span>
    <span className="network-stat-label">connected {count === 1 ? "title" : "titles"}</span>
  </div>
  <div className="network-details-section network-connected-section">
    <h3>Connected Titles</h3>
    <MediaList media={connectedMedia} />
  </div>
  ```
  Extracting this shell into `ConnectionDetailsLayout` eliminates ~120 lines of redundant code across 5 files.

- **`NetworkPersonList.jsx` (New Component):**
  `MediaDetails.jsx` contains identical JSX for mapping person arrays (directors and actors) to image/placeholder avatars.

### Reusable UI Patterns Identified
- **Image Fallback Pattern:** `CastPerson`, `MediaList`, `PersonDetails`, `StudioDetails`, and `MediaDetails` all re-implement profile image vs. text-letter fallback logic (`imageUrl ? <img .../> : <div className="placeholder">{name.charAt(0)}</div>`).
- **Rating Formatting:** `⭐ rating.toFixed(1)` is repeated in `MediaInfo.jsx`, `MediaDetails.jsx`, and `MediaList.jsx`.

---

# 5. HOOK ANALYSIS

1. **`useNetworkGraph.js`**
   - *Status:* **Needs Refactoring.**
   - *Issue:* Tightly coupled to Cytoscape's imperative DOM-like API. Contains network fetching and complex filtering logic.
   - *Solution:* Extract pure filtering logic and Cytoscape event bindings into separate utility modules.

2. **`useDiscoverSearch.js`**
   - *Status:* **Acceptable.**
   - *Cohesion:* Handles discovery search state (`query`, `year`, `page`), form submit events, and API execution.
   - *Observation:* `pageInput` string state syncs with `page` number state. Works well for form inputs, but could be simplified if pagination input validation is moved to `Pagination.jsx`.

3. **`useAnchoredPanel.js`**
   - *Status:* **Excellent.**
   - *Cohesion:* Perfectly split into a pure positioning math function (`getAnchoredPanelPosition`) and a lifecycle hook binding window resize/scroll observers.

4. **`useMediaDetails.js`**
   - *Status:* **Excellent.**
   - *Cohesion:* Clean, lazy details hook with proper async cleanup (`cancelled` flag).

5. **`useWatchStatus.js` & `useWatchHistory.js`**
   - *Status:* **Excellent.**
   - *Cohesion:* Clean reactive layer over `localStorage` using browser custom event listeners (`WATCH_HISTORY_UPDATED`).

---

# 6. BACKEND ANALYSIS

### Layering Evaluation
The backend follows clean separation of concerns:
```
Express Route  ──>  Service Layer  ──>  Domain/Normalizer  ──>  TMDB Client Utility
```

1. **Routes (`server/routes/`):**
   - Clean and slim. They validate HTTP input params and delegate to service functions, returning errors through `sendTmdbError`.

2. **Services (`server/services/`):**
   - `discoverService.js`: Excellent handling of pagination mismatch (adapts client page size of 30 items to TMDB's fixed 20 items per page).
   - `mediaNormalizer.js`: Converts TMDB's divergent `movie` and `tv` schemas into unified domain models.
   - `graphBuilder.js`: Pure functional graph construction (Nodes & Edges).

3. **Backend Responsibility Violations:**
   - **Dead Code:** `candidateService.js` and `historyAnalyzer.js` are completely unused in the graph flow and serve no current purpose in the server execution paths.

---

# 7. DUPLICATION

### 1. Duplicated Connection Type Lookups
- **Location 1:** `client/src/pages/network/connectionTypes.js` (`CONNECTION_LABELS`)
- **Location 2:** `client/src/components/network/GenericConnectionDetails.jsx` (`getConnectionLabel()`)
- **Fix:** Remove `getConnectionLabel` from `GenericConnectionDetails.jsx` and import `CONNECTION_LABELS`.

### 2. Duplicated Connection Detail Card Layouts
- **Location:** `GenreDetails.jsx`, `FranchiseDetails.jsx`, `StudioDetails.jsx`, `PersonDetails.jsx`, `GenericConnectionDetails.jsx`.
- **Fix:** Create a single `ConnectionDetailsLayout.jsx` wrapper component.

### 3. Duplicated Media Title Normalization
- **Pattern:** `type === "movie" ? item.title : item.name`
- **Location:** Repeated in `MoviePoster.jsx`, `watchlist.js`, `MediaDetails.jsx`, `detailsService.js`, `mediaNormalizer.js`, `networkService.js`.
- **Fix:** Create a client/server utility `getMediaTitle(item)` or rely on backend normalization.

### 4. Duplicated Year Extraction
- **Pattern:** `date?.slice(0, 4)` / `release_date?.slice(0, 4)`
- **Location:** `MediaInfo.jsx`, `detailsService.js`, `mediaNormalizer.js`.
- **Fix:** Standardize year parsing in data normalization services.

---

# 8. DEPENDENCY DIRECTION

### Violations Identified
1. **Component importing from Page directory:**
   `client/src/components/network/PersonDetails.jsx` and `GenericConnectionDetails.jsx` import `CONNECTION_LABELS` from `client/src/pages/network/connectionTypes.js`.
   - *Why it's bad:* Reusable components in `components/` should never depend on page-level files.
   - *Fix:* Move `connectionTypes.js` to `client/src/constants/connectionTypes.js`.

### Ideal Dependency Direction
```
Pages  ──>  Components  ──>  Hooks  ──>  Services / Constants / Utils
```
- Pages consume components and page-specific hooks.
- Components consume generic hooks, UI utilities, and constants.
- Services and constants have zero dependencies on UI layers.

---

# 9. PROPOSED ARCHITECTURE

This structure maintains the existing lightweight React + Express setup without introducing unnecessary libraries (like Redux or Zustand). It reorganizes the network feature files, fixes dependency directions, extracts duplicated component layouts, and cleans up server dead code.

```
client/
  src/
    components/
      common/                      # Generic UI components
        CastList.jsx
        CastPerson.jsx
        ExpandedCard.jsx
        MediaInfo.jsx
        MovieCard.jsx
        MoviePoster.jsx
        Pagination.jsx
        WatchActions.jsx
      network/                     # Network details panel components
        ConnectionDetailsLayout.jsx # NEW: Shared layout for connection details
        FranchiseDetails.jsx
        GenericConnectionDetails.jsx
        GenreDetails.jsx
        MediaDetails.jsx
        MediaList.jsx
        NetworkDetailsPanel.jsx
        PersonDetails.jsx
        StudioDetails.jsx
    constants/
      connectionTypes.js           # MOVED: Centralized connection type definitions
      tmdb.js
    hooks/
      useAnchoredPanel.js
      useDiscoverSearch.js
      useMediaDetails.js
      useWatchHistory.js
      useWatchStatus.js
    pages/
      network/
        components/
          ConnectionExplorer.jsx
        hooks/
          useConnectionSearch.js
          useNetworkGraph.js      # REFACTORED: Slim lifecycle hook
        utils/
          cytoscapeEvents.js      # NEW: Imperative Cytoscape event handlers
          filterGraphElements.js  # NEW: Pure graph element filtering
          networkStyles.js
      Discover.jsx
      Library.jsx
      Network.jsx
    services/
      api.js
      watchlist.js
    styles/
      ...

server/
  config/
    tmdb.js
  routes/
    detailsRoutes.js
    discoverRoutes.js
    healthRoutes.js
    recommendationsRoutes.js
  services/
    detailsService.js
    discoverService.js
    recommendations/
      connectionExtractor.js
      graphBuilder.js
      mediaMetadataService.js
      mediaNormalizer.js
      networkService.js
      # REMOVED: candidateService.js & historyAnalyzer.js (Unused dead code)
  utils/
    tmdbClient.js
    tmdbErrorHandler.js
    tmdbScoring.js
  server.js
```

---

# 10. REFACTORING ORDER

### Phase 1: Shared Constants & Dependency Direction (Low Risk)
1. Move `client/src/pages/network/connectionTypes.js` to `client/src/constants/connectionTypes.js`.
2. Update imports in `PersonDetails.jsx`, `GenericConnectionDetails.jsx`, and `Network.jsx`.
3. Remove local `getConnectionLabel()` in `GenericConnectionDetails.jsx`.

### Phase 2: Deduplicate Network Detail Components (Low Risk)
1. Create `ConnectionDetailsLayout.jsx` in `client/src/components/network/`.
2. Refactor `GenreDetails`, `FranchiseDetails`, `StudioDetails`, `PersonDetails`, and `GenericConnectionDetails` to wrap `ConnectionDetailsLayout`.
3. Test detail panel displays when clicking graph nodes.

### Phase 3: Split `useNetworkGraph` God Hook (Medium Risk)
1. Extract `filterGraphElements.js` (pure filter function).
2. Extract `cytoscapeEvents.js` (Cytoscape highlight/dim logic).
3. Refactor `useNetworkGraph.js` to use the extracted modules.
4. Verify graph rendering, filtering checkboxes, focus mode, and node selections.

### Phase 4: Server Code Cleanup (Zero Risk)
1. Delete unused files `server/services/recommendations/candidateService.js` and `server/services/recommendations/historyAnalyzer.js`.
2. Verify `/api/recommendations/network` route.

---

# 11. WHAT NOT TO CHANGE

1. **Watch History Sync System (`watchlist.js`, `useWatchStatus`, `useWatchHistory`):**
   - *Why:* The custom event implementation over `localStorage` (`WATCH_HISTORY_UPDATED`) is lightweight, clean, and avoids global state dependencies like Redux or Context.

2. **Anchored Panel Math & Portal (`useAnchoredPanel.js`, `ExpandedCard.jsx`):**
   - *Why:* The separation between positioning math (`getAnchoredPanelPosition`) and portal animation (`ExpandedCard`) is clear and performs smoothly.

3. **Server Recommendation Pipeline (`mediaNormalizer`, `connectionExtractor`, `graphBuilder`):**
   - *Why:* The pipeline is functionally pure, easy to trace, and cleanly converts metadata into graph nodes and edges.

4. **TMDB Client Utility (`server/utils/tmdbClient.js`):**
   - *Why:* Includes built-in request timeouts (`AbortController`) and exponential backoff retry logic.

---

# 12. FINAL RECOMMENDATION

### A. Top 10 Recommended Changes
1. **Split `useNetworkGraph.js`** into separate hook and utility modules.
2. **Move `connectionTypes.js`** to `src/constants/` to fix dependency direction.
3. **Extract `ConnectionDetailsLayout.jsx`** to clean up structural duplication across 5 detail panel components.
4. **Remove orphaned server files** (`candidateService.js` and `historyAnalyzer.js`).
5. **Eliminate duplicate connection label logic** in `GenericConnectionDetails.jsx`.
6. **Centralize media title formatting logic** (`type === "movie" ? title : name`).
7. **Extract `NetworkPersonList.jsx`** to reuse cast/crew rendering in `MediaDetails.jsx`.
8. **Centralize rating display formatting** (`rating.toFixed(1)`).
9. **Standardize image placeholder rendering** across components.
10. **Reorganize network components** by co-locating page-specific widgets (`ConnectionExplorer`).

### B. Files That Should Definitely Be Split
- `client/src/pages/network/useNetworkGraph.js`

### C. Files That Should Remain Untouched
- `client/src/hooks/useAnchoredPanel.js`
- `client/src/services/watchlist.js`
- `server/utils/tmdbClient.js`
- `server/services/recommendations/graphBuilder.js`
- `server/services/recommendations/connectionExtractor.js`

### D. Proposed Final Directory Tree
See **Section 9 (Proposed Architecture)** above for full directory visualization.

### E. Recommended First Refactoring Step
**Move `connectionTypes.js` to `src/constants/` and remove duplicate label lookups.**
This is a quick, zero-risk change that immediately fixes architectural dependency direction violations and eliminates duplicated code.