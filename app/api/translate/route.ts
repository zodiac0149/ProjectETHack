import { NextResponse } from "next/server";

const cache = new Map<string, string>();

function hashKey(text: string, lang: string): string {
  return `${lang}:${text.slice(0, 80)}`;
}

const GOOGLE_LANG_CODES: Record<string, string> = {
  hi: "hi",
  ta: "ta",
  bn: "bn",
  en: "en",
};

async function googleTranslate(text: string, targetLang: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`);

  const data = await res.json();
  
  const sentences: string[] = (data[0] || []).map((seg: any) => seg[0] || "");
  return sentences.join("");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    targetLanguage?: string;
  };

  const text = (body.text || "").trim();
  const lang = (body.targetLanguage || "en").toLowerCase();

  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  if (lang === "en") {
    return NextResponse.json({ translated: text });
  }

  const googleLang = GOOGLE_LANG_CODES[lang];
  if (!googleLang) {
    return NextResponse.json({ error: `Unsupported language: ${lang}` }, { status: 400 });
  }

  const key = hashKey(text, lang);
  if (cache.has(key)) {
    return NextResponse.json({ translated: cache.get(key) });
  }

  const started = Date.now();
  try {
    console.log(`[Translate] Google Translate: "${text.slice(0, 30)}..." → ${lang}`);
    const result = await googleTranslate(text, googleLang);
    console.log(`[Translate] Done in ${Date.now() - started}ms: "${result.slice(0, 30)}..."`);
    cache.set(key, result);
    return NextResponse.json({ translated: result });
  } catch (e) {
    console.error(`[Translate] Google failed in ${Date.now() - started}ms:`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Translation failed" },
      { status: 500 }
    );
  }
}
