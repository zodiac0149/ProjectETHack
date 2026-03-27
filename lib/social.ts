import { generateJSON, generateText } from "./llm";
import { type Atom, type SocialPost, type VerificationResult } from "./types";
import crypto from "node:crypto";

export async function generateSocialPost(
  atoms: Atom[],
  platform: "Twitter" | "LinkedIn",
  tone: string = "professional"
): Promise<SocialPost> {
  const context = atoms.map((a) => `[Source ${a.atom_id}]: ${a.text}`).join("\n---\n");

  const prompt = `You are a Social Media Manager. Create a ${tone} ${platform} post based on the following news atoms. 
  The post should be engaging and accurate.
  
  News Atoms:
  ${context}
  
  Return ONLY the post content.`;

  const content = await generateText({
    prompt,
    temperature: 0.7,
    maxTokens: 1024,
  });
  const post_id = crypto.createHash("md5").update(content).digest("hex").slice(0, 12);

  // Auto-verify
  const verification = await verifyPost(content, atoms);

  return {
    post_id,
    platform,
    content,
    source_atom_ids: atoms.map((a) => a.atom_id),
    verification,
    created_at: new Date().toISOString(),
  };
}

export async function verifyPost(content: string, atoms: Atom[]): Promise<VerificationResult> {
  const context = atoms.map((a) => `[Source ${a.atom_id}]: ${a.text}`).join("\n---\n");

  const system = `You are a Fact-Checking Agent. Verify the discrete claims in a Social Media Post against the provided Source Atoms.
  Return ONLY JSON with the following structure:
  {
    "is_true": boolean,
    "score": number (0 to 1),
    "reasoning": string,
    "supported_claims": string[],
    "unsupported_claims": string[],
    "conflicting_atom_ids": string[]
  }`;

  const user = `Social Media Post:
  ${content}
  
  Source Atoms:
  ${context}
  
  Verify claims and return JSON only.`;

  try {
    const result = await generateJSON<any>({
      system,
      prompt: user,
      maxTokens: 2048,
    });
    return {
      is_true: result.is_true ?? (result.score > 0.7),
      score: result.score ?? 0,
      reasoning: result.reasoning ?? "",
      supported_claims: result.supported_claims ?? [],
      unsupported_claims: result.unsupported_claims ?? [],
      conflicting_atom_ids: result.conflicting_atom_ids ?? [],
    };
  } catch (e) {
    return {
      is_true: false,
      score: 0,
      reasoning: "Verification failed to parse JSON response.",
      supported_claims: [],
      unsupported_claims: ["System Error"],
      conflicting_atom_ids: [],
    };
  }
}
