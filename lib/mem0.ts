type Mem0Message = { role: "user" | "assistant" | "system"; content: string };

export function hasMem0(): boolean {
  return Boolean(process.env.MEM0_API_KEY);
}

function mem0Headers() {
  const key = process.env.MEM0_API_KEY;
  if (!key) throw new Error("Missing MEM0_API_KEY");
  return {
    Authorization: `Token ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function mem0Add(args: {
  userId: string;
  messages: Mem0Message[];
  metadata?: Record<string, unknown>;
}): Promise<unknown> {
  const res = await fetch("https://api.mem0.ai/v1/memories/", {
    method: "POST",
    headers: mem0Headers(),
    body: JSON.stringify({
      user_id: args.userId,
      messages: args.messages,
      metadata: args.metadata ?? {},
      version: "v2",
      async_mode: true,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mem0Search(args: {
  userId: string;
  query: string;
  topK?: number;
}): Promise<{ memories: Array<{ id: string; memory: string; score?: number }> }> {
  const res = await fetch("https://api.mem0.ai/v2/memories/search/", {
    method: "POST",
    headers: mem0Headers(),
    body: JSON.stringify({
      query: args.query,
      filters: { OR: [{ user_id: args.userId }] },
      top_k: args.topK ?? 6,
      rerank: true,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { memories?: Array<any> };
  return { memories: Array.isArray(data.memories) ? data.memories : [] };
}

export async function getPersonaAdjustments(userId: string): Promise<string> {
  if (!hasMem0()) return "";
  const q =
    "What content preferences does this user show? (length, depth, tone, more/less details, prefers analogies, prefers contrarian views, dislikes jargon)";
  const res = await mem0Search({ userId, query: q, topK: 6 });
  const lines = res.memories.map((m) => `- ${m.memory}`).filter(Boolean);
  if (!lines.length) return "";
  return ["User preference memories (apply them):", ...lines].join("\n");
}

