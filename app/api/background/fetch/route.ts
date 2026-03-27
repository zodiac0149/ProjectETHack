import { NextResponse } from "next/server";

import { backgroundFetchAndIngest } from "@/lib/backgroundFetch";
import { logAgentEvent } from "@/lib/agentLog";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    maxHeadlines?: number;
  };
  const userId = (body.userId || "").toString().trim();
  const maxHeadlines = Number.isFinite(body.maxHeadlines)
    ? Number(body.maxHeadlines)
    : 18;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const started = Date.now();
  try {
    const result = await backgroundFetchAndIngest({ userId, maxHeadlines });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await logAgentEvent({
      userId,
      feature: "background_fetch",
      action: "fetch_and_ingest_error",
      model: "et_public+rss",
      input: { userId, maxHeadlines },
      output: {},
      durationMs: Date.now() - started,
      ok: false,
      errorText: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Background fetch failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

