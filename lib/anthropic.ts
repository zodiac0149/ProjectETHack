import Anthropic from "@anthropic-ai/sdk";

export function getAnthropic(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }
  return new Anthropic({ apiKey: key });
}

export const CLAUDE_MODEL =
  process.env.CLAUDE_MODEL || "claude-3-5-sonnet-latest";

