import { useEffect, useState } from "react";
import DiscoverView from "./pages/Discover";
import LibraryView from "./pages/Library";
import NetworkView from "./pages/Network";
import PersonView from "./pages/Person";
import RecommendationsView from "./pages/Recommendations";
import {
  initializeWatchHistory,
  migrateWatchHistoryGenres,
} from "./services/watchlist";

function getNavigationState() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  if (view === "person") {
    return {
      view,
      personId: params.get("personId"),
      personName: params.get("personName") || "",
      role: params.get("role") || "actor",
    };
  }

  if (view === "library" || view === "network" || view === "recommendations") {
    return { view };
  }

  return { view: "discover" };
}

function App() {
  const [navigation, setNavigation] = useState(getNavigationState);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  useEffect(() => {
    const handlePopState = () => {
      setNavigation(getNavigationState());
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

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
    const params = new URLSearchParams(window.location.search);

    if (newView === "discover") {
      params.delete("view");
      params.delete("personId");
      params.delete("personName");
      params.delete("role");
    } else {
      params.set("view", newView);
      params.delete("personId");
      params.delete("personName");
      params.delete("role");
    }

    const query = params.toString();
    const nextUrl = query ? `?${query}` : window.location.pathname;

    window.history.replaceState(null, "", nextUrl);
    setNavigation({ view: newView });
  }

  function openPerson(person) {
    if (!person?.id) {
      return;
    }

    const params = new URLSearchParams();
    params.set("view", "person");
    params.set("personId", String(person.id));
    params.set("role", person.role === "director" ? "director" : "actor");

    if (person.name) {
      params.set("personName", person.name);
    }

    window.history.pushState(null, "", `?${params.toString()}`);
    setNavigation({
      view: "person",
      personId: String(person.id),
      personName: person.name || "",
      role: person.role === "director" ? "director" : "actor",
    });
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

  const { view } = navigation;

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
        {view === "discover" && <DiscoverView onPersonClick={openPerson} />}
        {view === "recommendations" && (
          <RecommendationsView onPersonClick={openPerson} />
        )}
        {view === "library" && <LibraryView />}
        {view === "network" && <NetworkView />}
        {view === "person" && navigation.personId && (
          <PersonView
            personId={navigation.personId}
            personName={navigation.personName}
            role={navigation.role}
            onPersonClick={openPerson}
          />
        )}
      </main>
    </>
  );
}

export default App;
