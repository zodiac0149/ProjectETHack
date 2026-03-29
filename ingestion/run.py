from __future__ import annotations

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

from ingestion.conflicts import detect_conflicts
from ingestion.models import Atom
from ingestion.scrape import fetch_article_markdown
from ingestion.tagging import GroqTagger
from ingestion.utils import (
    chunk_sentences,
    ensure_dir,
    split_sentences,
    stable_id,
    utcnow,
    write_jsonl,
    write_text,
)

def _read_urls(path: Path) -> list[str]:
    if not path.exists():
        raise RuntimeError(f"Missing URL list at {path}")
    urls: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        urls.append(t)
    return urls

def _atomize(url: str, article_title: str | None, markdown: str) -> list[Atom]:
    sentences = split_sentences(markdown)
    chunks = chunk_sentences(sentences, n=3)
    atoms: list[Atom] = []
    created = utcnow()
    for idx, chunk in enumerate(chunks):
        atom_id = stable_id("atom", url, str(idx), chunk[:80])
        atoms.append(
            Atom(
                atom_id=atom_id,
                url=url,
                article_title=article_title,
                idx=idx,
                text=chunk,
                created_at=created,
            )
        )
    return atoms

def main() -> int:
    load_dotenv()

    p = argparse.ArgumentParser(description="Librarian Agent: ingest/tag/conflict")
    p.add_argument("--urls", default="config/articles.txt", help="Path to URLs file")
    p.add_argument("--out", default="data", help="Output directory")
    p.add_argument("--no-llm", action="store_true", help="Disable Groq tagging and LLM contradiction checks")
    p.add_argument("--max-conflict-pairs", type=int, default=120, help="Max pairs per (sector,entity) bucket")
    args = p.parse_args()

    out_dir = Path(args.out)
    articles_dir = out_dir / "articles"
    ensure_dir(articles_dir)

    urls = _read_urls(Path(args.urls))
    if not urls:
        raise RuntimeError("No URLs found. Put your 22 links into config/articles.txt.")

    do_llm = not args.no_llm
    tagger = None
    if do_llm:
        tagger = GroqTagger()

    all_atoms: list[Atom] = []
    article_rows = []

    for url in tqdm(urls, desc="Fetching articles"):
        art = fetch_article_markdown(url)
        fname = f"{stable_id('article', url)}.md"
        md_path = articles_dir / fname
        write_text(md_path, f"# {art.title or 'Article'}\n\n{art.markdown}\n")
        article_rows.append(art.model_dump())

        atoms = _atomize(url=url, article_title=art.title, markdown=art.markdown)
        all_atoms.extend(atoms)

    if do_llm and tagger:
        for i, a in enumerate(tqdm(all_atoms, desc="Tagging atoms (Groq)")):
            try:
                a.tags = tagger.tag_atom(a.text)
            except Exception as e:
                
                a.tags = None
                a.sector_hint = "tag_error"
                a.entity_hint = str(e)[:120]
            all_atoms[i] = a

    atoms_path = out_dir / "atoms.jsonl"
    write_jsonl(atoms_path, [a.model_dump() for a in all_atoms])

    conflicts = detect_conflicts(
        atoms=all_atoms,
        use_llm=do_llm,
        max_pairs_per_bucket=args.max_conflict_pairs,
    )
    conflicts_path = out_dir / "conflicts.jsonl"
    write_jsonl(conflicts_path, [c.model_dump() for c in conflicts])

    summary = (
        f"Done.\n"
        f"- Articles: {len(urls)} (saved to {articles_dir})\n"
        f"- Atoms: {len(all_atoms)} (saved to {atoms_path})\n"
        f"- Conflicts: {len(conflicts)} (saved to {conflicts_path})\n"
        f"- LLM tagging: {'on' if do_llm else 'off'}\n"
    )
    print(summary)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())

