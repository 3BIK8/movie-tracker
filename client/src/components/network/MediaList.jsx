import { getTmdbImageUrl } from "../../constants/tmdb";

function formatRating(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(1);
  }

  return null;
}

function MediaList({ media }) {
  if (!media?.length) {
    return <p className="network-muted">No connected titles.</p>;
  }

  return (
    <div className="network-connected-list">
      {media.map((item) => {
        const imageUrl = getTmdbImageUrl(item.poster_path, "w92");
        const formattedRating = formatRating(item.rating);

        return (
          <div className="network-connected-item" key={item.id}>
            {imageUrl ? (
              <img src={imageUrl} alt="" />
            ) : (
              <div className="network-connected-placeholder" />
            )}

            <div>
              <p>{item.title}</p>

              <div className="network-connected-meta">
                {item.year && <span>{item.year}</span>}

                {formattedRating !== null && (
                  <span>★ {formattedRating}</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default MediaList;
