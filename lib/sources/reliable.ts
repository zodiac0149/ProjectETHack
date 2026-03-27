import { fetchRss, type RssItem } from "@/lib/sources/rss";

// "Truth backbone" sources (public). These may not always have perfect RSS coverage,
// but when available they greatly reduce hallucination risk.
export const RELIABLE_RSS_FEEDS: Array<{ name: string; url: string }> = [
  // RBI press releases (English). If this URL changes, swap it later.
  { name: "RBI Press Releases", url: "https://www.rbi.org.in/Scripts/RSS.aspx?Id=2009" },
  // PIB releases (English). PIB runs multiple feeds; this is a general one.
  { name: "PIB Releases", url: "https://pib.gov.in/RssMain.aspx?Mod=1&Lang=1" },
];

export async function fetchReliableHeadlines(): Promise<RssItem[]> {
  const items: RssItem[] = [];
  for (const f of RELIABLE_RSS_FEEDS) {
    try {
      const got = await fetchRss(f.url);
      for (const it of got) items.push({ ...it, source: f.name });
    } catch {
      // ignore
    }
  }
  return items;
}

