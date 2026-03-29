import sys
import os
import json
from pathlib import Path
from dotenv import load_dotenv

sys.path.append(os.getcwd())

from ingestion.scrape import fetch_article_markdown
from ingestion.run import _atomize
from ingestion.tagging import GroqTagger
from ingestion.utils import ensure_dir, write_jsonl

def ingest_one(url: str):
    load_dotenv()

    art = fetch_article_markdown(url)

    atoms = _atomize(url, art.title, art.markdown)

    if os.getenv("GROQ_API_KEY"):
        tagger = GroqTagger()
        for a in atoms:
            try:
                a.tags = tagger.tag_atom(a.text)
            except:
                pass

    out_dir = Path("data")
    ensure_dir(out_dir)
    atoms_path = out_dir / "atoms.jsonl"

    existing_ids = set()
    if atoms_path.exists():
        with open(atoms_path, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    existing_ids.add(json.loads(line)["atom_id"])
                except:
                    continue
                    
    new_atoms = [a for a in atoms if a.atom_id not in existing_ids]
    
    if new_atoms:
        with open(atoms_path, "a", encoding="utf-8") as f:
            for a in new_atoms:
                f.write(json.dumps(a.model_dump(mode="json")) + "\n")
                
    return {
        "title": art.title,
        "atoms_added": len(new_atoms),
        "total_atoms": len(atoms)
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No URL provided"}))
        sys.exit(1)
        
    url = sys.argv[1]
    try:
        res = ingest_one(url)
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
