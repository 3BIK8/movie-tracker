import { normalizeMediaType } from "../../utils/mediaIdentity.js";

function getYear(data, type) {
  const date = type === "movie" ? data.release_date : data.first_air_date;

  return date ? Number(date.slice(0, 4)) : null;
}

export function normalizeMedia(data, type) {
  const normalizedType = normalizeMediaType(type);
  const cast = (data.credits?.cast || []).slice(0, 10).map((person) => ({
    id: person.id,
    name: person.name,
    profile_path: person.profile_path,
  }));

  const directors =
    normalizedType === "movie"
      ? (data.credits?.crew || [])
          .filter((person) => person.job === "Director")
          .map((person) => ({
            id: person.id,
            name: person.name,
            profile_path: person.profile_path,
          }))
      : (data.created_by || []).map((person) => ({
          id: person.id,
          name: person.name,
          profile_path: person.profile_path,
        }));

  const keywords =
    normalizedType === "movie"
      ? data.keywords?.keywords || []
      : data.keywords?.results || [];

  return {
    id: String(data.id),
    type: normalizedType,

    title: normalizedType === "movie" ? data.title : data.name,

    year: getYear(data, normalizedType),

    overview: data.overview || "",

    poster_path: data.poster_path || null,
    backdrop_path: data.backdrop_path || null,

    actors: cast,
    directors,

    genres: (data.genres || []).map((genre) => ({
      id: genre.id,
      name: genre.name,
    })),

    keywords: keywords.map((keyword) => ({
      id: keyword.id,
      name: keyword.name,
    })),

    franchises: data.belongs_to_collection
      ? [
          {
            id: data.belongs_to_collection.id,
            name: data.belongs_to_collection.name,
            poster_path: data.belongs_to_collection.poster_path || null,
            backdrop_path: data.belongs_to_collection.backdrop_path || null,
          },
        ]
      : [],

    studios: (data.production_companies || []).map((company) => ({
      id: company.id,
      name: company.name,
      logo_path: company.logo_path || null,
    })),

    language: data.original_language || null,

    rating: data.vote_average ?? null,
    popularity: data.popularity ?? null,
  };
}
