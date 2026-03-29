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
  personal?: string;
  points: string[];
  sourceAtomIds: string[];
};

type BriefingDoc = {
  title: string;
  query: string;
  generatedAt: string;
  sections: BriefingSection[];
};

export function synthPrompt(query: string, atoms: RoutedAtom[], userPersona: string): string {
  const atomBlock = atoms
    .map((a, i) => {
      return [
        `ATOM ${i + 1}`,
        `id: ${a.atom_id}`,
        a.article_title ? `title: ${a.article_title}` : `title: (unknown)`,
        `text: ${a.text}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return [
    `You are an elite intelligence analyst producing a highly tailored briefing.`,
    `CRITICAL: The entire briefing must be fundamentally shaped ONLY by the user's persona and their specific interests.`,
    "",
    "USER CONTEXT:",
    `Persona / Role: ${userPersona || "General Reader"}`,
    `Query / Topic: ${query}`,
    "",
    "SOURCE NEWS ATOMS:",
    atomBlock,
    "",
    "TASK:",
    `Select ONLY the facts from the atoms that are directly relevant to a '${userPersona || "General Reader"}'. Discard everything else.`,
    "Synthesise this filtered relevant data into a single cohesive briefing separated into 3-5 distinct 'Angles of Interest'.",
    "Name these Angles specifically based on what this precise persona cares about.",
    "If an Angle contains strong comparative data (like percentage distributions, market share, or allocations), build a 'chart' object.",
    "",
    "CONSOLIDATION RULES:",
    `- EXTREME PERSONA FOCUS: If the user indicates a focus (e.g., 'macro policy' or 'tech sector'), ONLY include data about that focus. If an atom discusses unrelated topics, IGNORE them.`,
    "- NO CONTENT DUPLICATION: Each explicit angle MUST address distinct facts. A flat summary or simple aggregation scores low. The test is whether distinct user questions get distinct, non-overlapping answers.",
    "- PERSONALISED FEED: Adapt depth, vocabulary, and actionable framing directly to the user role. (e.g., a CFO gets macro figures and policy timelines; a young retail investor gets direct stock/momentum advice in relatable language).",
    "- MERGE REDUNDANCY: If multiple news atoms lead to the same insight within an angle, merge them. Do not repeat facts across sections.",
    "- BE CONCISE: Minimal words, maximum signal.",
    "",
    "OUTPUT FORMAT:",
    "Return ONLY valid JSON matching this schema:",
    "{",
    '  "title": "Overall Briefing Title",',
    '  "query": "The user query",',
    '  "generatedAt": "ISO date string",',
    '  "personal": "A single, powerful, global inference summarizing what this entire briefing means specifically for the user / ' + (userPersona || "General Reader") + '",',
    '  "actionPlan": {',
    '    "impact": "Deep insight into exactly what affects the user from the news.",',
    '    "preparation": ["How the user should strictly prepare", "Tactical action step"]',
    '  },',
    '  "sections": [',
    '    {',
    '      "title": "Angle Name",',
    '      "summary": "High-impact angle summary",',
    '      "points": ["Point 1", "Point 2", "Point 3"],',
    '      "chart": {',
    '        "title": "Chart Title (e.g., Budget Allocation)",',
    '        "data": [',
    '          { "label": "Tech Sector", "value": 45, "unit": "%" },',
    '          { "label": "Other", "value": 55, "unit": "%" }',
    '        ]',
    '      }',
    '    }',
    '  ]',
    "}",
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
    "- 'points' MUST be strictly supported by the SOURCE ATOMS.",
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
    userPersona?: string;
  };
  const query = (body.query || "").toString().trim();
  const topK = Number.isFinite(body.topK) ? Number(body.topK) : 28;
  const userId = (body.userId || "").toString().trim() || null;
  const userPersona = (body.userPersona || "").toString().trim();

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
      routeScore: 1.0, 
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
        personal: "No actionable data found for this specific query.",
        points: [
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
    const prompt = [prefs, synthPrompt(query, routed, userPersona)].filter(Boolean).join("\n\n");
    const system = "You are a professional news analyst providing highly personalized, multi-angle briefings.";

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

  const d = doc as BriefingDoc;
  const rawSections = Array.isArray(d.sections) ? d.sections : [];
  const out: BriefingDoc = {
    title: d.title || "Budget Briefing",
    query: d.query || query,
    generatedAt: d.generatedAt || new Date().toISOString(),
    sections: rawSections.map((s, i) => ({
      ...s,
      
      id: s.id && s.id !== "undefined"
        ? s.id
        : `sec-${i}-${(s.title || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
      points: Array.isArray(s.points) ? s.points : [],
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

