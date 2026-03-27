import crypto from "node:crypto";

import { load as loadHtml } from "cheerio";
import TurndownService from "turndown";

import { saveAtoms } from "@/lib/atoms";
import { type Atom } from "@/lib/types";
import { logAgentEvent } from "@/lib/agentLog";
import { getPersonaAdjustments, hasMem0, mem0Search } from "@/lib/mem0";
import { fetchEtHeadlines } from "@/lib/sources/et";
import { searchNewsApi } from "@/lib/sources/newsapi";
import { fetchReliableHeadlines } from "@/lib/sources/reliable";

type Headline = {
  title: string;
  url: string;
  source?: string;
  publishedAt?: string;
  description?: string;
};

function stableId(...parts: string[]): string {
  const h = crypto.createHash("sha256");
  for (const p of parts) {
    h.update(p);
    h.update("\x1f");
  }
  return h.digest("hex").slice(0, 24);
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%+.-]+/g, " ")
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length >= 3);
}

function score(query: string, title: string): number {
  const q = new Set(tokenize(query));
  const t = new Set(tokenize(title));
  let hits = 0;
  for (const w of q) if (t.has(w)) hits++;
  return hits;
}

function splitSentences(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  return t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
}

function chunkSentences(sents: string[], n = 3): string[] {
  const out: string[] = [];
  for (let i = 0; i < sents.length; i += n) {
    const c = sents.slice(i, i + n).join(" ").trim();
    if (c) out.push(c);
  }
  return out;
}

export async function buildUserInterestQueries(userId: string): Promise<string[]> {
  // Start with preference memories if available.
  const base: string[] = [];
  const prefs = userId ? await getPersonaAdjustments(userId) : "";
  if (prefs) base.push(prefs);

  let memories: string[] = [];
  if (hasMem0() && userId) {
    try {
      const res = await mem0Search({
        userId,
        query:
          "Extract the user's investing interests: sectors, tickers, indices, topics they ask about.",
        topK: 8,
      });
      memories = res.memories.map((m) => m.memory).filter(Boolean);
    } catch {
      // ignore
    }
  }

  const blob = [prefs, ...memories].join("\n");
  const topics: string[] = [];
  const lower = blob.toLowerCase();

  const add = (q: string) => topics.push(q);
  if (/(it|tech|software|services|infotech)/.test(lower)) add("India IT stocks budget impact");
  if (/(bank|banks|nbfc|loan|credit)/.test(lower)) add("India banking stocks policy impact");
  if (/(real estate|housing|property|home loan)/.test(lower)) add("India real estate policy home loan tax");
  if (/(sip|mutual fund|mf)/.test(lower)) add("SIP mutual fund taxation India budget");
  if (/(ltcg|capital gains)/.test(lower)) add("LTCG capital gains tax equities India");
  if (/(nifty|sensex)/.test(lower)) add("Nifty Sensex market reaction India budget");

  // Always keep a couple of broad fallbacks.
  topics.push("Union Budget India market impact");
  topics.push("India taxation changes investors");

  // De-dupe
  return Array.from(new Set(topics)).slice(0, 8);
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsNavigator/1.0)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

function extractMainMarkdown(html: string): { title?: string; markdown: string } {
  const $ = loadHtml(html);
  const title = $("title").first().text().trim() || undefined;
  const node = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body").first();

  node.find("script,style,noscript,iframe,svg,nav,header,footer,aside").remove();

  const turndown = new TurndownService({ headingStyle: "atx" });
  const md = turndown.turndown(node.html() || "");
  return { title, markdown: md.replace(/\n{3,}/g, "\n\n").trim() };
}

function atomsFromMarkdown(args: {
  url: string;
  articleTitle?: string;
  markdown: string;
  createdAt: string;
}): Atom[] {
  const sentences = splitSentences(args.markdown);
  const chunks = chunkSentences(sentences, 3);
  return chunks.map((text, idx) => ({
    atom_id: stableId("bg_atom", args.url, String(idx), text.slice(0, 64)),
    url: args.url,
    article_title: args.articleTitle ?? null,
    idx,
    text,
    created_at: args.createdAt,
    tags: null,
  }));
}

export async function backgroundFetchAndIngest(args: {
  userId: string;
  maxHeadlines?: number;
}): Promise<{
  queries: string[];
  headlines: number;
  fetchedArticles: number;
  atomsAppended: number;
  atomsPath: string;
}> {
  const started = Date.now();
  const queries = await buildUserInterestQueries(args.userId);

  // Step 1: fetch headlines from ET + reliable sources
  const [et, rel] = await Promise.all([fetchEtHeadlines(), fetchReliableHeadlines()]);

  let newsApiArticles: Headline[] = [];
  try {
    // Dormant until NEWSAPI_KEY is set
    const q = queries[0] || "India markets";
    const na = await searchNewsApi(q, 10);
    newsApiArticles = na.map((a) => ({
      title: a.title,
      url: a.url,
      source: a.source || "NewsAPI",
      publishedAt: a.publishedAt,
      description: a.description,
    }));
  } catch {
    // ignore
  }

  const headlines: Headline[] = [
    ...et.map((i) => ({ title: i.title, url: i.link, source: i.source, publishedAt: i.pubDate })),
    ...rel.map((i) => ({ title: i.title, url: i.link, source: i.source, publishedAt: i.pubDate })),
    ...newsApiArticles,
  ]
    .filter((h) => h.title && h.url)
    .slice(0, 250);

  // Step 2: rank headlines against user queries
  const scored = headlines.map((h) => ({
    ...h,
    s: Math.max(...queries.map((q) => score(q, h.title))),
  }));
  scored.sort((a, b) => b.s - a.s);

  const maxH = Math.max(8, Math.min(args.maxHeadlines ?? 18, 40));
  const picked = scored.slice(0, maxH).filter((h) => h.s > 0 || pickedFallbackAllowed(h));

  function pickedFallbackAllowed(h: { source?: string }) {
    // Always allow a small number of ET items even if score is 0, for freshness
    return Boolean(h.source?.startsWith("ET:"));
  }

  // Step 3: fetch + extract articles (best-effort, sequential to be polite)
  const createdAt = new Date().toISOString();
  const allAtoms: Atom[] = [];
  let fetchedArticles = 0;
  for (const h of picked) {
    try {
      const html = await fetchHtml(h.url);
      const extracted = extractMainMarkdown(html);
      const md = extracted.markdown || h.description || h.title;
      const atoms = atomsFromMarkdown({
        url: h.url,
        articleTitle: extracted.title || h.title,
        markdown: md,
        createdAt,
      });
      allAtoms.push(...atoms);
      fetchedArticles++;
    } catch {
      // skip failures (paywalls / blocks / timeouts)
    }
  }

  const { appended, path } = await saveAtoms(allAtoms);

  await logAgentEvent({
    userId: args.userId,
    feature: "background_fetch",
    action: "fetch_and_ingest",
    model: "et_public+rss",
    input: { userId: args.userId, queries, maxHeadlines: args.maxHeadlines ?? 18 },
    output: { headlines: headlines.length, picked: picked.length, fetchedArticles, atoms: allAtoms.length, appended },
    durationMs: Date.now() - started,
    ok: true,
  });

  return {
    queries,
    headlines: headlines.length,
    fetchedArticles,
    atomsAppended: appended,
    atomsPath: path,
  };
}

