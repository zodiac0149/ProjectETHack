import { NextResponse } from "next/server";
import { generateJSON } from "@/lib/llm";
import { logAgentEvent } from "@/lib/agentLog";
import { loadAtoms, routeAtoms, type RoutedAtom } from "@/lib/atoms";
import { type Atom } from "@/lib/types";
import { getPersonaAdjustments } from "@/lib/mem0";

type BriefingSection = {
  id: string;
  title: string;
  summary: string;
  classify: string;
  affect: string;
  benefit: string;
  personal?: string;
  keyPoints: string[];
  sourceAtomIds: string[];
};

type BriefingDoc = {
  title: string;
  query: string;
  generatedAt: string;
  sections: BriefingSection[];
};

function synthPrompt(query: string, atoms: RoutedAtom[], workProfile: string = ""): string {
  const atomBlock = atoms
    .map((a, i) => {
      const ents = a.tags?.entities?.slice(0, 6) ?? [];
      const sector = a.tags?.sector ?? "Other";
      const sentiment = a.tags?.sentiment ?? "Neutral";
      return [
        `ATOM ${i + 1}`,
        `id: ${a.atom_id}`,
        a.article_title ? `title: ${a.article_title}` : `title: (unknown)`,
        `text: ${a.text}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  const personalSection = workProfile 
    ? `    - "personal": string (How this affects a ${workProfile} specifically)`
    : "";

  return [
    "You are a professional news analyst. Create a highly structured DEEP DIVE briefing.",
    "",
    "USER CONTEXT:",
    `Role: ${workProfile || "General Reader"}`,
    `Query: ${query}`,
    "",
    "SOURCE NEWS ATOMS:",
    atomBlock,
    "",
    "TASK:",
    "Divide the news into 5-8 distinct sections. Each section MUST follow this JSON structure:",
    "{",
    '  "title": string (Actionable title),',
    '  "summary": string (A cohesive, 3-4 sentence professional summary of this section, suitable for reading aloud),',
    '  "classify": string (What exactly is this? Categorize it clearly),',
    '  "affect": string (Who or what does this directly impact? Market, Sector, etc),',
    '  "benefit": string (Who wins and how? Specify advantages),',
    workProfile ? '  "personal": string (Explain the direct impact on a ' + workProfile + "'s work life)," : "",
    '  "keyPoints": string[]',
    "}",
    "",
    "OUTPUT FORMAT:",
    "Return ONLY valid JSON matching this schema:",
    "{",
    '  "title": string,',
    '  "query": string,',
    '  "generatedAt": string,',
    '  "sections": [...]',
    "}",
    "",
    "RULES:",
    "- No overlap between sections.",
    "- Be factual and concise.",
    "- If no personal benefit/harm exists for the profile, be honest but find any relevance.",
  ].join("\n");
}

function safeJsonParse(s: string): unknown {
  const t = s.trim();
  return JSON.parse(t);
}

async function criticCheck(args: {
  query: string;
  atoms: RoutedAtom[];
  doc: unknown;
  userPrefs: string;
}) {
  const system =
    "You are a strict fact-checking critic. Your job is to detect hallucinations and unsupported claims in a news briefing.";
  const atomFacts = args.atoms
    .map((a) => `- (${a.atom_id}) ${a.text}`)
    .slice(0, 40)
    .join("\n");
  const prompt = [
    "SOURCE ATOMS (truth set):",
    atomFacts,
    "",
    "GENERATED BRIEFING JSON:",
    JSON.stringify(args.doc),
    "",
    "USER QUERY:",
    args.query,
    "",
    "TASK:",
    "Check the briefing for factual accuracy. Return ONLY JSON:",
    '{ "pass": boolean, "issues": string[], "unsupported_claims": string[] }',
    "",
    "CRITICAL RULES:",
    "- 'classify', 'affect', 'benefit' and 'keyPoints' MUST be strictly supported by the SOURCE ATOMS.",
    "- Atoms starting with 'remote-' are from real-time web search. They are shorter snippets; allow for reasonable logical synthesis from them.",
    "- 'personal' impact sections are LOGICAL INFERENCES. Do not flag them as hallucinations unless they contradict the source atoms or are totally unrelated.",
    "- If a core news fact (e.g. market share, price, name) is not in the atoms, pass=false.",
  ].join("\n");

  return await generateJSON<{
    pass: boolean;
    issues: string[];
    unsupported_claims: string[];
  }>({
    system,
    prompt,
    temperature: 0.0,
    maxTokens: 600,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    query?: string;
    topK?: number;
    userId?: string;
    workProfile?: string;
  };
  const query = (body.query || "").toString().trim();
  const topK = Number.isFinite(body.topK) ? Number(body.topK) : 28;
  const userId = (body.userId || "").toString().trim() || null;
  const workProfile = (body.workProfile || "").toString().trim();

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const atoms = await loadAtoms();
  if (!atoms.length) {
    return NextResponse.json(
      {
        error:
          "No atoms found. Run `python -m ingestion.run --out data` to generate data/atoms.jsonl, or set ATOMS_PATH.",
      },
      { status: 400 }
    );
  }

  const localRouted = routeAtoms(query, atoms, topK);

  // ── Remote Search ──
  let remoteAtoms: RoutedAtom[] = [];
  try {
    const { searchWeb } = await import("@/lib/search");
    const results = await searchWeb(query, 5);
    remoteAtoms = results.map((r, i) => ({
      atom_id: `remote-${i}`,
      text: `${r.title}. ${r.snippet}`,
      url: r.url,
      idx: 999 + i,
      created_at: new Date().toISOString(),
      score: 1.0, 
      routeScore: 1.0, // Fix lint error
    }));
  } catch (e) {
    console.warn("Synthesis search failed:", e);
  }

  const routed = [...localRouted, ...remoteAtoms].slice(0, 15);

  if (routed.length === 0) {
    return NextResponse.json({
      title: "No Relevant News Found",
      query,
      generatedAt: new Date().toISOString(),
      sections: [{
        id: "no-results",
        title: "No Matching Intelligence",
        summary: "I searched your local library and the web for this topic but couldn't find any relevant news articles to analyze.",
        classify: "Notice",
        affect: "Search Quality",
        benefit: "None",
        personal: "No actionable data found for this specific query.",
        keyPoints: [
          "No local atoms matched the relevance threshold.",
          "Web search returned no high-confidence news results.",
          "Try a different query or add a URL to the library."
        ],
        sourceAtomIds: []
      }]
    });
  }

  const started = Date.now();
  let doc: BriefingDoc | unknown;
  try {
    const prefs = userId ? await getPersonaAdjustments(userId) : "";
    const prompt = [prefs, synthPrompt(query, routed, workProfile)].filter(Boolean).join("\n\n");
    const system = "You are a professional news analyst providing personalized briefings.";

    doc = await generateJSON<BriefingDoc>({
      system,
      prompt,
      temperature: 0.1,
      maxTokens: 1800,
    });
  } catch (e) {
    await logAgentEvent({
      userId,
      feature: "feature_a",
      action: "briefing_synthesis_error",
      input: { query, topK },
      output: {},
      durationMs: Date.now() - started,
      ok: false,
      errorText: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      {
        error: "Synthesis failed to generate valid results.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }

  // Minimal server-side normalization
  const d = doc as BriefingDoc;
  const rawSections = Array.isArray(d.sections) ? d.sections : [];
  const out: BriefingDoc = {
    title: d.title || "Budget Briefing",
    query: d.query || query,
    generatedAt: d.generatedAt || new Date().toISOString(),
    sections: rawSections.map((s, i) => ({
      ...s,
      // Always guarantee a stable id — LLM often omits this field
      id: s.id && s.id !== "undefined"
        ? s.id
        : `sec-${i}-${(s.title || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
      keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints : [],
      sourceAtomIds: Array.isArray(s.sourceAtomIds) ? s.sourceAtomIds : [],
    })),
  };

  await logAgentEvent({
    userId,
    feature: "feature_a",
      action: "briefing_synthesized",
      input: { query, topK, atomIds: routed.map((a) => a.atom_id) },
      output: { sectionCount: out.sections.length },
      durationMs: Date.now() - started,
      ok: true,
    });

  return NextResponse.json(out);
}

