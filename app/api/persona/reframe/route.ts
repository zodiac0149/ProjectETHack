import { NextResponse } from "next/server";
import { generateJSON } from "@/lib/llm";
import { logAgentEvent } from "@/lib/agentLog";
import { getPersonaAdjustments } from "@/lib/mem0";
import { PERSONA_CFO_SYSTEM, PERSONA_GENZ_SYSTEM } from "@/lib/personas";

type ReframeOut = {
  fact: string;
  cfo: {
    headline: string;
    brief: string;
    risks: string[];
    watchItems: string[];
    actions: string[];
  };
  investor: {
    vibe: string;
    pocketImpact: string;
    sipAngle: string;
    quickTake: string[];
  };
};

function buildPrompt(fact: string): string {
  return [
    "Rewrite the SAME budget fact in two personas.",
    "",
    "INPUT FACT:",
    fact,
    "",
    "HARD RULES:",
    "- Do not add facts not present in the INPUT FACT.",
    "- If a number/date is missing, say it's not specified.",
    "- Return ONLY valid JSON matching the schema below.",
    "",
    "PERSONA 1 SYSTEM (CFO):",
    PERSONA_CFO_SYSTEM,
    "",
    "PERSONA 2 SYSTEM (24-year-old Investor):",
    PERSONA_GENZ_SYSTEM,
    "",
    "JSON SCHEMA:",
    "{",
    '  "fact": string,',
    '  "cfo": {',
    '    "headline": string,',
    '    "brief": string,',
    '    "risks": string[],',
    '    "watchItems": string[],',
    '    "actions": string[]',
    '  },',
    '  "investor": {',
    '    "vibe": string,',
    '    "pocketImpact": string,',
    '    "sipAngle": string,',
    '    "quickTake": string[]',
    '  }',
    "}",
  ].join("\n");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { fact?: string; userId?: string };
  const fact = (body.fact || "").toString().trim();
  const userId = (body.userId || "").toString().trim() || null;
  if (!fact) return NextResponse.json({ error: "Missing fact" }, { status: 400 });

  const started = Date.now();
  try {
    const prefs = userId ? await getPersonaAdjustments(userId) : "";
    const prompt = [prefs, buildPrompt(fact)].filter(Boolean).join("\n\n");
    
    const obj = await generateJSON<ReframeOut>({
      system: "You are a versatile personal re-framer.",
      prompt,
      maxTokens: 900,
      temperature: 0.2,
    });

    await logAgentEvent({
      userId,
      feature: "feature_b",
      action: "persona_reframe",
      input: { fact },
      output: { cfoHeadline: obj.cfo?.headline, vibe: obj.investor?.vibe },
      durationMs: Date.now() - started,
      ok: true,
    });
    return NextResponse.json(obj);
  } catch (e) {
    await logAgentEvent({
      userId,
      feature: "feature_b",
      action: "persona_reframe_error",
      input: { fact },
      output: {},
      durationMs: Date.now() - started,
      ok: false,
      errorText: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      {
        error: "Persona reframing failed.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
