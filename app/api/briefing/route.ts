import { NextResponse } from "next/server";

import { loadAtoms, routeAtoms } from "@/lib/atoms";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    query?: string;
    topK?: number;
  };
  const query = (body.query || "").toString().trim();
  const topK = Number.isFinite(body.topK) ? Number(body.topK) : 28;

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const atoms = loadAtoms();
  if (!atoms.length) {
    return NextResponse.json(
      {
        error:
          "No atoms found. Run `python -m ingestion.run --out data` to generate data/atoms.jsonl, or set ATOMS_PATH.",
      },
      { status: 400 }
    );
  }

  const routed = routeAtoms(query, atoms, topK);
  return NextResponse.json({
    query,
    topK,
    atoms: routed.map((a) => ({
      atom_id: a.atom_id,
      url: a.url,
      article_title: a.article_title || null,
      idx: a.idx,
      text: a.text,
      tags: a.tags || null,
      routeScore: a.routeScore,
    })),
  });
}

