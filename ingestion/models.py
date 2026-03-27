from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Article(BaseModel):
    url: str
    fetched_at: datetime
    title: str | None = None
    source: str | None = None
    markdown: str


Sector = Literal["IT", "Agriculture", "Real Estate", "Other"]
Sentiment = Literal["Bullish", "Bearish", "Neutral"]


class AtomTags(BaseModel):
    sector: Sector = "Other"
    sentiment: Sentiment = "Neutral"
    entities: list[str] = Field(default_factory=list)


class Atom(BaseModel):
    atom_id: str
    url: str
    article_title: str | None = None
    idx: int
    text: str
    created_at: datetime

    # Lightweight retrieval metadata
    sector_hint: str | None = None
    entity_hint: str | None = None

    tags: AtomTags | None = None


class Conflict(BaseModel):
    conflict_id: str
    a_atom_id: str
    b_atom_id: str
    url_a: str
    url_b: str
    reason: str
    kind: Literal["sentiment_opposition", "llm_contradiction", "keyword_opposition"]


class VerificationResult(BaseModel):
    is_true: bool
    score: float  # 0 to 1.0
    reasoning: str
    supported_claims: list[str] = Field(default_factory=list)
    unsupported_claims: list[str] = Field(default_factory=list)
    conflicting_atoms: list[str] = Field(default_factory=list)  # IDs of atoms that contradict the post


class SocialPost(BaseModel):
    post_id: str
    platform: Literal["Twitter", "LinkedIn"]
    content: str
    source_atom_ids: list[str]
    verification: VerificationResult | None = None
    created_at: datetime = Field(default_factory=datetime.now)

