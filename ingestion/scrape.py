from __future__ import annotations

from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from markdownify import markdownify as mdify

from ingestion.models import Article
from ingestion.utils import strip_markdown_noise, utcnow

def _guess_source(url: str) -> str | None:
    host = urlparse(url).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return host or None

def _extract_main_html(html: str) -> tuple[str | None, str]:
    soup = BeautifulSoup(html, "lxml")

    title = None
    if soup.title and soup.title.string:
        title = soup.title.string.strip()

    node = soup.find("article") or soup.find("main") or soup.body
    if node is None:
        return title, ""

    for tag in node.find_all(["script", "style", "noscript", "iframe", "svg"]):
        tag.decompose()
    for tag in node.find_all(["nav", "header", "footer", "aside"]):
        tag.decompose()

    return title, str(node)

def fetch_article_markdown(url: str, timeout_s: float = 30.0) -> Article:
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; LibrarianAgent/1.0; +https://example.local)"
    }
    with httpx.Client(follow_redirects=True, timeout=timeout_s, headers=headers) as client:
        resp = client.get(url)
        resp.raise_for_status()
        html = resp.text

    title, main_html = _extract_main_html(html)
    md = mdify(main_html or "", heading_style="ATX")
    md = strip_markdown_noise(md)

    return Article(
        url=url,
        fetched_at=utcnow(),
        title=title,
        source=_guess_source(url),
        markdown=md,
    )

