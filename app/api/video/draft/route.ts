import { NextResponse } from "next/server";
import { runPython } from "@/lib/python";

export async function POST(req: Request) {
  try {
    const { atomText } = await req.json();
    if (!atomText) {
      return NextResponse.json({ error: "Missing atomText" }, { status: 400 });
    }

    const draft = await runPython("video_engine.cli", ["draft", atomText]);
    return NextResponse.json(draft);
  } catch (error) {
    console.error("Video Draft Error:", error);
    return NextResponse.json(
      { error: "Failed to generate video draft", detail: String(error) },
      { status: 500 }
    );
  }
}
