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

const FEATURE_TYPES = ["actor", "director", "genre", "studio"];
const GRID_BASE_STEP = 150;
const NETWORK_ASPECT_RATIO = 1.77;
const INTERSTITIAL_STEP = 42;
const MIN_MEDIA_GAP = 48;
const MIN_CONNECTION_GAP = 18;
const SPECTRAL_LAYOUT_MAX_MEDIA = 300;

function canonicalDate(node) {
  return String(
    node.releaseDate ||
      node.release_date ||
      node.firstAirDate ||
      node.first_air_date ||
      "9999-99-99",
  );
}

function canonicalId(node) {
  return String(node.id || node.mediaId || "");
}

function compareNodes(a, b) {
  return (
    canonicalDate(a).localeCompare(canonicalDate(b)) ||
    canonicalId(a).localeCompare(canonicalId(b)) ||
    String(a.displayLabel || a.label || a.title || "").localeCompare(
      String(b.displayLabel || b.label || b.title || ""),
    )
  );
}

function connectionTypeRank(type) {
  const index = CONNECTION_TYPE_ORDER.indexOf(type);
  return index === -1 ? CONNECTION_TYPE_ORDER.length : index;
}

function connectionKey(node) {
  return `${node.connectionType || "connection"}:${node.id}`;
}

function getConnectedMediaIds(node, mediaIds) {
  return (node.connectedMediaIds || []).filter((id) => mediaIds.has(id));
}

function buildFeatureSets(mediaNodes, connectionNodes) {
  const mediaIds = new Set(mediaNodes.map((node) => node.id));
  const features = new Map(
    mediaNodes.map((node) => [
      node.id,
      new Map(FEATURE_TYPES.map((type) => [type, new Set()])),
    ]),
  );

  for (const connection of connectionNodes) {
    if (!FEATURE_TYPES.includes(connection.connectionType)) continue;
    const key = connectionKey(connection);
    for (const mediaId of getConnectedMediaIds(connection, mediaIds)) {
      features.get(mediaId)?.get(connection.connectionType)?.add(key);
    }
  }

  return features;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;

  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }

  return intersection / (a.size + b.size - intersection || 1);
}

export function movieSimilarity(a, b, features) {
  const aFeatures = features.get(a.id);
  const bFeatures = features.get(b.id);
  if (!aFeatures || !bFeatures) return 0;

  return (
    FEATURE_TYPES.reduce(
      (sum, type) => sum + jaccard(aFeatures.get(type), bFeatures.get(type)),
      0,
    ) / FEATURE_TYPES.length
  );
}

function buildSimilarityMatrix(mediaNodes, features) {
  const matrix = mediaNodes.map(() => mediaNodes.map(() => 0));

  for (let i = 0; i < mediaNodes.length; i += 1) {
    for (let j = i + 1; j < mediaNodes.length; j += 1) {
      const similarity = movieSimilarity(mediaNodes[i], mediaNodes[j], features);
      matrix[i][j] = similarity;
      matrix[j][i] = similarity;
    }
  }

  return matrix;
}

