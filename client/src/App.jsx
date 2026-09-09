import { useEffect, useState } from "react";
import DiscoverView from "./pages/Discover";
import LibraryView from "./pages/Library";
import NetworkView from "./pages/Network";
import { migrateWatchHistoryGenres } from "./services/watchlist";
import RecommendationsView from "./pages/Recommendations";

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
  useEffect(() => {
    void migrateWatchHistoryGenres();
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
