import { createPortal } from "react-dom";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import MediaInfo from "./MediaInfo";
import CastList from "./CastList";
import { useAnchoredPanel } from "../hooks/useAnchoredPanel";
import { useWatchRating } from "../hooks/useWatchRating";

/** A portal panel anchored beside its poster, never inside the discovery grid. */
function ExpandedCard({
  anchor,
  isOpen,
  item,
  type,
  status,
  details,
  error,
  isLoading,
  onClose,
  onPersonClick,
}) {
  const position = useAnchoredPanel(anchor, isOpen);

  const { rating, setRating } = useWatchRating(type, item.id, status);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onClose]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && position && (
        <motion.article
          key={`${type}-${item.id}`}
          className="expanded-details"
          data-placement={position.side}
          style={{
            left: position.left,
            top: position.top,
            width: position.width,
            height: position.height,
            transformOrigin:
              position.side === "right" ? "left center" : "right center",
          }}
          initial={{ opacity: 0, scaleX: 0.04 }}
          animate={{ opacity: 1, scaleX: 1 }}
          exit={{ opacity: 0, scaleX: 0.04 }}
          transition={{
            type: "spring",
            stiffness: 380,
            damping: 34,
          }}
          aria-label={`Details for ${
            type === "movie" ? item.title : item.name
          }`}
        >
          <button
            className="details-close"
            type="button"
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>

          {isLoading || (!details && !error) ? (
            <div className="details-loading">Loading details…</div>
          ) : details ? (
            <div className="details-inner">
              <MediaInfo
                details={details}
                status={status}
                rating={rating}
                onRatingChange={setRating}
              />

              <CastList
                type={type}
                details={details}
                onPersonClick={onPersonClick}
              />
            </div>
          ) : (
            <div className="details-loading">
              {error || "Details are unavailable."}
            </div>
          )}
        </motion.article>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export default ExpandedCard;
