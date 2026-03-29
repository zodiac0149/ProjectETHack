import { load } from "cheerio";

export type RssItem = {
  title: string;
  link: string;
  pubDate?: string;
  source?: string;
};

export async function fetchRss(url: string): Promise<RssItem[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NewsNavigator/1.0)",
      Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`RSS fetch failed (${res.status}) for ${url}`);
  const xml = await res.text();

  const $ = load(xml, { xmlMode: true });
  const out: RssItem[] = [];
  $("item").each((_, el) => {
    const title = $(el).find("title").first().text().trim();
    const link = $(el).find("link").first().text().trim();
    const pubDate = $(el).find("pubDate").first().text().trim() || undefined;
    if (title && link) out.push({ title, link, pubDate });
  });
  return out;
}

