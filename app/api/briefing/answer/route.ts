import { NextResponse } from "next/server";
import { generateText } from "@/lib/llm";
import { logAgentEvent } from "@/lib/agentLog";
import { loadAtoms } from "@/lib/atoms";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    question?: string;
    sectionTitle?: string;
    atomIds?: string[];
    userId?: string;
  };

  const question = (body.question || "").toString().trim();
  const sectionTitle = (body.sectionTitle || "").toString().trim();
  const atomIds = Array.isArray(body.atomIds) ? body.atomIds : [];
  const userId = (body.userId || "").toString().trim() || null;

  if (!question) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  const started = Date.now();
  try {
    const allAtoms = await loadAtoms();
    const relevantAtoms = allAtoms.filter(a => atomIds.includes(a.atom_id));
    
    const context = relevantAtoms.map(a => `- ${a.text}`).join("\n");
    
    const system = "You are a helpful news librarian. Provide a concise, factual answer (2-3 sentences) based ONLY on the provided context.";
    const prompt = `SECTION: ${sectionTitle}\n\nCONTEXT:\n${context}\n\nQUESTION: ${question}`;

    const answer = await generateText({
      system,
      prompt,
      temperature: 0.2,
      maxTokens: 300,
    });

    await logAgentEvent({
      userId,
      feature: "feature_a",
      action: "question_answered",
      input: { question, sectionTitle, atomIds },
      output: { answerLength: answer.length },
      durationMs: Date.now() - started,
      ok: true,
    });

    return NextResponse.json({ answer });
  } catch (e) {
    await logAgentEvent({
      userId,
      feature: "feature_a",
      action: "question_answer_error",
      input: { question },
      output: {},
      durationMs: Date.now() - started,
      ok: false,
      errorText: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      {
        error: "Failed to generate answer.",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
