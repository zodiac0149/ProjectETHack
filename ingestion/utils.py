from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

def utcnow() -> datetime:
    return datetime.now(tz=timezone.utc)

def stable_id(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8"))
        h.update(b"\x1f")
    return h.hexdigest()[:24]

def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)

def write_text(path: Path, text: str) -> None:
    ensure_dir(path.parent)
    path.write_text(text, encoding="utf-8")

def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

_sent_split = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")

def split_sentences(text: str) -> list[str]:
    t = re.sub(r"\s+", " ", text.strip())
    if not t:
        return []
    return [s.strip() for s in _sent_split.split(t) if s.strip()]

def chunk_sentences(sentences: list[str], n: int = 3) -> list[str]:
    out: list[str] = []
    for i in range(0, len(sentences), n):
        chunk = " ".join(sentences[i : i + n]).strip()
        if chunk:
            out.append(chunk)
    return out

def strip_markdown_noise(md: str) -> str:
    
    md = md.replace("\r\n", "\n")
    md = re.sub(r"\n{3,}", "\n\n", md).strip()
    return md