function centerMatrix(matrix) {
  const n = matrix.length;
  if (!n) return [];

  const rowMeans = matrix.map(
    (row) => row.reduce((sum, value) => sum + value, 0) / n,
  );
  const totalMean = rowMeans.reduce((sum, value) => sum + value, 0) / n;

  return matrix.map((row, i) =>
    row.map((value, j) => value - rowMeans[i] - rowMeans[j] + totalMean),
  );
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function normalize(vector) {
  const norm = Math.sqrt(dot(vector, vector));
  return norm > 1e-9 ? vector.map((value) => value / norm) : vector.map(() => 0);
}

function orthogonalize(vector, basis) {
  let result = [...vector];
  for (const existing of basis) {
    const projection = dot(result, existing);
    result = result.map((value, index) => value - projection * existing[index]);
  }
  return result;
}

function normalizeSign(vector) {
  const pivot = vector.find((value) => Math.abs(value) > 1e-8);
  return pivot !== undefined && pivot < 0 ? vector.map((value) => -value) : vector;
}

function spectralProjection(similarityMatrix) {
  const n = similarityMatrix.length;
  if (!n) return [];
  if (n === 1) return [{ x: 0, y: 0 }];

  const kernel = centerMatrix(similarityMatrix);
  const axes = [];
  const scales = [];

  for (let axis = 0; axis < Math.min(2, n); axis += 1) {
    let vector = Array.from({ length: n }, (_, index) =>
      Math.sin((index + 1) * (axis + 1) * 1.61803398875),
    );
    vector = normalize(orthogonalize(vector, axes));

    for (let iteration = 0; iteration < 60; iteration += 1) {
      vector = normalize(
        orthogonalize(multiplyMatrixVector(kernel, vector), axes),
      );
    }

    const eigenvalue = Math.max(
      dot(vector, multiplyMatrixVector(kernel, vector)),
      0,
    );
    axes.push(normalizeSign(vector));
    scales.push(Math.sqrt(eigenvalue));
  }

  return Array.from({ length: n }, (_, index) => ({
    x: (axes[0]?.[index] || 0) * (scales[0] || 1),
    y: (axes[1]?.[index] || 0) * (scales[1] || 1),
  }));
}

function axialDistance(a, b) {
  return (
    Math.abs(a.q - b.q) +
    Math.abs(a.q + a.r - b.q - b.r) +
    Math.abs(a.r - b.r)
  ) / 2;
}

function generateHexCells(count) {
  const cells = [{ q: 0, r: 0 }];

  for (let radius = 1; cells.length < count; radius += 1) {
    const ring = [];
    for (let q = -radius; q <= radius; q += 1) {
      for (let r = -radius; r <= radius; r += 1) {
        if (axialDistance({ q: 0, r: 0 }, { q, r }) === radius) {
          ring.push({ q, r });
        }
      }
    }

    ring.sort(
      (a, b) =>
        Math.atan2(a.r, a.q) - Math.atan2(b.r, b.q) ||
        a.q - b.q ||
        a.r - b.r,
    );
    cells.push(...ring);
  }

  return cells.slice(0, count);
}

function hexToPoint(cell) {
  return {
    x: 1.5 * GRID_BASE_STEP * cell.q * NETWORK_ASPECT_RATIO,
    y: Math.sqrt(3) * GRID_BASE_STEP * (cell.r + cell.q / 2),
  };
}

function mediaFeatureDegree(node, features) {
  const featureSets = features.get(node.id);
  if (!featureSets) return 0;
  return FEATURE_TYPES.reduce((sum, type) => sum + featureSets.get(type).size, 0);
}

function assignProjectedPointsToHexes(mediaNodes, projection, features) {
  const cells = generateHexCells(mediaNodes.length);
  const targets = projection.map((point, index) => ({
    ...point,
    index,
    radius: Math.hypot(point.x, point.y),
  }));
  const hubIndex = mediaNodes.reduce((best, node, index) => {
    const nodeDegree = mediaFeatureDegree(node, features);
    const bestDegree = mediaFeatureDegree(mediaNodes[best], features);

    if (nodeDegree > bestDegree) return index;
    if (nodeDegree === bestDegree && compareNodes(node, mediaNodes[best]) < 0) {
      return index;
    }
    return best;
  }, 0);
  const order = [...targets].sort(
    (a, b) =>
      a.radius - b.radius ||
      compareNodes(mediaNodes[a.index], mediaNodes[b.index]),
  );
  const available = new Set(cells.map((_, index) => index));
  const positions = new Array(mediaNodes.length);

  positions[hubIndex] = hexToPoint(cells[0]);
  available.delete(0);

  for (const target of order) {
    if (target.index === hubIndex) continue;

    let bestCellIndex = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cellIndex of available) {
      const point = hexToPoint(cells[cellIndex]);
      const distance = Math.hypot(
        point.x - target.x * GRID_BASE_STEP,
        point.y - target.y * GRID_BASE_STEP,
      );

      if (
        distance < bestDistance ||
        (distance === bestDistance &&
          (bestCellIndex === null || cellIndex < bestCellIndex))
      ) {
        bestCellIndex = cellIndex;
        bestDistance = distance;
      }
    }

    positions[target.index] = hexToPoint(cells[bestCellIndex]);
    available.delete(bestCellIndex);
  }

  return positions;
}

function assignLargeNetworkToHexes(mediaNodes, connectionNodes) {
  const cells = generateHexCells(mediaNodes.length);
  const mediaDegree = new Map(mediaNodes.map((node) => [node.id, 0]));

  for (const connection of connectionNodes) {
    for (const mediaId of connection.connectedMediaIds || []) {
      if (mediaDegree.has(mediaId)) {
        mediaDegree.set(mediaId, mediaDegree.get(mediaId) + 1);
      }
    }
  }

  const ordered = [...mediaNodes].sort(
    (a, b) =>
      mediaDegree.get(b.id) - mediaDegree.get(a.id) || compareNodes(a, b),
  );

  return ordered.reduce((positions, node, index) => {
    positions[node.id] = hexToPoint(cells[index]);
    return positions;
  }, {});
}

