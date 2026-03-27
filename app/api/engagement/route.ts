import { NextResponse } from "next/server";

import { logAgentEvent } from "@/lib/agentLog";
import { hasMem0, mem0Add } from "@/lib/mem0";

type EngagementEvent = "skipped" | "more_detail" | "less_detail" | "liked";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    itemType?: "video" | "briefing" | "persona";
    itemId?: string;
    event?: EngagementEvent;
    context?: string;
  };

  const userId = (body.userId || "").toString().trim();
  const itemType = body.itemType || "briefing";
  const itemId = (body.itemId || "").toString().trim() || null;
  const event = body.event as EngagementEvent;
  const context = (body.context || "").toString().trim();

  if (!userId || !event) {
    return NextResponse.json({ error: "Missing userId/event" }, { status: 400 });
  }

  const started = Date.now();
  let mem0Ok = false;
  let mem0Resp: unknown = null;
  let mem0Err: string | null = null;

  if (hasMem0()) {
    try {
      const memoryText =
        event === "skipped"
          ? `User skipped a ${itemType}. Prefer shorter / more punchy summaries. Context: ${context || "n/a"}`
          : event === "more_detail"
            ? `User asked for more detail on a ${itemType}. Prefer deeper explanations, examples, and trade-offs. Context: ${context || "n/a"}`
            : event === "less_detail"
              ? `User asked for less detail on a ${itemType}. Prefer concise outputs. Context: ${context || "n/a"}`
              : `User liked a ${itemType}. Keep this style. Context: ${context || "n/a"}`;

      mem0Resp = await mem0Add({
        userId,
        messages: [{ role: "user", content: memoryText }],
        metadata: { category: "engagement_feedback", itemType, itemId, event },
      });
      mem0Ok = true;
    } catch (e) {
      mem0Err = e instanceof Error ? e.message : String(e);
    }
  }

  await logAgentEvent({
    userId,
    feature: "extra_credit",
    action: "engagement_feedback",
    model: "mem0",
    input: { userId, itemType, itemId, event, context },
    output: { mem0Ok, mem0Resp },
    meta: { mem0Err },
    durationMs: Date.now() - started,
    ok: mem0Ok || !hasMem0(),
    errorText: mem0Err,
  });

  return NextResponse.json({ ok: true, mem0Ok, mem0Err });
}

