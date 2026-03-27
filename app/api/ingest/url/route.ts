import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "Missing URL" }, { status: 400 });

  try {
    const { stdout } = await execAsync(`python scripts/ingest_one.py "${url}"`);
    const result = JSON.parse(stdout);
    if (result.error) throw new Error(result.error);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
