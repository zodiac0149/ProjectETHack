import { searchNewsApi } from "./sources/newsapi";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  publishedAt?: string;
};

// ── Individual fetchers ────────────────────────────────────

async function fetchTavily(query: string, max: number): Promise<SearchResult[]> {
  if (!process.env.TAVILY_API_KEY) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        topic: "news",
        search_depth: "advanced",
        include_answer: "basic",
        include_raw_content: "text",
        max_results: max,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: SearchResult[] = (data.results || []).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.raw_content?.slice(0, 180) || r.content || r.snippet,
      source: new URL(r.url).hostname,
    }));
    if (data.answer) {
      results.unshift({ title: `AI Summary: ${query}`, url: "", snippet: data.answer, source: "tavily-ai" });
    }
    return results;
  } catch { return []; }
}

async function fetchSerper(query: string, max: number): Promise<SearchResult[]> {
  if (!process.env.SERPER_API_KEY) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": process.env.SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: max, gl: "in" }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic || []).map((r: any) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
      source: new URL(r.link).hostname,
    }));
  } catch { return []; }
}

async function fetchNewsApi(query: string, max: number): Promise<SearchResult[]> {
  if (!process.env.NEWSAPI_KEY) return [];
  try {
    const news = await searchNewsApi(query, max);
    return news.map((n) => ({
      title: n.title,
      url: n.url,
      snippet: n.description || n.title,
      source: n.source,
      publishedAt: n.publishedAt,
    }));
  } catch { return []; }
}

// ── Cross-validation & dedup ───────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function extractKeywords(text: string): Set<string> {
  const stops = new Set(["the","a","an","is","are","was","were","in","on","at","to","for","of","and","or","but","with","by","from","as","it","its","this","that","be","has","have","had","do","does","did","will","would","could","should","can","may","not","no","so","if","up","out","about","into","over","after","all","also","new","more","most","very","just","than","then","now","how","when","where","what","which","who","why"]);
  return new Set(
    normalise(text).split(" ").filter(w => w.length > 2 && !stops.has(w))
  );
}

function relevanceScore(keywords: Set<string>, text: string): number {
  const textWords = extractKeywords(text);
  let hits = 0;
  for (const kw of keywords) {
    if (textWords.has(kw)) hits++;
  }
  return keywords.size > 0 ? hits / keywords.size : 0;
}

/**
 * Unified search: runs all 3 APIs in parallel, cross-validates,
 * deduplicates by URL, and filters out irrelevant results.
 */
export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
  const perApi = maxResults + 3; // fetch extra to have room after filtering

  // Fire all 3 simultaneously
  const [tavily, serper, newsapi] = await Promise.all([
    fetchTavily(query, perApi),
    fetchSerper(query, perApi),
    fetchNewsApi(query, perApi),
  ]);

  console.log(`[Search] Raw results — Tavily: ${tavily.length}, Serper: ${serper.length}, NewsAPI: ${newsapi.length}`);

  // Merge all results
  const all = [
    ...tavily.map(r => ({ ...r, _from: "tavily" })),
    ...serper.map(r => ({ ...r, _from: "serper" })),
    ...newsapi.map(r => ({ ...r, _from: "newsapi" })),
  ];

  // Deduplicate by URL (keep first seen)
  const seen = new Set<string>();
  const unique: (SearchResult & { _from: string })[] = [];
  for (const r of all) {
    const key = r.url ? normalise(r.url) : `${r._from}:${normalise(r.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
  }

  // Score each result for relevance to the query
  const queryKw = extractKeywords(query);
  const scored = unique.map(r => ({
    ...r,
    _score: relevanceScore(queryKw, `${r.title} ${r.snippet}`),
  }));

  // Sort by relevance (highest first)
  scored.sort((a, b) => b._score - a._score);

  // Filter: keep results with at least 20% keyword overlap
  const filtered = scored.filter(r => r._score >= 0.2 || r._from === "tavily-ai");

  // Take top N
  const final = filtered.slice(0, maxResults).map(({ _from, _score, ...rest }) => rest);

  console.log(`[Search] After cross-validation: ${final.length} results (from ${unique.length} unique, ${all.length} total)`);
  final.forEach((r, i) => console.log(`  [${i + 1}] ${r.source}: ${r.title.slice(0, 60)}`));

  return final;
}
