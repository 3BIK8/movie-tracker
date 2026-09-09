import CastPerson from "./CastPerson";

/**
 * CastList - Shows cast members and director/creators.
 */
function CastList({ type, details, onPersonClick }) {
  const directorLabel = type === "movie" ? "Director" : "Created by";

  const directorCredit =
    type === "movie"
      ? details.director || "Unknown"
      : details.creators?.join(", ") || "Unknown";

  return (
    <section className="details-cast">
      <h3>{directorLabel}</h3>

      {type === "movie" && details.director ? (
        <button
          className="details-person-link"
          type="button"
          onClick={() =>
            onPersonClick?.({
              id: details.director_id,
              name: details.director,
              role: "director",
            })
          }
        >
          {directorCredit}
        </button>
      ) : (
        <p className="credit">{directorCredit}</p>
      )}

      <h3 className="cast-title">Cast</h3>

      <div className="cast-list">
        {details.cast?.slice(0, 5).map((person, index) => (
          <CastPerson
            key={person.id ?? `${person.name}-${index}`}
            person={person}
            onClick={() =>
              onPersonClick?.({
                id: person.id,
                name: person.name,
                role: "actor",
              })
            }
          />
        ))}
      </div>
    </section>
  );
}

export default CastList;
