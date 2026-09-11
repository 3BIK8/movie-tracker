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
const RELAXATION_STEPS = 50;
const RELAXATION_ALPHA = 0.08;
const CONNECTION_OFFSET = 72;
const MAX_VERTICAL_RATIO = 0.56;

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

function assignProjectedPointsToHexes(mediaNodes, projection) {
  const cells = generateHexCells(mediaNodes.length);
  const targets = projection.map((point, index) => ({
    ...point,
    index,
    radius: Math.hypot(point.x, point.y),
  }));
  const order = [...targets].sort(
    (a, b) =>
      a.radius - b.radius ||
      compareNodes(mediaNodes[a.index], mediaNodes[b.index]),
  );
  const available = new Set(cells.map((_, index) => index));
  const positions = new Array(mediaNodes.length);

  for (const target of order) {
    let bestCellIndex = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cellIndex of available) {
      const point = hexToPoint(cells[cellIndex]);
      const distance = Math.hypot(point.x - target.x * GRID_BASE_STEP, point.y - target.y * GRID_BASE_STEP);
      if (
        distance < bestDistance ||
        (distance === bestDistance && (bestCellIndex === null || cellIndex < bestCellIndex))
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

function getSimilarityMap(mediaNodes, similarityMatrix) {
  const map = new Map();
  mediaNodes.forEach((node, index) => {
    map.set(node.id, new Map());
    mediaNodes.forEach((other, otherIndex) => {
      if (node.id !== other.id) {
        map.get(node.id).set(other.id, similarityMatrix[index][otherIndex]);
      }
    });
  });
  return map;
}

function constrainVerticalSpread(positions) {
  if (!positions.length) return;

  const maxX = Math.max(...positions.map((position) => Math.abs(position.x)), GRID_BASE_STEP);
  const maxY = Math.max(...positions.map((position) => Math.abs(position.y)));
  const allowedY = Math.max(
    GRID_BASE_STEP,
    maxX * MAX_VERTICAL_RATIO / NETWORK_ASPECT_RATIO,
  );

  if (maxY <= allowedY) return;

  const scale = allowedY / maxY;
  for (const position of positions) position.y *= scale;
}

function relaxMovieMesh(mediaNodes, positions, similarityMatrix) {
  const similarity = getSimilarityMap(mediaNodes, similarityMatrix);
  const result = positions.map((position) => ({ ...position }));

  for (let step = 0; step < RELAXATION_STEPS; step += 1) {
    for (let i = 0; i < mediaNodes.length; i += 1) {
      let nextX = result[i].x;
      let nextY = result[i].y;

      for (let j = 0; j < mediaNodes.length; j += 1) {
        if (i === j) continue;
        const score = similarity.get(mediaNodes[i].id)?.get(mediaNodes[j].id) || 0;
        if (score <= 0) continue;

        const dx = result[j].x - result[i].x;
        const dy = result[j].y - result[i].y;
        const distance = Math.hypot(dx, dy) || GRID_BASE_STEP;
        const target = GRID_BASE_STEP * (1 - 0.5 * score);
        const displacement = ((distance - target) / distance) * score;

        nextX += dx * displacement * RELAXATION_ALPHA;
        nextY += dy * displacement * RELAXATION_ALPHA;
      }

      result[i] = { x: nextX, y: nextY };
    }

    constrainVerticalSpread(result);
  }

  return result;
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (a.x + t * dx),
    point.y - (a.y + t * dy),
  );
}

function connectionSort(a, b) {
  return (
    (b.connectedMediaIds?.length || 0) - (a.connectedMediaIds?.length || 0) ||
    sortConnectionTypes([a.connectionType, b.connectionType])[0] === a.connectionType ? -1 : 1 ||
    canonicalId(a).localeCompare(canonicalId(b))
  );
}

function placeConnectionNodes(connectionNodes, mediaNodes, mediaPositions) {
  const mediaIds = new Set(mediaNodes.map((node) => node.id));
  const mediaPositionById = new Map(
    mediaNodes.map((node, index) => [node.id, mediaPositions[index]]),
  );
  const occupiedMovies = mediaNodes.map((node) => ({
    id: node.id,
    ...mediaPositionById.get(node.id),
  }));
  const result = {};
  const ordered = [...connectionNodes].sort(connectionSort);

  for (const node of ordered) {
    const connected = getConnectedMediaIds(node, mediaIds)
      .map((id) => mediaPositionById.get(id))
      .filter(Boolean);

    if (!connected.length) {
      result[node.id] = { x: 0, y: 0 };
      continue;
    }

    let candidate;
    if (connected.length === 1) {
      candidate = {
        x: connected[0].x + CONNECTION_OFFSET,
        y: connected[0].y - CONNECTION_OFFSET,
      };
    } else if (connected.length === 2) {
      const [a, b] = connected;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const sign = canonicalId(node)
        .split("")
        .reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 === 0 ? 1 : -1;
      candidate = {
        x: midpoint.x + (-dy / length) * CONNECTION_OFFSET * sign,
        y: midpoint.y + (dx / length) * CONNECTION_OFFSET * sign,
      };
    } else {
      candidate = connected.reduce(
        (centroid, point) => ({
          x: centroid.x + point.x / connected.length,
          y: centroid.y + point.y / connected.length,
        }),
        { x: 0, y: 0 },
      );
    }

    const offsets = [
      { x: 0, y: 0 },
      { x: CONNECTION_OFFSET, y: 0 },
      { x: -CONNECTION_OFFSET, y: 0 },
      { x: 0, y: CONNECTION_OFFSET },
      { x: 0, y: -CONNECTION_OFFSET },
      { x: CONNECTION_OFFSET / 2, y: CONNECTION_OFFSET * 0.866 },
      { x: -CONNECTION_OFFSET / 2, y: CONNECTION_OFFSET * 0.866 },
    ];

    let best = candidate;
    let bestPenalty = Number.POSITIVE_INFINITY;
    for (const offset of offsets) {
      const point = { x: candidate.x + offset.x, y: candidate.y + offset.y };
      const moviePenalty = occupiedMovies.reduce(
        (sum, movie) =>
          sum + Math.max(0, 100 - Math.hypot(point.x - movie.x, point.y - movie.y)),
        0,
      );
      const connectionPenalty = Object.values(result).reduce(
        (sum, existing) =>
          sum + Math.max(0, 60 - Math.hypot(point.x - existing.x, point.y - existing.y)),
        0,
      );
      const penalty = moviePenalty + connectionPenalty;
      if (penalty < bestPenalty) {
        best = point;
        bestPenalty = penalty;
      }
    }

    result[node.id] = best;
  }

  return result;
}

export function buildEdgeAwareControlPoint(source, target, center) {
  const midpoint = {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2,
  };
  const outward = { x: midpoint.x - center.x, y: midpoint.y - center.y };
  const length = Math.hypot(outward.x, outward.y) || 1;
  const offset = Math.min(70, 18 + length * 0.04);

  return {
    x: midpoint.x + (outward.x / length) * offset,
    y: midpoint.y + (outward.y / length) * offset,
  };
}

/**
 * HCCT-Mesh: Constrained Hex-Centroid Interlocking Net.
 *
 * The Network visualizes the complete watched-history graph. Similarity is
 * used only to arrange titles and place relationship nodes locally; it never
 * decides whether a watched title belongs in the graph.
 */
export function buildStructuredNetworkLayout(nodes) {
  const mediaNodes = nodes.filter((node) => node.type === "media").sort(compareNodes);
  const connectionNodes = nodes.filter((node) => node.type === "connection").sort(compareNodes);

  if (!mediaNodes.length) return {};

  const features = buildFeatureSets(mediaNodes, connectionNodes);
  const similarityMatrix = buildSimilarityMatrix(mediaNodes, features);
  const projection = spectralProjection(similarityMatrix);
  const hexPositions = assignProjectedPointsToHexes(mediaNodes, projection);
  const relaxedPositions = relaxMovieMesh(mediaNodes, hexPositions, similarityMatrix);
  const positions = {};

  mediaNodes.forEach((node, index) => {
    positions[node.id] = relaxedPositions[index];
  });

  Object.assign(
    positions,
    placeConnectionNodes(connectionNodes, mediaNodes, relaxedPositions),
  );

  return positions;
}

export const STRUCTURED_NETWORK_LAYOUT = {
  name: "preset",
  fit: true,
  padding: 70,
};
