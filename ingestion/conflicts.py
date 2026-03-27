from __future__ import annotations

import os
import re
from collections import defaultdict

from ingestion.models import Atom, Conflict
from ingestion.tagging import llm_contradiction
from ingestion.utils import stable_id


_BULL = re.compile(r"\b(rise|rally|surge|gain|bullish|boost|upside|optimis|positive)\b", re.I)
_BEAR = re.compile(r"\b(fall|dip|decline|drop|bearish|downside|cautious|concern|negative|risk)\b", re.I)


def _keyword_polarity(text: str) -> str:
    bull = len(_BULL.findall(text))
    bear = len(_BEAR.findall(text))
    if bull > bear and bull >= 1:
        return "Bullish"
    if bear > bull and bear >= 1:
        return "Bearish"
    return "Neutral"


def detect_conflicts(
    atoms: list[Atom],
    use_llm: bool = True,
    max_pairs_per_bucket: int = 120,
) -> list[Conflict]:
    """
    Buckets atoms by (sector, primary entity) and flags opposing sentiment.
    If use_llm is True and GROQ_API_KEY is set, we cross-check top candidates.
    """
    buckets: dict[tuple[str, str], list[Atom]] = defaultdict(list)
    for a in atoms:
        sector = (a.tags.sector if a.tags else "Other") or "Other"
        ent = (a.tags.entities[0] if (a.tags and a.tags.entities) else None) or (a.entity_hint or "MARKET")
        buckets[(sector, ent)].append(a)

    conflicts: list[Conflict] = []

    groq_key = os.getenv("GROQ_API_KEY")
    groq_model = os.getenv("GROQ_MODEL") or "mistral-7b-instruct"
    llm_enabled = bool(use_llm and groq_key)

    for (sector, ent), items in buckets.items():
        # Sort stable-ish: by url then idx
        items = sorted(items, key=lambda x: (x.url, x.idx))

        # Generate candidate opposing pairs using tags sentiment first; fallback to keyword polarity.
        pairs_checked = 0
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                if pairs_checked >= max_pairs_per_bucket:
                    break
                a = items[i]
                b = items[j]

                sent_a = (a.tags.sentiment if a.tags else None) or _keyword_polarity(a.text)
                sent_b = (b.tags.sentiment if b.tags else None) or _keyword_polarity(b.text)

                if {sent_a, sent_b} == {"Bullish", "Bearish"}:
                    pairs_checked += 1
                    cid = stable_id("conflict", a.atom_id, b.atom_id)
                    conflicts.append(
                        Conflict(
                            conflict_id=cid,
                            a_atom_id=a.atom_id,
                            b_atom_id=b.atom_id,
                            url_a=a.url,
                            url_b=b.url,
                            reason=f"Opposing sentiment for sector={sector} entity={ent}: {sent_a} vs {sent_b}",
                            kind="sentiment_opposition",
                        )
                    )

                    if llm_enabled:
                        is_contra, reason = llm_contradiction(
                            api_key=groq_key,
                            model=groq_model,
                            a_text=a.text,
                            b_text=b.text,
                        )
                        if is_contra:
                            cid2 = stable_id("llm_contra", a.atom_id, b.atom_id)
                            conflicts.append(
                                Conflict(
                                    conflict_id=cid2,
                                    a_atom_id=a.atom_id,
                                    b_atom_id=b.atom_id,
                                    url_a=a.url,
                                    url_b=b.url,
                                    reason=reason or "LLM flagged contradiction.",
                                    kind="llm_contradiction",
                                )
                            )
                else:
                    # Lightweight market example: "rise" vs "cautious" keyword opposition.
                    pol_a = _keyword_polarity(a.text)
                    pol_b = _keyword_polarity(b.text)
                    if {pol_a, pol_b} == {"Bullish", "Bearish"}:
                        pairs_checked += 1
                        cid = stable_id("kw_conflict", a.atom_id, b.atom_id)
                        conflicts.append(
                            Conflict(
                                conflict_id=cid,
                                a_atom_id=a.atom_id,
                                b_atom_id=b.atom_id,
                                url_a=a.url,
                                url_b=b.url,
                                reason=f"Keyword opposition for sector={sector} entity={ent}: {pol_a} vs {pol_b}",
                                kind="keyword_opposition",
                            )
                        )
            if pairs_checked >= max_pairs_per_bucket:
                break

    # De-duplicate by conflict_id
    uniq: dict[str, Conflict] = {c.conflict_id: c for c in conflicts}
    return list(uniq.values())

