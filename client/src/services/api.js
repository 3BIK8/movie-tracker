const API_URL = "http://localhost:5000/api";

async function request(url, fallbackMessage, options = {}) {
  const response = await fetch(url, options);

  if (response.ok) return response.json();

  const payload = await response.json().catch(() => null);

  throw new Error(payload?.message || fallbackMessage);
}

export async function discoverMedia({
  type = "movie",
  query = "",
  year = "",
  page = 1,
}) {
  const params = new URLSearchParams({
    type,
    page,
  });

  if (query) params.set("query", query);
  if (year) params.set("year", year);

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
  return request(
    `${API_URL}/recommendations/network`,
    "Unable to load watch-history network.",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ history }),
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

export async function getRecommendations(history) {
  return request(
    `${API_URL}/recommendations/analyze`,
    "Unable to generate recommendations.",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ history }),
    },
  );
}
