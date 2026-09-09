import { useLayoutEffect, useState } from "react";

const EDGE_GUTTER = 12;
const PANEL_GAP = 12;
const PREFERRED_WIDTH = 640;

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

export function getAnchoredPanelPosition(rect, viewport) {
  const { width: viewportWidth, height: viewportHeight } = viewport;
  const roomOnLeft = Math.max(0, rect.left - EDGE_GUTTER - PANEL_GAP);
  const roomOnRight = Math.max(
    0,
    viewportWidth - rect.right - EDGE_GUTTER - PANEL_GAP,
  );
  const side = roomOnRight >= roomOnLeft ? "right" : "left";
  const availableWidth = side === "right" ? roomOnRight : roomOnLeft;

  if (availableWidth < 1 || rect.width < 1 || rect.height < 1) {
    return null;
  }

  const width = Math.min(PREFERRED_WIDTH, availableWidth);
  const height = Math.min(rect.height, viewportHeight - EDGE_GUTTER * 2);
  const top = clamp(
    rect.top,
    EDGE_GUTTER,
    viewportHeight - height - EDGE_GUTTER,
  );
  const left =
    side === "right" ? rect.right + PANEL_GAP : rect.left - PANEL_GAP - width;

  return { left, top, width, height, side };
}

/**
 * Positions an overlay beside an anchor without making the overlay part of the
 * grid. It chooses the side that has the most room and updates as the viewport
 * or the poster size changes.
 */
export function useAnchoredPanel(anchor, isOpen) {
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (!isOpen || !anchor) {
      return undefined;
    }

    let frameId;

    const updatePosition = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const rect = anchor.getBoundingClientRect();
        setPosition(
          getAnchoredPanelPosition(rect, {
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          }),
        );
      });
    };

    updatePosition();

    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(anchor);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor, isOpen]);

  return isOpen ? position : null;
}
