import { NextResponse } from "next/server";
import { generateJSON } from "@/lib/llm";

type InputSection = {
  id: string;
  title: string;
  classify: string;
  affect: string;
  benefit: string;
  personal?: string;
};

type ArcPoint = {
  id: string;
  title: string;
  sentiment: number; 
  label: string;     
  emoji: string;
  summary: string;   
};

type StoryArcResult = {
  arc: ArcPoint[];
  overallSentiment: number;
  narrativeSummary: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    sections?: InputSection[];
  };

  const sections = body.sections || [];
  if (!sections.length) {
    return NextResponse.json({ error: "No sections provided" }, { status: 400 });
  }

  const sectionsText = sections
    .map(
      (s, i) =>
        `SECTION ${i + 1} (id:${s.id}): "${s.title}"\nClassify: ${s.classify}\nAffect: ${s.affect}\nBenefit: ${s.benefit}`
    )
    .join("\n\n---\n\n");

  const system = `You are a financial sentiment analyst. Analyze news briefing sections and determine their sentiment on business, markets, and economy.`;

  const prompt = `Analyze each of the following news briefing sections and assign a sentiment score.

${sectionsText}

Return ONLY valid JSON in exactly this schema:
{
  "arc": [
    {
      "id": "<same section id>",
      "title": "<same section title>",
      "sentiment": <number from -2 (very bearish) to +2 (very bullish)>,
      "label": "<one of: Bullish | Cautiously Optimistic | Neutral | Cautious | Bearish>",
      "emoji": "<one of: 🟢 | 🟡 | ⚪ | 🟠 | 🔴>",
      "summary": "<1 sentence describing why this story arc point matters>"
    }
  ],
  "overallSentiment": <average sentiment float -2 to +2>,
  "narrativeSummary": "<2-3 sentence narrative of the overall story arc>"
}

Rules:
- Preserve exact section id values.
- Be honest about negative sentiment if the news warrants it.
- The arc order should mirror the input section order.`;

  try {
    const result = await generateJSON<StoryArcResult>({
      system,
      prompt,
      temperature: 0.1,
      maxTokens: 800,
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Story arc generation failed" },
      { status: 500 }
    );
  }
}
