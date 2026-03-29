import { fetchRss, type RssItem } from "@/lib/sources/rss";

export const RELIABLE_RSS_FEEDS: Array<{ name: string; url: string }> = [
  
  { name: "RBI Press Releases", url: "https://www.rbi.org.in/Scripts/RSS.aspx?Id=2009" },
  
  { name: "PIB Releases", url: "https://pib.gov.in/RssMain.aspx?Mod=1&Lang=1" },
];

export async function fetchReliableHeadlines(): Promise<RssItem[]> {
  const items: RssItem[] = [];
  for (const f of RELIABLE_RSS_FEEDS) {
    try {
      const got = await fetchRss(f.url);
      for (const it of got) items.push({ ...it, source: f.name });
    } catch {
      
    }
  }
  return items;
}

