import os
import json
import httpx
from datetime import datetime
from typing import List, Literal
from ingestion.models import Atom, SocialPost, VerificationResult
from ingestion.verification import verify_post_against_atoms

def generate_social_post(
    atoms: List[Atom], 
    platform: Literal["Twitter", "LinkedIn"],
    tone: str = "professional"
) -> SocialPost:
    """
    Generates a social media post from a list of atoms and verifies it.
    """
    groq_key = os.getenv("GROQ_API_KEY")
    groq_model = os.getenv("GROQ_MODEL") or "mistral-7b-instruct"
    
    if not groq_key:
        raise ValueError("GROQ_API_KEY not found in environment.")

    # Prepare context
    context = "\n---\n".join([f"Atom {a.atom_id}: {a.text}" for a in atoms])
    
    system = (
        f"You are a Social Media Manager. Create a {tone} {platform} post based on the provided news atoms. "
        "The post should be engaging and accurate. "
        "Return ONLY the post content as a raw string."
    )
    user = (
        f"News Atoms:\n{context}\n\n"
        f"Create a {platform} post."
    )

    payload = {
        "model": groq_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.7,
    }
    headers = {
        "Authorization": f"Bearer {groq_key}",
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
    
    post_content = data["choices"][0]["message"]["content"].strip()
    
    # Run verification immediately
    verification = verify_post_against_atoms(post_content, atoms)
    
    # Generate a stable ID (mocking stable_id for now as I don't want to import utils yet if not needed)
    import hashlib
    post_id = hashlib.md5(post_content.encode()).hexdigest()[:12]
    
    return SocialPost(
        post_id=post_id,
        platform=platform,
        content=post_content,
        source_atom_ids=[a.atom_id for a in atoms],
        verification=verification,
        created_at=datetime.now()
    )
