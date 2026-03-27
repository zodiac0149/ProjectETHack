import { NextResponse } from "next/server";
import { generateText } from "@/lib/llm";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    sectionTitle?: string;
    sectionContext?: string;
    workProfile?: string;
  };

  const question = (body.question || "").trim();
  const sectionTitle = (body.sectionTitle || "").trim();
  const sectionContext = (body.sectionContext || "").trim();
  const workProfile = (body.workProfile || "General Reader").trim();

  if (!question || !sectionContext) {
    return NextResponse.json({ error: "Missing question or sectionContext" }, { status: 400 });
  }

  const system = `You are a sharp, concise news analyst. Answer follow-up questions about a specific news briefing section.
The user's work profile is: ${workProfile}.
Keep your answer to 2-4 sentences. Be direct and insightful. Ground your answer in both the provided section context AND the supplementary search results if available.`;

  let searchContext = "";
  try {
    const { searchWeb } = await import("@/lib/search");
    const results = await searchWeb(`${sectionTitle} ${question}`, 4);
    if (results.length) {
      searchContext = "\n\nSUPPLEMENTARY WEB SEARCH RESULTS:\n" + 
        results.map((r, i) => `[${i+1}] ${r.title}\nSource: ${r.source}\nSnippet: ${r.snippet}`).join("\n\n");
    }
  } catch (e) {
    console.warn("Search failed in followup:", e);
  }

  const prompt = `NEWS SECTION: "${sectionTitle}"

SECTION CONTENT:
${sectionContext}${searchContext}

USER'S QUESTION: ${question}

Answer the question concisely (2-4 sentences). Prioritize the SECTION CONTENT, but use the SUPPLEMENTARY SEARCH RESULTS to provide up-to-date or missing details. If no relevant info exists, say so briefly.`;

  try {
    const answer = await generateText({
      system,
      prompt,
      temperature: 0.3,
      maxTokens: 400,
    });

    return NextResponse.json({ answer: answer.trim() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to generate answer" },
      { status: 500 }
    );
  }
}
