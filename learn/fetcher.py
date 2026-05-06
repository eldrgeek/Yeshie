"""
Step 1 of the loop: fetch a documentation corpus for an app.

Given seed URLs from apps/<app>.yaml, fetches each, extracts plain text via
BeautifulSoup, and writes:
    learn/<app>/docs/<slug>.md       — extracted text (one file per URL)
    learn/<app>/docs/_corpus.json    — index: {url, title, slug, char_count, fetched_at}

Cheap-model note: fetching + extraction is purely deterministic. No LLM here.
The corpus this produces is the *input* to the Sonnet-grade theorizing step.
"""
from __future__ import annotations

import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import requests
import yaml
from bs4 import BeautifulSoup

LEARN_ROOT = Path(__file__).resolve().parent
USER_AGENT = "YeshieLearnBot/0.1 (+https://github.com/eldrgeek/Yeshie)"
TIMEOUT = 20


def slugify(url: str) -> str:
    p = urlparse(url)
    raw = (p.netloc + p.path).strip("/").replace("/", "_")
    raw = re.sub(r"[^a-zA-Z0-9._-]+", "-", raw)
    return (raw or "index")[:120]


def extract_text(html: str) -> tuple[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.string.strip() if soup.title and soup.title.string else "").strip()
    for tag in soup(["script", "style", "noscript", "nav", "footer", "form"]):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.body or soup
    text = main.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return title, text


def fetch_one(url: str) -> dict | None:
    try:
        r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT, allow_redirects=True)
        r.raise_for_status()
    except Exception as e:
        return {"url": url, "error": str(e)}
    title, text = extract_text(r.text)
    return {
        "url": url,
        "final_url": r.url,
        "status": r.status_code,
        "title": title,
        "text": text,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


def fetch_corpus(app: str) -> dict:
    cfg_path = LEARN_ROOT / "apps" / f"{app}.yaml"
    cfg = yaml.safe_load(cfg_path.read_text())
    out_dir = LEARN_ROOT / app / "docs"
    out_dir.mkdir(parents=True, exist_ok=True)

    index = []
    for url in cfg.get("docs_seeds", []):
        print(f"  fetch {url}")
        result = fetch_one(url)
        if not result:
            continue
        if "error" in result:
            index.append({"url": url, "error": result["error"]})
            continue
        slug = slugify(url)
        md_path = out_dir / f"{slug}.md"
        body = f"# {result['title']}\n\nSource: {result['final_url']}\nFetched: {result['fetched_at']}\n\n---\n\n{result['text']}\n"
        md_path.write_text(body)
        index.append({
            "url": result["url"],
            "final_url": result["final_url"],
            "title": result["title"],
            "slug": slug,
            "path": str(md_path.relative_to(LEARN_ROOT)),
            "char_count": len(result["text"]),
            "fetched_at": result["fetched_at"],
        })
        time.sleep(0.5)  # polite

    # Also bring in any existing site evidence — payloads + site.model.json
    existing = cfg.get("existing_site_dir")
    if existing:
        repo_root = LEARN_ROOT.parent
        site_dir = repo_root / existing
        if site_dir.is_dir():
            for p in sorted(site_dir.rglob("*.json")):
                rel = p.relative_to(repo_root)
                index.append({
                    "url": f"file://{rel}",
                    "title": p.name,
                    "slug": f"existing__{p.stem}",
                    "path": str(rel),
                    "char_count": p.stat().st_size,
                    "kind": "existing-evidence",
                })

    (out_dir / "_corpus.json").write_text(json.dumps(index, indent=2))
    print(f"  wrote {len(index)} entries to {out_dir / '_corpus.json'}")
    return {"app": app, "entries": len(index), "out_dir": str(out_dir)}


if __name__ == "__main__":
    app = sys.argv[1] if len(sys.argv) > 1 else "yeshid"
    r = fetch_corpus(app)
    print(json.dumps(r, indent=2))
