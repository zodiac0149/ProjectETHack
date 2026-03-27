export type NewsApiArticle = {
  title: string;
  url: string;
  publishedAt?: string;
  source?: string;
  description?: string;
};

export function hasNewsApi(): boolean {
  return Boolean(process.env.NEWSAPI_KEY);
}

/**
 * Placeholder "free source" integration.
 * Set NEWSAPI_KEY later and this starts working.
 */
export async function searchNewsApi(query: string, pageSize = 10): Promise<NewsApiArticle[]> {
  const key = process.env.NEWSAPI_KEY;
  if (!key) return [];
  const url =
    "https://newsapi.org/v2/everything?" +
    new URLSearchParams({
      q: query,
      language: "en",
      pageSize: String(pageSize),
      sortBy: "publishedAt",
    }).toString();

  const res = await fetch(url, { headers: { "X-Api-Key": key } });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { articles?: any[] };
  const arts = Array.isArray(data.articles) ? data.articles : [];
  return arts
    .map((a) => ({
      title: String(a.title || "").trim(),
      url: String(a.url || "").trim(),
      publishedAt: a.publishedAt ? String(a.publishedAt) : undefined,
      source: a.source?.name ? String(a.source.name) : undefined,
      description: a.description ? String(a.description) : undefined,
    }))
    .filter((a) => a.title && a.url);
}

