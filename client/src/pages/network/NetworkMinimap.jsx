import { useEffect, useState } from "react";

const MINIMAP_THRESHOLD = 80;

function getSnapshot(cy) {
  if (!cy || cy.destroyed()) return null;

  const nodes = cy.nodes();
  if (!nodes.length) return null;

  const positions = nodes.map((node) => node.position());
  const xs = positions.map((point) => point.x);
  const ys = positions.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 120;
  const width = Math.max(maxX - minX + padding * 2, 1);
  const height = Math.max(maxY - minY + padding * 2, 1);
  const extent = { minX: minX - padding, minY: minY - padding, width, height };
  const rendered = nodes.map((node) => ({
    id: node.id(),
    type: node.data("type"),
    x: node.position("x"),
    y: node.position("y"),
  }));

  const pan = cy.pan();
  const zoom = cy.zoom();
  const container = cy.container();
  const viewport = container
    ? {
        x: (-pan.x / zoom - extent.minX) / extent.width,
        y: (-pan.y / zoom - extent.minY) / extent.height,
        width: container.clientWidth / zoom / extent.width,
        height: container.clientHeight / zoom / extent.height,
      }
    : null;

  return { extent, nodes: rendered, viewport };
}

export default function NetworkMinimap({ cyRef, visible }) {
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !visible) {
      setSnapshot(null);
      return undefined;
    }

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSnapshot(getSnapshot(cy)));
    };

    update();
    cy.on("pan zoom resize", update);

    return () => {
      cancelAnimationFrame(frame);
      cy.removeListener("pan zoom resize", update);
    };
  }, [cyRef, visible]);

  if (!snapshot) return null;

  const { extent } = snapshot;
  const isLarge = snapshot.nodes.length >= MINIMAP_THRESHOLD;
  if (!isLarge) return null;

  function moveTo(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const cy = cyRef.current;
    if (!cy) return;

    const container = cy.container();
    const zoom = cy.zoom();
    cy.pan({
      x: container.clientWidth / 2 - (extent.minX + x * extent.width) * zoom,
      y: container.clientHeight / 2 - (extent.minY + y * extent.height) * zoom,
    });
  }

  return (
    <button
      type="button"
      className="network-minimap"
      onClick={moveTo}
      aria-label="Navigate network overview"
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {snapshot.nodes.map((node) => (
          <circle
            key={node.id}
            cx={((node.x - extent.minX) / extent.width) * 100}
            cy={((node.y - extent.minY) / extent.height) * 100}
            r={node.type === "media" ? 1.1 : 0.55}
            className={
              node.type === "media"
                ? "network-minimap-media"
                : "network-minimap-connection"
            }
          />
        ))}
        {snapshot.viewport && (
          <rect
            className="network-minimap-viewport"
            x={snapshot.viewport.x * 100}
            y={snapshot.viewport.y * 100}
            width={snapshot.viewport.width * 100}
            height={snapshot.viewport.height * 100}
          />
        )}
      </svg>
    </button>
  );
}