function getConnectionCandidates(connected, node) {
  const candidates = [];

  if (connected.length === 1) {
    const anchor = connected[0];
    candidates.push(
      { x: anchor.x + INTERSTITIAL_STEP, y: anchor.y - INTERSTITIAL_STEP },
      { x: anchor.x - INTERSTITIAL_STEP, y: anchor.y + INTERSTITIAL_STEP },
      { x: anchor.x + INTERSTITIAL_STEP, y: anchor.y + INTERSTITIAL_STEP },
      { x: anchor.x - INTERSTITIAL_STEP, y: anchor.y - INTERSTITIAL_STEP },
    );
  } else if (connected.length === 2) {
    const [a, b] = connected;
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const sign = canonicalId(node)
      .split("")
      .reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 === 0
      ? 1
      : -1;

    candidates.push(
      {
        x: midpoint.x + (-dy / length) * INTERSTITIAL_STEP * sign,
        y: midpoint.y + (dx / length) * INTERSTITIAL_STEP * sign,
      },
      {
        x: midpoint.x + (dy / length) * INTERSTITIAL_STEP * sign,
        y: midpoint.y + (-dx / length) * INTERSTITIAL_STEP * sign,
      },
    );
  } else {
    const centroid = connected.reduce(
      (result, point) => ({
        x: result.x + point.x / connected.length,
        y: result.y + point.y / connected.length,
      }),
      { x: 0, y: 0 },
    );

    candidates.push(centroid);

    for (let radius = 1; radius <= 5; radius += 1) {
      const distance = INTERSTITIAL_STEP * radius;
      for (let sector = 0; sector < 6; sector += 1) {
        const angle = (Math.PI / 3) * sector;
        candidates.push({
          x: centroid.x + Math.cos(angle) * distance,
          y: centroid.y + Math.sin(angle) * distance,
        });
      }
    }
  }

  return candidates;
}

function isOpenInterstitial(point, moviePositions, connectionPositions) {
  return (
    moviePositions.every(
      (movie) => Math.hypot(movie.x - point.x, movie.y - point.y) >= MIN_MEDIA_GAP,
    ) &&
    connectionPositions.every(
      (connection) =>
        Math.hypot(connection.x - point.x, connection.y - point.y) >=
        MIN_CONNECTION_GAP,
    )
  );
}

function placeConnectionNodes(connectionNodes, mediaNodes, mediaPositions) {
  const mediaIds = new Set(mediaNodes.map((node) => node.id));
  const mediaPositionById = new Map(
    mediaNodes.map((node, index) => [node.id, mediaPositions[index]]),
  );
  const moviePositions = mediaNodes.map((node) => mediaPositionById.get(node.id));
  const result = {};
  const ordered = [...connectionNodes].sort(
    (a, b) =>
      (b.connectedMediaIds?.length || 0) - (a.connectedMediaIds?.length || 0) ||
      connectionTypeRank(a.connectionType) - connectionTypeRank(b.connectionType) ||
      canonicalId(a).localeCompare(canonicalId(b)),
  );

  for (const node of ordered) {
    const connected = getConnectedMediaIds(node, mediaIds)
      .map((id) => mediaPositionById.get(id))
      .filter(Boolean);
    const candidates = getConnectionCandidates(connected, node);
    const connectionPositions = Object.values(result);
    let chosen = candidates.find((point) =>
      isOpenInterstitial(point, moviePositions, connectionPositions),
    );

    if (!chosen) {
      const anchor = candidates[0] || { x: 0, y: 0 };
      for (let ring = 6; ring <= 12 && !chosen; ring += 1) {
        const distance = INTERSTITIAL_STEP * ring;
        for (let sector = 0; sector < 6; sector += 1) {
          const angle = (Math.PI / 3) * sector;
          const point = {
            x: anchor.x + Math.cos(angle) * distance,
            y: anchor.y + Math.sin(angle) * distance,
          };
          if (isOpenInterstitial(point, moviePositions, connectionPositions)) {
            chosen = point;
            break;
          }
        }
      }
    }

    result[node.id] = chosen || candidates[0] || { x: 0, y: 0 };
  }

  return result;
}

export function buildEdgeCurveDistance(source, target, center) {
  const midpoint = {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2,
  };
  const outwardDistance = Math.hypot(
    midpoint.x - center.x,
    midpoint.y - center.y,
  );
  const baseDistance = Math.min(
    Math.max(Math.hypot(target.x - source.x, target.y - source.y) * 0.09, 12),
    54,
  );

  return baseDistance + Math.min(outwardDistance * 0.04, 8);
}

export function buildStructuredNetworkLayout(nodes) {
  const mediaNodes = nodes
    .filter((node) => node.type === "media")
    .sort(compareNodes);
  const connectionNodes = nodes
    .filter((node) => node.type === "connection")
    .sort(compareNodes);

  if (!mediaNodes.length) {
    return Object.fromEntries(
      connectionNodes.map((node, index) => [
        node.id,
        { x: index * INTERSTITIAL_STEP * 2, y: 0 },
      ]),
    );
  }

  const features = buildFeatureSets(mediaNodes, connectionNodes);
  let positions;

  if (mediaNodes.length > SPECTRAL_LAYOUT_MAX_MEDIA) {
    positions = assignLargeNetworkToHexes(mediaNodes, connectionNodes);
  } else {
    const similarityMatrix = buildSimilarityMatrix(mediaNodes, features);
    const projection = spectralProjection(similarityMatrix);
    const mediaPositions = assignProjectedPointsToHexes(
      mediaNodes,
      projection,
      features,
    );
    positions = Object.fromEntries(
      mediaNodes.map((node, index) => [node.id, mediaPositions[index]]),
    );
  }

  const mediaPositions = mediaNodes.map((node) => positions[node.id]);
  Object.assign(
    positions,
    placeConnectionNodes(connectionNodes, mediaNodes, mediaPositions),
  );

  return positions;
}
