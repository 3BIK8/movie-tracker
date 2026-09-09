import { useMemo, useState } from "react";

export function useConnectionSearch(networkData, activeTypes) {
  const [connectionSearch, setConnectionSearch] = useState("");

  const filteredConnections = useMemo(() => {
    const availableConnections =
      networkData?.nodes
        ?.filter(
          (node) =>
            node.type === "connection" && activeTypes.has(node.connectionType),
        )
        .sort((a, b) => {
          if (b.count !== a.count) {
            return b.count - a.count;
          }

          return a.label.localeCompare(b.label);
        }) || [];

    const normalizedSearch = connectionSearch.trim().toLowerCase();

    return availableConnections
      .filter((connection) => {
        if (!normalizedSearch) {
          return true;
        }

        return connection.label.toLowerCase().includes(normalizedSearch);
      })
      .slice(0, 30);
  }, [networkData, activeTypes, connectionSearch]);

  return {
    connectionSearch,
    setConnectionSearch,
    filteredConnections,
  };
}
