import { getAnthropic, CLAUDE_MODEL } from "./anthropic";

export async function generateJSON<T>(args: {
  prompt: string;
  system: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const isSmall = (args.maxTokens || 1600) <= 400;
  
  const providers = isSmall
    ? ["gemini", "anthropic", "groq"]
    : ["groq", "gemini", "anthropic"];

  for (const provider of providers) {
    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = getAnthropic();
        const msg = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: args.maxTokens || 1600,
          temperature: args.temperature ?? 0.1,
          system: args.system,
          messages: [{ role: "user", content: args.prompt }],
        });
        const text = msg.content.find((c) => c.type === "text")?.text ?? "";
        return JSON.parse(text.trim()) as T;
      } catch (e: any) {
        console.error(`[LLM] Anthropic failed: ${e.message || e}`);
        continue;
      }
    }

    if (provider === "gemini" && process.env.GEMINI_API_KEY) {
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${args.system}\n\n${args.prompt}\n\nReturn ONLY valid JSON.` }] }],
            generationConfig: {
              temperature: args.temperature ?? 0.1,
              maxOutputTokens: args.maxTokens || 1600,
              responseMimeType: "application/json",
            },
          }),
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return JSON.parse(text.trim()) as T;
      } catch (e: any) {
        console.error(`[LLM] Gemini failed: ${e.message || e}`);
        continue;
      }
    }

    if (provider === "groq" && process.env.GROQ_API_KEY) {
      const models: string[] = [];
      if (process.env.GROQ_MODEL && process.env.GROQ_MODEL !== "llama3-8b-8192") models.push(process.env.GROQ_MODEL);
      if (process.env.GROQ_MODEL_FALLBACK && process.env.GROQ_MODEL_FALLBACK !== "llama3-8b-8192") models.push(process.env.GROQ_MODEL_FALLBACK);
      if (models.length === 0) models.push("llama-3.3-70b-versatile", "llama-3.1-8b-instant");

      for (const model of models) {
        try {
          const apiKey = process.env.GROQ_API_KEY;
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: args.system },
                { role: "user", content: args.prompt }
              ],
              temperature: args.temperature ?? 0.1,
              response_format: { type: "json_object" }
            })
          });
          if (!res.ok) throw new Error(await res.text());
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content ?? "";
          return JSON.parse(text.trim()) as T;
        } catch (e: any) {
          console.error(`[LLM] Groq (${model}) failed: ${e.message || e}`);
          
          continue;
        }
      }
      continue; 
    }
  }

  throw new Error("All LLM providers failed or credits exhausted.");
}

export async function generateText(args: {
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const providers = ["groq", "gemini", "anthropic"];
  
  console.log(`[LLM] generateText: Groq=${!!process.env.GROQ_API_KEY}, Gemini=${!!process.env.GEMINI_API_KEY}, Anthropic=${!!process.env.ANTHROPIC_API_KEY}`);

  for (const provider of providers) {
    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = getAnthropic();
        const msg = await anthropic.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: args.maxTokens || 1024,
          temperature: args.temperature ?? 0.7,
          system: args.system,
          messages: [{ role: "user", content: args.prompt }],
        });
        return msg.content.find((c) => c.type === "text")?.text ?? "";
      } catch (e: any) {
        console.warn("Anthropic text error, falling back...", e.message || e);
        continue;
      }
    }

    if (provider === "gemini" && process.env.GEMINI_API_KEY) {
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${args.system ? args.system + "\n\n" : ""}${args.prompt}` }] }],
            generationConfig: {
              temperature: args.temperature ?? 0.7,
              maxOutputTokens: args.maxTokens || 1024,
            },
          }),
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      } catch (e: any) {
        console.warn("Gemini text error, falling back...", e.message || e);
        continue;
      }
    }

    if (provider === "groq" && process.env.GROQ_API_KEY) {
      const models: string[] = [];
      if (process.env.GROQ_MODEL && process.env.GROQ_MODEL !== "llama3-8b-8192") models.push(process.env.GROQ_MODEL);
      if (process.env.GROQ_MODEL_FALLBACK && process.env.GROQ_MODEL_FALLBACK !== "llama3-8b-8192") models.push(process.env.GROQ_MODEL_FALLBACK);
      if (models.length === 0) models.push("llama-3.3-70b-versatile", "llama-3.1-8b-instant");

      for (const model of models) {
        try {
          const apiKey = process.env.GROQ_API_KEY;
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model,
              messages: [
                ...(args.system ? [{ role: "system", content: args.system }] : []),
                { role: "user", content: args.prompt }
              ],
              temperature: args.temperature ?? 0.7,
            })
          });
          if (!res.ok) throw new Error(await res.text());
          const data = await res.json();
          return data.choices?.[0]?.message?.content ?? "";
        } catch (e: any) {
          console.warn(`[LLM] Groq (${model}) text error, falling back...`, e.message || e);
          continue;
        }
      }
      continue;
    }
  }

  throw new Error("All LLM providers failed for text generation.");
}
