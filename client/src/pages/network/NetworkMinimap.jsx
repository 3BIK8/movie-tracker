import { useEffect, useState } from "react";

const MINIMAP_THRESHOLD = 80;

function getSnapshot(cy) {
  if (!cy || cy.destroyed()) return null;
  const nodes = cy.nodes();
  if (!nodes.length) return null;

  const points = nodes.map((node) => node.position());
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 120;
  const extent = {
    minX: minX - padding,
    minY: minY - padding,
    width: Math.max(maxX - minX + padding * 2, 1),
    height: Math.max(maxY - minY + padding * 2, 1),
  };
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

  return {
    extent,
    viewport,
    nodes: nodes.map((node) => ({
      id: node.id(),
      type: node.data("type"),
      x: node.position("x"),
      y: node.position("y"),
    })),
  };
}

export default function NetworkMinimap({ cyRef }) {
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return undefined;

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
  }, [cyRef]);

  if (!snapshot || snapshot.nodes.length < MINIMAP_THRESHOLD) return null;

  function moveTo(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const cy = cyRef.current;
    if (!cy) return;

    const container = cy.container();
    const zoom = cy.zoom();
    cy.pan({
      x: container.clientWidth / 2 - (snapshot.extent.minX + x * snapshot.extent.width) * zoom,
      y: container.clientHeight / 2 - (snapshot.extent.minY + y * snapshot.extent.height) * zoom,
    });
  }

  return (
    <button
      type="button"
      className="network-minimap"
      onClick={moveTo}
      aria-label="Navigate network overview"
      title="Click to navigate"
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        {snapshot.nodes.map((node) => (
          <circle
            key={node.id}
            cx={((node.x - snapshot.extent.minX) / snapshot.extent.width) * 100}
            cy={((node.y - snapshot.extent.minY) / snapshot.extent.height) * 100}
            r={node.type === "media" ? 1.1 : 0.5}
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
