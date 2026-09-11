import { tmdbFetch } from "../../utils/tmdbClient.js";
import { getMediaMetadata } from "./mediaMetadataService.js";
import { getMediaConnections } from "./connectionExtractor.js";
import { mapWithConcurrency } from "../../utils/runWithConcurrency.js";

const MAX_BRIDGE_CANDIDATES = 12;
const MAX_CONNECTIONS_PER_BRIDGE = 3;
const DISCOVERY_CONCURRENCY = 3;
const BRIDGE_ENRICHMENT_CONCURRENCY = 3;

const SECOND_ORDER_CONNECTION_TYPES = new Set([
  "actor",
  "director",
  "franchise",
  "studio",
]);

function getBridgeEvidence(candidate) {
  return candidate.sources.reduce(
    (sum, source) => sum + (source.evidenceScore || 0),
    0,
  );
}

export function selectMultiHopBridges(candidates) {
  return [...candidates]
    .sort((a, b) => {
      const sourceCountDifference = b.sources.length - a.sources.length;
      if (sourceCountDifference !== 0) return sourceCountDifference;

      const evidenceDifference =
        getBridgeEvidence(b) - getBridgeEvidence(a);
      if (evidenceDifference !== 0) return evidenceDifference;

      return `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`);
    })
    .slice(0, MAX_BRIDGE_CANDIDATES);
}

export function getSecondOrderConnections(metadata) {
  return getMediaConnections(metadata)
    .filter((connection) => SECOND_ORDER_CONNECTION_TYPES.has(connection.type))
    .sort((a, b) =>
      `${a.type}:${a.value}`.localeCompare(`${b.type}:${b.value}`),
    )
    .slice(0, MAX_CONNECTIONS_PER_BRIDGE);
}

function createMultiHopSource(bridge, connection) {
  return {
    type: "multiHop",
    value: `${bridge.type}:${bridge.id}->${connection.type}:${connection.value}`,
    evidenceScore: getBridgeEvidence(bridge),
    confidence: Math.max(
      0,
      ...bridge.sources.map((source) => source.confidence || 0),
    ),
    appearances: Math.max(
      0,
      ...bridge.sources.map((source) => source.appearances || 0),
    ),
  };
}

async function discoverFromConnection(connection, mediaType) {
  if (connection.type === "franchise") {
    if (mediaType !== "movie") return [];
    const data = await tmdbFetch(`/collection/${connection.value}`);
    return data.parts || [];
  }

  if (connection.type === "actor" || connection.type === "director") {
    if (mediaType === "movie") {
      const data = await tmdbFetch(
        `/person/${connection.value}/movie_credits`,
      );
      const cast = connection.type === "actor" ? data.cast || [] : [];
      const crew =
        connection.type === "director"
          ? (data.crew || []).filter((item) => item.job === "Director")
          : [];
      return [...cast, ...crew];
    }

    if (connection.type === "actor") return [];

    const data = await tmdbFetch(`/person/${connection.value}/tv_credits`);
    return (data.crew || []).filter((item) =>
      ["Director", "Creator"].includes(item.job),
    );
  }

  if (connection.type === "studio") {
    const data = await tmdbFetch(
      `/discover/${mediaType}?with_companies=${connection.value}&page=1`,
    );
    return data.results || [];
  }

  return [];
}

export async function discoverMultiHopCandidates(candidates, mediaType) {
  const bridges = selectMultiHopBridges(candidates);
  const discovered = [];

  const enrichedBridges = await mapWithConcurrency(
    bridges,
    async (bridge) => {
      try {
        const metadata = await getMediaMetadata(bridge.type, bridge.id);
        if (!metadata) return null;
        return { bridge, connections: getSecondOrderConnections(metadata) };
      } catch (error) {
        console.warn(
          `Multi-hop bridge enrichment failed for ${bridge.type}:${bridge.id}`,
          error.message,
        );
        return null;
      }
    },
    BRIDGE_ENRICHMENT_CONCURRENCY,
  );

  const bridgeConnections = enrichedBridges.filter(Boolean);

  await mapWithConcurrency(
    bridgeConnections,
    async ({ bridge, connections }) => {
      await mapWithConcurrency(
        connections,
        async (connection) => {
          try {
            const media = await discoverFromConnection(connection, mediaType);
            const source = createMultiHopSource(bridge, connection);

            for (const item of media) {
              discovered.push({ media: item, source });
            }
          } catch (error) {
            console.warn(
              `Multi-hop source failed for ${connection.type}:${connection.value}`,
              error.message,
            );
          }
        },
        DISCOVERY_CONCURRENCY,
      );
    },
    DISCOVERY_CONCURRENCY,
  );

  return discovered;
}

export const MULTI_HOP_RETRIEVAL_LIMITS = Object.freeze({
  maxBridgeCandidates: MAX_BRIDGE_CANDIDATES,
  maxConnectionsPerBridge: MAX_CONNECTIONS_PER_BRIDGE,
});
