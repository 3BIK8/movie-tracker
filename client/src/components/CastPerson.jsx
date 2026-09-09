import { getTmdbImageUrl } from "../constants/tmdb";

/**
 * CastPerson - Individual cast member with photo and character name.
 */
function CastPerson({ person, onClick }) {
  const imageUrl = getTmdbImageUrl(person.profile_path);

  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick?.(person);
    }
  }

  return (
    <div
      className="cast-person"
      role="button"
      tabIndex={0}
      onClick={() => onClick?.(person)}
      onKeyDown={handleKeyDown}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={person.name} />
      ) : (
        <div className="cast-placeholder">?</div>
      )}

      <div>
        <strong>{person.name}</strong>
        <span>{person.character}</span>
      </div>
    </div>
  );
}

export default CastPerson;
