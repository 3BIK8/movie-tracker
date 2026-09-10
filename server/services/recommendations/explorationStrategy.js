const EXPLORATION_YEAR_RANGES = [
  [1950, 1969],
  [1970, 1979],
  [1980, 1989],
  [1990, 1999],
  [2000, 2009],
  [2010, 2019],
  [2020, 2026],
];

const STRATEGIES = [
  "long_tail",
  "balanced_tail",
  "profile_genre",
  "profile_language",
];

const QUALITY_FLOORS = {
  movie: { voteAverage: 5.8, voteCount: 50 },
  tv: { voteAverage: 5.8, voteCount: 30 },
};

function randomInteger(min, max, random = Math.random) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pickYearRange(random = Math.random) {
  return EXPLORATION_YEAR_RANGES[
    randomInteger(0, EXPLORATION_YEAR_RANGES.length - 1, random)
  ];
}

function getTopProfileValue(values = {}) {
  return Object.entries(values)
    .filter(([, data]) => data?.evidenceScore > 0)
    .sort((a, b) => {
      if (b[1].evidenceScore !== a[1].evidenceScore) {
        return b[1].evidenceScore - a[1].evidenceScore;
      }
      return b[1].appearances - a[1].appearances;
    })[0]?.[0] ?? null;
}

function getDateField(mediaType) {
  return mediaType === "movie" ? "primary_release_date" : "first_air_date";
}

function getRandomPage(maxPage, random) {
  return randomInteger(1, maxPage, random);
}

function createQuery({ mediaType, strategy, yearRange, page, profile }) {
  const dateField = getDateField(mediaType);
  const [minYear, maxYear] = yearRange;
  const params = new URLSearchParams({
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    page: String(page),
    sort_by:
      strategy === "long_tail" ||
      strategy === "profile_genre" ||
      strategy === "profile_language"
        ? "popularity.asc"
        : "popularity.desc",
    [dateField + ".gte"]: `${minYear}-01-01`,
    [dateField + ".lte"]: `${maxYear}-12-31`,
  });

  const quality = QUALITY_FLOORS[mediaType];
  params.set("vote_average.gte", String(quality.voteAverage));
  params.set("vote_count.gte", String(quality.voteCount));

  if (strategy === "profile_genre") {
    const genre = getTopProfileValue(profile?.genres);
    if (genre) {
      params.set("with_genres", genre);
    }
  }

  if (strategy === "profile_language") {
    const language = getTopProfileValue(profile?.languages);
    if (language) {
      params.set("with_original_language", language);
    }
  }

  return {
    strategy,
    yearRange: `${minYear}-${maxYear}`,
    endpoint: `/discover/${mediaType}?${params.toString()}`,
  };
}

export function buildExplorationQueries(
  mediaType,
  profile,
  batchCount = 3,
  random = Math.random,
) {
  if (!QUALITY_FLOORS[mediaType]) {
    throw new TypeError(`Unsupported media type: ${mediaType}`);
  }

  const queries = [];
  const availableStrategies = [...STRATEGIES];

  for (let index = 0; index < batchCount; index += 1) {
    const strategyIndex = randomInteger(0, availableStrategies.length - 1, random);
    const strategy =
      availableStrategies.splice(strategyIndex, 1)[0] ?? "long_tail";
    const yearRange = pickYearRange(random);
    const page =
      strategy === "long_tail"
        ? getRandomPage(3, random)
        : getRandomPage(20, random);

    queries.push(createQuery({ mediaType, strategy, yearRange, page, profile }));
  }

  return queries;
}

export function getExplorationQualityFloor(mediaType) {
  return QUALITY_FLOORS[mediaType];
}
