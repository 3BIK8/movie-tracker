import { useEffect, useState } from "react";
import DiscoverView from "./pages/Discover";
import LibraryView from "./pages/Library";
import NetworkView from "./pages/Network";
import RecommendationsView from "./pages/Recommendations";
import {
  initializeWatchHistory,
  migrateWatchHistoryGenres,
} from "./services/watchlist";

function getInitialView() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "library" || view === "network" || view === "recommendations") {
    return view;
  }
  return "discover";
}

function App() {
  const [view, setView] = useState(getInitialView);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const result = await initializeWatchHistory();

        if (result.migrated) {
          await migrateWatchHistoryGenres();
        }

        if (active) {
          setHistoryReady(true);
        }
      } catch (error) {
        console.error("Unable to initialize persistent watch history", error);

        if (active) {
          setHistoryError(error);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, []);

  function changeView(newView) {
    setView(newView);

    const params = new URLSearchParams(window.location.search);

    if (newView === "discover") {
      params.delete("view");
    } else {
      params.set("view", newView);
    }

    const query = params.toString();

    window.history.replaceState(
      null,
      "",
      query ? `?${query}` : window.location.pathname,
    );
  }

  if (historyError) {
    return (
      <main>
        <section className="error-state">
          <h1>Watch history unavailable</h1>
          <p>
            The application could not connect to its persistent watch-history
            database.
          </p>
          <p>{historyError.message}</p>
        </section>
      </main>
    );
  }

  if (!historyReady) {
    return (
      <main>
        <section className="loading-state">
          <p>Loading your watch history…</p>
        </section>
      </main>
    );
  }

  return (
    <>
      <nav className="main-nav">
        <button
          className={view === "discover" ? "active" : ""}
          onClick={() => changeView("discover")}
        >
          Discover
        </button>

        <button
          className={view === "library" ? "active" : ""}
          onClick={() => changeView("library")}
        >
          Library
        </button>

        <button
          className={view === "network" ? "active" : ""}
          onClick={() => changeView("network")}
        >
          Network
        </button>
        <button
          className={view === "recommendations" ? "active" : ""}
          onClick={() => changeView("recommendations")}
        >
          Recommendations
        </button>
      </nav>

      <main>
        {view === "discover" && <DiscoverView />}
        {view === "recommendations" && <RecommendationsView />}
        {view === "library" && <LibraryView />}
        {view === "network" && <NetworkView />}
      </main>
    </>
  );
}

export default App;
