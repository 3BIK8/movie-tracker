import { useCallback, useEffect, useRef, useState } from "react";
import { discoverMedia, discoverPerson } from "../services/api";

export function useDiscoverSearch({ type, personFilter, initialPage = 1 }) {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("");
  const [minRating, setMinRating] = useState("");
  const [maxRating, setMaxRating] = useState("");
  const [sort, setSort] = useState("popularity");
  const [page, setPage] = useState(initialPage);
  const [reloadKey, setReloadKey] = useState(0);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const requestSequence = useRef(0);

  const searchRef = useRef({ query: "", year: "", genre: "", language: "", minRating: "", maxRating: "", sort: "popularity" });
  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMedia = useCallback(async (params, requestId) => {
    try {
      setLoading(true);
      setError("");
      const data = await discoverMedia(params);
      if (requestId !== requestSequence.current) return;
      setItems(data.results || []);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      console.error(err);
      setError(err.message || "Unable to load media.");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  const loadPersonCredits = useCallback(async (params, requestId) => {
    try {
      setLoading(true);
      setError("");
      const data = await discoverPerson(params);
      if (requestId !== requestSequence.current) return;
      setItems(data.results || []);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      console.error(err);
      setError(err.message || "Unable to load person's credits.");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    const timer = window.setTimeout(() => {
      if (personFilter) {
        void loadPersonCredits({ personId: personFilter.id, role: personFilter.role, page }, requestId);
        return;
      }

      void loadMedia({ type, page, ...searchRef.current }, requestId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMedia, loadPersonCredits, page, personFilter, reloadKey, type]);

  function handleSearch(event) {
    event.preventDefault();
    searchRef.current = { query, year, genre, language, minRating, maxRating, sort };
    setPage(1);
    setPageInput("1");
    setReloadKey((current) => current + 1);
  }

  function changeType() {
    setQuery("");
    setYear("");
    setGenre("");
    setLanguage("");
    setMinRating("");
    setMaxRating("");
    setSort("popularity");
    searchRef.current = { query: "", year: "", genre: "", language: "", minRating: "", maxRating: "", sort: "popularity" };
    setPage(1);
    setPageInput("1");
  }

  function changePage(nextPage) {
    setPage(nextPage);
    setPageInput(String(nextPage));
  }

  return {
    query, setQuery, year, setYear, genre, setGenre, language, setLanguage,
    minRating, setMinRating, maxRating, setMaxRating, sort, setSort,
    page, setPage: changePage, pageInput, setPageInput, items, totalPages,
    loading, error, handleSearch, changeType,
  };
}
