const actions = [
  { status: "watched", icon: "✓", label: "Mark as watched" },
  { status: "not_sure", icon: "?", label: "Mark as not sure" },
  { status: "to_watch", icon: "+", label: "Add to watch list" },
];

/** Status and preference buttons shown over a poster. */
function WatchActions({
  status,
  favorite,
  onStatusChange,
  onFavoriteChange,
}) {
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

      <button
        type="button"
        data-status="favorite"
        className={favorite ? "selected" : ""}
        onClick={(event) => {
          event.stopPropagation();
          onFavoriteChange();
        }}
        aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
        title={favorite ? "Remove from favorites" : "Add to favorites"}
      >
        {favorite ? "♥" : "♡"}
      </button>
    </div>
  );
}

export default WatchActions;
