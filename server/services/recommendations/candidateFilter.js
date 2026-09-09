const EXCLUDED_TV_GENRES = new Set([
  10763, // News
  10767, // Talk
  10764, // Reality
]);

const EXCLUDED_MOVIE_GENRES = new Set([
  10770, // TV Movie
]);

export function isValidCandidate(candidate) {
  if (!candidate?.id || !candidate?.type) {
    return false;
  }

  const genreIds =
    candidate.genre_ids || candidate.genres?.map((genre) => genre.id) || [];

  if (candidate.type === "tv") {
    return !genreIds.some((id) => EXCLUDED_TV_GENRES.has(id));
  }

  if (candidate.type === "movie") {
    return !genreIds.some((id) => EXCLUDED_MOVIE_GENRES.has(id));
  }

  return false;
}
