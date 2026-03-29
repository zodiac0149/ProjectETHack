from __future__ import annotations

import json
import os
from typing import Any

import httpx

from ingestion.models import AtomTags

class GroqTagger:
    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        if not self.api_key:
            raise RuntimeError("Missing GROQ_API_KEY (set it in environment or .env).")
        self.model = model or os.getenv("GROQ_MODEL") or "mistral-7b-instruct"

    def tag_atom(self, atom_text: str) -> AtomTags:
        system = (
            "You are a financial news tagger. "
            "Return ONLY valid JSON with keys: sector, sentiment, entities. "
            "sector must be one of: IT, Agriculture, Real Estate, Other. "
            "sentiment must be one of: Bullish, Bearish, Neutral. "
            "entities must be an array of strings (tickers, indices, minister names)."
        )
        user = (
            "Tag this atom.\n\n"
            f"ATOM:\n{atom_text}\n\n"
            "Return JSON only."
        )

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.0,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            r.raise_for_status()
            data = r.json()

        content = data["choices"][0]["message"]["content"]
        
        obj = json.loads(content.strip())
        return AtomTags(**obj)

def llm_contradiction(
    api_key: str,
    model: str,
    a_text: str,
    b_text: str,
) -> tuple[bool, str]:
    """
    Returns (is_contradiction, reason).
    Uses the same Groq chat endpoint; keeps output structured.
    """
    system = (
        "You detect contradictions between two short financial statements. "
        "Return ONLY JSON with keys: contradiction (true/false), reason (string)."
    )
    user = (
        "Compare A vs B for contradiction.\n\n"
        f"A: {a_text}\n\n"
        f"B: {b_text}\n\n"
        "Return JSON only."
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.0,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=30.0) as client:
        r = client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        r.raise_for_status()
        data = r.json()
    content = data["choices"][0]["message"]["content"]
    obj = json.loads(content.strip())
    return bool(obj.get("contradiction")), str(obj.get("reason", "")).strip()

