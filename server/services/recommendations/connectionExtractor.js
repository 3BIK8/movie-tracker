export function getMediaConnections(metadata) {
  const connections = [];

  for (const actor of metadata.actors) {
    connections.push({
      type: "actor",
      value: actor.id,
      label: actor.name,
      metadata: {
        profile_path: actor.profile_path || null,
      },
    });
  }

  for (const director of metadata.directors) {
    connections.push({
      type: "director",
      value: director.id,
      label: director.name,
      metadata: {
        profile_path: director.profile_path || null,
      },
    });
  }

  for (const genre of metadata.genres) {
    connections.push({
      type: "genre",
      value: genre.id,
      label: genre.name,
    });
  }

  for (const keyword of metadata.keywords) {
    connections.push({
      type: "keyword",
      value: keyword.id,
      label: keyword.name,
    });
  }

  for (const franchise of metadata.franchises) {
    connections.push({
      type: "franchise",
      value: franchise.id,
      label: franchise.name,
      metadata: {
        poster_path: franchise.poster_path || null,
        backdrop_path: franchise.backdrop_path || null,
      },
    });
  }

  for (const studio of metadata.studios) {
    connections.push({
      type: "studio",
      value: studio.id,
      label: studio.name,
      metadata: {
        logo_path: studio.logo_path || null,
      },
    });
  }

  if (metadata.year) {
    const decade = Math.floor(metadata.year / 10) * 10;

    connections.push({
      type: "decade",
      value: decade,
      label: `${decade}s`,
    });
  }

  if (metadata.language) {
    connections.push({
      type: "language",
      value: metadata.language,
      label: metadata.language,
    });
  }

  connections.push({
    type: "mediaType",
    value: metadata.type,
    label: metadata.type === "movie" ? "Movie" : "TV",
  });

  return connections;
}
