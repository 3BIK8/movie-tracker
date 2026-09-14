const EXCLUDED_TV_GENRES = new Set([10763, 10767, 10764]);
const EXCLUDED_MOVIE_GENRES = new Set([10770]);
const QUALITY_FLOORS = Object.freeze({
  movie: { rating: 5.8, voteCount: 50 },
  tv: { rating: 5.8, voteCount: 30 },
});

export function isValidCandidate(candidate) {
  if (!candidate?.id || !candidate?.type) return false;
  if (!["movie", "tv"].includes(candidate.type)) return false;

  const genreIds = candidate.genre_ids || candidate.genres?.map((genre) => genre.id) || [];
  if (candidate.type === "tv" && genreIds.some((id) => EXCLUDED_TV_GENRES.has(id))) return false;
  if (candidate.type === "movie" && genreIds.some((id) => EXCLUDED_MOVIE_GENRES.has(id))) return false;

  const floor = QUALITY_FLOORS[candidate.type];
  const hasQualityMetadata =
    Number.isFinite(Number(candidate.rating ?? candidate.tmdbRating)) ||
    Number.isFinite(Number(candidate.voteCount));

  if (floor && hasQualityMetadata) {
    const rating = Number(candidate.rating ?? candidate.tmdbRating);
    const voteCount = Number(candidate.voteCount);
    if (!Number.isFinite(rating) || rating < floor.rating) return false;
    if (Number.isFinite(voteCount) && voteCount < floor.voteCount) return false;
  }

  return true;
}

export { QUALITY_FLOORS };
