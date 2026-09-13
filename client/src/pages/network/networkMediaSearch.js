function getSearchTitle(node) {
  return String(node?.title || node?.displayLabel || node?.label || "").trim();
}

export function searchNetworkMedia(nodes, query, limit = 20) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return [];

  return (nodes || [])
    .filter((node) => node.type === "media")
    .map((node) => ({ ...node, searchTitle: getSearchTitle(node) }))
    .filter((node) => node.searchTitle.toLowerCase().includes(normalized))
    .sort((a, b) => {
      const aTitle = a.searchTitle.toLowerCase();
      const bTitle = b.searchTitle.toLowerCase();
      return (
        (aTitle.startsWith(normalized) ? 0 : 1) -
          (bTitle.startsWith(normalized) ? 0 : 1) ||
        aTitle.localeCompare(bTitle) ||
        String(a.id).localeCompare(String(b.id))
      );
    })
    .slice(0, limit);
}
