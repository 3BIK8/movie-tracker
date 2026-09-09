const actions = [
  { status: "watched", icon: "✓", label: "Mark as watched" },
  { status: "not_sure", icon: "?", label: "Mark as not sure" },
  { status: "to_watch", icon: "+", label: "Add to watch list" },
];

/** Status buttons shown over a poster on hover or keyboard focus. */
function WatchActions({ status, onStatusChange }) {
  const handleClick = (e, newStatus) => {
    e.stopPropagation();
    onStatusChange(newStatus);
  };

  return (
    <div className="watch-actions" onClick={(e) => e.stopPropagation()}>
      {actions.map((action) => (
        <button
          key={action.status}
          type="button"
          data-status={action.status}
          className={status === action.status ? "selected" : ""}
          onClick={(event) => handleClick(event, action.status)}
          aria-label={action.label}
          title={action.label}
        >
          {action.icon}
        </button>
      ))}
    </div>
  );
}

export default WatchActions;
