export function scoreMovie(movie) {
  const popularity = Math.min(movie.popularity / 100, 1);

  const rating = movie.vote_average / 10;

  const votes = Math.min(movie.vote_count / 5000, 1);

  const score = popularity * 0.45 + rating * 0.25 + votes * 0.3;

  let likelihood;

  if (score >= 0.65) {
    likelihood = "high";
  } else if (score >= 0.4) {
    likelihood = "possible";
  } else {
    likelihood = "low";
  }

  return {
    score,
    likelihood,
  };
}
