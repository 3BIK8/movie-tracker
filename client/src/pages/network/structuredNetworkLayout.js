const CONNECTION_TYPE_ORDER = [
  "actor",
  "director",
  "franchise",
  "genre",
  "studio",
  "keyword",
  "language",
  "decade",
  "mediaType",
];

const MEDIA_COLUMN_GAP = 180;
const MEDIA_ROW_GAP = 150;
const CONNECTION_COLUMN_GAP = 220;
const CONNECTION_ROW_GAP = 90;
const CONNECTION_LANE_GAP = 130;
const MEDIA_COLUMNS = 6;

function compareNodes(a, b) {
  return (
    String(a.displayLabel || a.label || a.title || "").localeCompare(
      String(b.displayLabel || b.label || b.title || ""),
    ) || String(a.id).localeCompare(String(b.id))
  );
}

function sortConnectionTypes(types) {
  return [...types].sort(
    (a, b) =>
      (CONNECTION_TYPE_ORDER.indexOf(a) === -1
        ? CONNECTION_TYPE_ORDER.length
        : CONNECTION_TYPE_ORDER.indexOf(a)) -
        (CONNECTION_TYPE_ORDER.indexOf(b) === -1
          ? CONNECTION_TYPE_ORDER.length
          : CONNECTION_TYPE_ORDER.indexOf(b)) ||
      a.localeCompare(b),
  );
}

/**
 * Builds a deterministic, non-force-directed presentation.
 *
 * Media form the primary grid. Connection types are placed in dedicated
 * vertical lanes to the right of that grid. The backend graph remains
 * unchanged; this is strictly a client-side spatial projection.
 */
export function buildStructuredNetworkLayout(nodes) {
  const mediaNodes = nodes
    .filter((node) => node.type === "media")
    .sort(compareNodes);
  const connectionNodes = nodes
    .filter((node) => node.type === "connection")
    .sort(compareNodes);

  const mediaColumns = Math.min(MEDIA_COLUMNS, Math.max(mediaNodes.length, 1));
  const mediaRows = Math.max(1, Math.ceil(mediaNodes.length / mediaColumns));
  const mediaWidth = Math.max(0, mediaColumns - 1) * MEDIA_COLUMN_GAP;

  const positions = {};

  mediaNodes.forEach((node, index) => {
    const row = Math.floor(index / mediaColumns);
    const column = index % mediaColumns;

    positions[node.id] = {
      x: column * MEDIA_COLUMN_GAP,
      y: row * MEDIA_ROW_GAP,
    };
  });

  const connectionTypes = sortConnectionTypes(
    new Set(connectionNodes.map((node) => node.connectionType)),
  );

  const connectionGroups = new Map(
    connectionTypes.map((type) => [
      type,
      connectionNodes.filter((node) => node.connectionType === type),
    ]),
  );

  connectionTypes.forEach((type, laneIndex) => {
    const group = connectionGroups.get(type);
    const laneX = mediaWidth + CONNECTION_COLUMN_GAP + laneIndex * CONNECTION_LANE_GAP;

    group.forEach((node, index) => {
      const connectedMedia = (node.connectedMediaIds || [])
        .map((id) => positions[id])
        .filter(Boolean);

      const averageY = connectedMedia.length
        ? connectedMedia.reduce((sum, position) => sum + position.y, 0) /
          connectedMedia.length
        : (index % mediaRows) * MEDIA_ROW_GAP;

      positions[node.id] = {
        x: laneX,
        y: averageY + index * CONNECTION_ROW_GAP,
      };
    });
  });

  return positions;
}

export const STRUCTURED_NETWORK_LAYOUT = {
  name: "preset",
  fit: true,
  padding: 100,
};
