import os
import json
import httpx
from typing import List
from ingestion.models import Atom, VerificationResult

def verify_post_against_atoms(post_content: str, atoms: List[Atom]) -> VerificationResult:
    """
    Uses an LLM to verify if the claims in a social media post are supported by the provided atoms.
    """
    groq_key = os.getenv("GROQ_API_KEY")
    groq_model = os.getenv("GROQ_MODEL") or "mistral-7b-instruct"
    
    if not groq_key:
        return VerificationResult(
            is_true=False,
            score=0.0,
            reasoning="Verification failed: GROQ_API_KEY not found.",
            supported_claims=[],
            unsupported_claims=["All claims (system error)"]
        )

    context = "\n---\n".join([f"Source [{a.atom_id}]: {a.text}" for a in atoms])
    
    system = (
        "You are a Fact-Checking Agent. Verify the discrete claims in a Social Media Post against the provided Source Atoms. "
        "Return ONLY JSON with keys: is_true (bool), score (float 0-1), reasoning (str), supported_claims (list), unsupported_claims (list), conflicting_atom_ids (list)."
    )
    user = (
        f"Social Media Post:\n{post_content}\n\n"
        f"Source Atoms:\n{context}\n\n"
        "Verify claims and return JSON only."
    )

    payload = {
        "model": groq_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.0,
    }
    headers = {
        "Authorization": f"Bearer {groq_key}",
        "Content-Type": "application/json",
    }

    try:
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

        score = float(obj.get("score", 0.0))
        return VerificationResult(
            is_true=bool(obj.get("is_true", score > 0.7)),
            score=score,
            reasoning=str(obj.get("reasoning", "")),
            supported_claims=list(obj.get("supported_claims", [])),
            unsupported_claims=list(obj.get("unsupported_claims", [])),
            conflicting_atoms=list(obj.get("conflicting_atom_ids", []))
        )
    except Exception as e:
        return VerificationResult(
            is_true=False,
            score=0.0,
            reasoning=f"Verification script error: {str(e)}",
            supported_claims=[],
            unsupported_claims=["Error during verification processing"]
        )
