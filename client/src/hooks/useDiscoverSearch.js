import { useCallback, useEffect, useRef, useState } from "react";
import { discoverMedia, discoverPerson } from "../services/api";

export function useDiscoverSearch({ type, personFilter, initialPage = 1 }) {
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(initialPage);
  const [reloadKey, setReloadKey] = useState(0);
  const [pageInput, setPageInput] = useState("1");

  const searchRef = useRef({ query: "", year: "" });

  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMedia = useCallback(async ({ type, query, year, page }) => {
    try {
      setLoading(true);
      setError("");

      const data = await discoverMedia({
        type,
        query,
        year,
        page,
      });

      setItems(data.results || []);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPersonCredits = useCallback(async ({ personId, role, page }) => {
    try {
      setLoading(true);
      setError("");

      const data = await discoverPerson({
        personId,
        role,
        page,
      });

      setItems(data.results || []);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (personFilter) {
        void loadPersonCredits({
          personId: personFilter.id,
          role: personFilter.role,
          page,
        });

        return;
      }

      void loadMedia({
        type,
        page,
        ...searchRef.current,
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMedia, loadPersonCredits, page, personFilter, reloadKey, type]);

  function handleSearch(event) {
    event.preventDefault();

    searchRef.current = { query, year };
    setPage(1);
    setReloadKey((current) => current + 1);
  }

  function changeType(newType) {
    setQuery("");
    setYear("");
    searchRef.current = { query: "", year: "" };
    setPage(1);
  }

  return {
    query,
    setQuery,
    year,
    setYear,
    page,
    setPage,
    pageInput,
    setPageInput,
    items,
    totalPages,
    loading,
    error,
    handleSearch,
    changeType,
  };
}
