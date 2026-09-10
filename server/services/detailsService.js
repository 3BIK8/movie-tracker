import { tmdbFetch } from "../utils/tmdbClient.js";

export async function getMediaDetails(type, id) {
  const data = await tmdbFetch(
    `/${type}/${id}?append_to_response=credits,keywords`,
  );

  const cast = (data.credits?.cast || []).slice(0, 10).map((person) => ({
    id: person.id,
    name: person.name,
    character: person.character,
    profile_path: person.profile_path,
  }));

  const directors =
    type === "movie"
      ? (data.credits?.crew || [])
          .filter((person) => person.job === "Director")
          .map((person) => ({
            id: person.id,
            name: person.name,
          }))
      : (data.created_by || []).map((person) => ({
          id: person.id,
          name: person.name,
        }));

  const keywords =
    type === "movie"
      ? data.keywords?.keywords || []
      : data.keywords?.results || [];

  return {
    id: data.id,
    type,
    title: type === "movie" ? data.title : data.name,
    overview: data.overview,
    date: type === "movie" ? data.release_date : data.first_air_date,
    year: (type === "movie" ? data.release_date : data.first_air_date)
      ? Number((type === "movie" ? data.release_date : data.first_air_date).slice(0, 4))
      : null,
    rating: data.vote_average,
    popularity: data.popularity ?? null,
    language: data.original_language || null,
    runtime: type === "movie" ? data.runtime : data.episode_run_time?.[0],
    genres: data.genres?.map((genre) => genre.name) || [],
    genre_ids: data.genres?.map((genre) => genre.id) || [],
    cast,
    actors: cast.map(({ id, name }) => ({ id, name })),
    directors,
    director: directors[0]?.name || null,
    director_id: directors[0]?.id || null,
    creators:
      type === "tv" ? data.created_by?.map((person) => person.name) || [] : [],
    studios: (data.production_companies || []).map((company) => ({
      id: company.id,
      name: company.name,
    })),
    keywords: keywords.map((keyword) => ({
      id: keyword.id,
      name: keyword.name,
    })),
    franchise: data.belongs_to_collection
      ? {
          id: data.belongs_to_collection.id,
          name: data.belongs_to_collection.name,
        }
      : null,
  };
}
