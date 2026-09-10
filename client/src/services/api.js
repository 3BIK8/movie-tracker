import { compactNetworkHistory } from "./networkRequestPayload";
import { compactRecommendationFeedback } from "./recommendationFeedbackPayload";
import { compactRecommendationHistory } from "./recommendationRequestPayload";

const API_URL = "http://localhost:5000/api";

async function request(url, fallbackMessage, options = {}) {
  const response = await fetch(url, options);

  if (response.ok) {
    return response.json();
  }

  const payload = await response.json().catch(() => null);

  throw new Error(payload?.message || fallbackMessage);
}

export async function discoverMedia({
  type = "movie",
  query = "",
  year = "",
  genre = "",
  language = "",
  minRating = "",
  maxRating = "",
  sort = "popularity",
  page = 1,
}) {
  const params = new URLSearchParams({
    type,
    page,
    sort,
  });

  if (query) {
    params.set("query", query);
  }

  if (year) {
    params.set("year", year);
  }

  if (genre) {
    params.set("genre", genre);
  }

  if (language) {
    params.set("language", language);
  }

  if (minRating !== "") {
    params.set("minRating", minRating);
  }

  if (maxRating !== "") {
    params.set("maxRating", maxRating);
  }

  return request(
    `${API_URL}/discover?${params.toString()}`,
    "Unable to load media.",
  );
}

export async function getMediaDetails(type, id) {
  const params = new URLSearchParams({
    type,
    id,
  });

  return request(
    `${API_URL}/details?${params.toString()}`,
    "Unable to load media details.",
  );
}

export async function getWatchHistoryNetwork(history) {
  const compactHistory = compactNetworkHistory(history);

  return request(
    `${API_URL}/recommendations/network`,
    "Unable to load watch-history network.",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        history: compactHistory,
      }),
    },
  );
}

export async function getRecommendations(history, feedback = null) {
  const compactHistory = compactRecommendationHistory(history);
  const compactFeedback = compactRecommendationFeedback(feedback);

  return request(
    `${API_URL}/recommendations/analyze`,
    "Unable to generate recommendations.",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        history: compactHistory,
        feedback: compactFeedback,
      }),
    },
  );
}

export async function discoverPerson({ personId, role = "actor", page = 1 }) {
  const params = new URLSearchParams({
    personId,
    role,
    page,
  });

  return request(
    `${API_URL}/discover/person?${params.toString()}`,
    "Unable to load person's credits.",
  );
}
