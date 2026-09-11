const CURRENT_YEAR = new Date().getFullYear();

const DEFAULT_YEAR_RANGES = [[2010, CURRENT_YEAR]];

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

function stableHash(value) {
  let hash = 2166136261;

  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = stableHash(seed) || 1;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInteger(min, max, random) {
  return Math.floor(random() * (max - min + 1)) + min;
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

function getProfileYearRanges(profile) {
  const decades = Object.entries(profile?.years || {})
    .filter(
      ([value, data]) =>
        /^\d{4}$/.test(value) &&
        Number(value) % 10 === 0 &&
        data?.evidenceScore > 0,
    )
    .map(([value, data]) => ({
      decade: Number(value),
      evidenceScore: data.evidenceScore,
      appearances: data.appearances ?? 0,
    }))
    .sort((a, b) => {
      if (b.evidenceScore !== a.evidenceScore) {
        return b.evidenceScore - a.evidenceScore;
      }
      if (b.appearances !== a.appearances) {
        return b.appearances - a.appearances;
      }
      return b.decade - a.decade;
    });

  const ranges = decades.slice(0, 3)
    .map(({ decade }) => [decade, Math.min(decade + 9, CURRENT_YEAR)])
    .filter(([start, end]) => start <= end);

  if (ranges.length > 0 && ranges[0][1] < CURRENT_YEAR) {
    ranges.unshift([Math.max(ranges[0][0], CURRENT_YEAR - 5), CURRENT_YEAR]);
  }

  return ranges.length > 0 ? ranges : DEFAULT_YEAR_RANGES;
}

function pickYearRange(yearRanges, random) {
  return yearRanges[randomInteger(0, yearRanges.length - 1, random)];
}

function getAvailableStrategies(profile) {
  const available = ["long_tail", "balanced_tail"];

  if (getTopProfileValue(profile?.genres)) {
    available.push("profile_genre");
  }

  if (getTopProfileValue(profile?.languages)) {
    available.push("profile_language");
  }

  return available;
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

  if (mediaType === "movie") {
    params.set("include_video", "false");
  }

  const quality = QUALITY_FLOORS[mediaType];
  params.set("vote_average.gte", String(quality.voteAverage));
  params.set("vote_count.gte", String(quality.voteCount));

  if (strategy === "profile_genre") {
    params.set("with_genres", getTopProfileValue(profile?.genres));
  }

  if (strategy === "profile_language") {
    params.set(
      "with_original_language",
      getTopProfileValue(profile?.languages),
    );
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
  random = null,
  seed = `${mediaType}:${JSON.stringify(profile ?? {})}`,
) {
  if (!QUALITY_FLOORS[mediaType]) {
    throw new TypeError(`Unsupported media type: ${mediaType}`);
  }

  const randomSource = random || createSeededRandom(seed);
  const queries = [];
  const availableStrategies = getAvailableStrategies(profile);
  const yearRanges = getProfileYearRanges(profile);

  for (let index = 0; index < batchCount; index += 1) {
    const strategyIndex = randomInteger(
      0,
      availableStrategies.length - 1,
      randomSource,
    );
    const strategy =
      availableStrategies.splice(strategyIndex, 1)[0] ?? "long_tail";
    const yearRange = pickYearRange(yearRanges, randomSource);
    const page =
      strategy === "long_tail"
        ? getRandomPage(3, randomSource)
        : getRandomPage(20, randomSource);

    queries.push(createQuery({ mediaType, strategy, yearRange, page, profile }));
  }

  return queries;
}

export function getExplorationQualityFloor(mediaType) {
  return QUALITY_FLOORS[mediaType];
}
