import { NextResponse } from "next/server";
import { runPython } from "@/lib/python";
import path from "node:path";

export async function POST(req: Request) {
  try {
    const { draft, outDir } = await req.json();
    if (!draft) {
      return NextResponse.json({ error: "Missing draft data" }, { status: 400 });
    }

    const targetDir = outDir || path.join(process.cwd(), "data", "video_out", Date.now().toString());
    const result = await runPython("video_engine.cli", ["render", JSON.stringify(draft), targetDir]);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error("Video Render Error:", error);
    return NextResponse.json(
      { error: "Failed to render video", detail: String(error) },
      { status: 500 }
    );
  }
}
