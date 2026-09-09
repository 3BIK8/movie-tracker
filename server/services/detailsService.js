import { tmdbFetch } from "../utils/tmdbClient.js";

export async function getMediaDetails(type, id) {
  const data = await tmdbFetch(`/${type}/${id}?append_to_response=credits`);

  const cast = (data.credits?.cast || []).slice(0, 5).map((person) => ({
    id: person.id,
    name: person.name,
    character: person.character,
    profile_path: person.profile_path,
  }));

  const directorPerson =
    type === "movie"
      ? data.credits?.crew?.find((person) => person.job === "Director")
      : null;
  return {
    id: data.id,

    title: type === "movie" ? data.title : data.name,

    overview: data.overview,

    date: type === "movie" ? data.release_date : data.first_air_date,

    rating: data.vote_average,

    runtime: type === "movie" ? data.runtime : data.episode_run_time?.[0],

    genres: data.genres?.map((genre) => genre.name) || [],

    cast,

    director: directorPerson?.name || null,

    director_id: directorPerson?.id || null,

    creators:
      type === "tv" ? data.created_by?.map((person) => person.name) || [] : [],
  };
}
