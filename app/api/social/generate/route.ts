import { NextResponse } from "next/server";
import { generateSocialPost } from "@/lib/social";
import { loadAtoms } from "@/lib/atoms";

export async function POST(req: Request) {
  try {
    const { sourceAtomIds, platform, tone } = await req.json();

    if (!sourceAtomIds || !Array.isArray(sourceAtomIds) || sourceAtomIds.length === 0) {
      return NextResponse.json({ error: "Missing or invalid sourceAtomIds" }, { status: 400 });
    }

    if (!platform || (platform !== "Twitter" && platform !== "LinkedIn")) {
      return NextResponse.json({ error: "Invalid platform. Must be Twitter or LinkedIn" }, { status: 400 });
    }

    // Load actual atoms from IDs
    const allAtoms = await loadAtoms(2000);
    const selectedAtoms = allAtoms.filter((a) => sourceAtomIds.includes(a.atom_id));

    if (selectedAtoms.length === 0) {
      return NextResponse.json({ error: "No matching atoms found for the provided IDs" }, { status: 404 });
    }

    const post = await generateSocialPost(selectedAtoms, platform, tone || "professional");

    return NextResponse.json(post);
  } catch (error) {
    console.error("Social Generation Error:", error);
    return NextResponse.json(
      { error: "Failed to generate social post", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
