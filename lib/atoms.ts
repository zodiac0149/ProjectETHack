import fs from "node:fs";
import path from "node:path";
import { type Atom, type AtomTags } from "./types";
import pool from "./db";

export function atomsPath(): string {
  return process.env.ATOMS_PATH || path.join(process.cwd(), "data", "atoms.jsonl");
}

export async function loadAtoms(limit = 5000): Promise<Atom[]> {
  // Try DB first if configured
  if (process.env.DATABASE_URL) {
    try {
      const res = await pool.query(
        "SELECT * FROM atoms ORDER BY created_at DESC LIMIT $1",
        [limit]
      );
      return res.rows.map((r) => ({
        ...r,
        created_at: r.created_at.toISOString(),
      })) as Atom[];
    } catch (e) {
      // Offline or ECONNREFUSED is expected if no local Postgres is running.
      // We fall back silently to JSONL.
    }
  }

  const p = atomsPath();
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, "utf-8");
  const atoms: Atom[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      atoms.push(JSON.parse(t) as Atom);
      if (atoms.length >= limit) break;
    } catch {
      // ignore
    }
  }
  return atoms;
}

export async function saveAtoms(newAtoms: Atom[]): Promise<{ appended: number; path: string }> {
  const p = atomsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });

  // 1. Sync to Database if available
  let dbAppended = 0;
  if (process.env.DATABASE_URL) {
    try {
      for (const a of newAtoms) {
        await pool.query(
          `INSERT INTO atoms (atom_id, url, article_title, idx, text, created_at, tags) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           ON CONFLICT (atom_id) DO NOTHING`,
          [a.atom_id, a.url, a.article_title, a.idx, a.text, a.created_at, JSON.stringify(a.tags)]
        );
        dbAppended++;
      }
    } catch (e) {
      // Ignore DB save errors in fallback mode
    }
  }

  // 2. Sync to JSONL for local consistency/backup
  const seen = new Set<string>();
  if (fs.existsSync(p)) {
    const raw = fs.readFileSync(p, "utf-8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const a = JSON.parse(t) as Atom;
        if (a.atom_id) seen.add(a.atom_id);
      } catch { /* ignore */ }
    }
  }

  let fileAppended = 0;
  const lines: string[] = [];
  for (const a of newAtoms) {
    if (!a.atom_id || seen.has(a.atom_id)) continue;
    lines.push(JSON.stringify(a));
    fileAppended++;
    seen.add(a.atom_id);
  }
  
  if (lines.length) {
    fs.appendFileSync(p, (fs.existsSync(p) && !fs.readFileSync(p, "utf-8").endsWith("\n") ? "\n" : "") + lines.join("\n") + "\n", "utf-8");
  }

  return { appended: Math.max(dbAppended, fileAppended), path: p };
}

const STOP = new Set([
  "the","a","an","and","or","but","if","then","than","to","of","in","on","for","with","as","by",
  "from","is","are","was","were","be","been","being","this","that","these","those","it","its",
  "at","we","you","your","my","our","they","their","will","would","can","could","should","may",
  "might","about","into","over","under","up","down","out","what","how","does","do","did"
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%+.-]+/g, " ")
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && !STOP.has(x));
}

function scoreOverlap(queryTokens: string[], text: string): number {
  const toks = tokenize(text);
  if (!toks.length) return 0;
  const set = new Set(toks);
  let hits = 0;
  for (const q of queryTokens) if (set.has(q)) hits++;
  return hits / Math.sqrt(toks.length);
}

function sectorHintFromQuery(q: string): AtomTags["sector"] | null {
  const t = q.toLowerCase();
  if (/(it|software|tech|saas|services|infotech)/.test(t)) return "IT";
  if (/(agri|agriculture|farm|farmer|fertilis|msps|crop)/.test(t)) return "Agriculture";
  if (/(real estate|housing|property|realt(y|or)|mortgage|home loan)/.test(t)) return "Real Estate";
  return null;
}

export type RoutedAtom = Atom & { routeScore: number };

export function routeAtoms(query: string, atoms: Atom[], topK = 28): RoutedAtom[] {
  const qTokens = tokenize(query);
  const sectorHint = sectorHintFromQuery(query);
  const scored: RoutedAtom[] = atoms.map((a) => {
    let s = 0;
    s += 1.0 * scoreOverlap(qTokens, a.text);
    if (a.article_title) s += 0.35 * scoreOverlap(qTokens, a.article_title);
    if (a.tags?.entities?.length) {
      for (const ent of a.tags.entities.slice(0, 5)) {
        if (query.toLowerCase().includes(ent.toLowerCase())) s += 0.8;
      }
    }
    if (sectorHint && a.tags?.sector === sectorHint) s += 0.55;
    return { ...a, routeScore: s };
  });

  scored.sort((x, y) => y.routeScore - x.routeScore);

  const seen = new Set<string>();
  const out: RoutedAtom[] = [];
  for (const a of scored) {
    // Skip atoms with negligible relevance to the query
    if (a.routeScore < 0.15) break;  // sorted desc, so all remaining are worse
    const key = a.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
    if (out.length >= topK) break;
  }
  console.log(`[Atoms] Routed ${out.length} relevant atoms (from ${atoms.length} total, threshold: 0.15)`);
  return out;
}

