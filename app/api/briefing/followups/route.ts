import { NextResponse } from "next/server";
import { generateJSON } from "@/lib/llm";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    query?: string;
    sectionTitle?: string;
    sectionSummary?: string;
    keyPoints?: string[];
  };

  const query = (body.query || "").toString().trim();
  const sectionTitle = (body.sectionTitle || "").toString().trim();
  const sectionSummary = (body.sectionSummary || "").toString().trim();
  const keyPoints = Array.isArray(body.keyPoints) ? body.keyPoints : [];

  if (!query || !sectionTitle) {
    return NextResponse.json({ error: "Missing query/sectionTitle" }, { status: 400 });
  }

  try {
    const prompt = [
      "You generate deep-dive follow-up questions for a financial briefing section.",
      "",
      "User query:",
      query,
      "",
      "Section:",
      sectionTitle,
      "",
      "Summary:",
      sectionSummary,
      "",
      "Key points:",
      ...keyPoints.map((p) => `- ${p}`),
      "",
      "Task:",
      "Return 6 follow-up questions that help the user act (portfolio implications, risks, second-order effects, timeline, who benefits/loses).",
      "",
      "Output format:",
      'Return ONLY valid JSON: {"questions": string[]}',
    ].join("\n");

    const obj = await generateJSON<{ questions?: string[] }>({
      system: "You are a financial analyst helper.",
      prompt,
      maxTokens: 450,
      temperature: 0.2,
    });

    const questions = Array.isArray(obj.questions) ? obj.questions.slice(0, 8) : [];
    return NextResponse.json({ questions });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Follow-up generation failed.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}

