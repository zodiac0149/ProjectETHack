import { fetchRss, type RssItem } from "@/lib/sources/rss";

export const ET_RSS_FEEDS: Array<{ name: string; url: string }> = [
  {
    name: "ET Markets",
    url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
  },
  {
    name: "ET Stocks",
    url: "https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms",
  },
  {
    name: "ET Economy",
    url: "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms",
  },
  {
    name: "ET Industry",
    url: "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms",
  },
  {
    name: "ET Personal Finance",
    url: "https://economictimes.indiatimes.com/wealth/rssfeeds/837555174.cms",
  },
];

export async function fetchEtHeadlines(): Promise<RssItem[]> {
  const items: RssItem[] = [];
  for (const f of ET_RSS_FEEDS) {
    try {
      const got = await fetchRss(f.url);
      for (const it of got) items.push({ ...it, source: `ET:${f.name}` });
    } catch {
      
    }
  }
  return items;
}

