"""
Step 4 of the loop: run a proposed skill against the live app via the Yeshie
relay (localhost:3333), capture the outcome, and write a run report.

For tonight's MVP this is a SKETCH — it knows how to POST to the relay and
how to record outcomes, but the full feedback loop (failure → refine theory →
re-propose) is not wired. The structure is here so tomorrow's work can fill it.

Usage:
    python execute.py <app> [skill_filename]      # dry-run (default)
    python execute.py <app> [skill_filename] --live   # actually POST to relay

Cheap-model future: when this loops autonomously, the in-loop decisions
("did the snackbar say success?", "which validation field failed?") are
classification tasks that Haiku / Gemini Flash handle well. Only the
*re-theorize* step on a hard failure should escalate back to Sonnet.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

LEARN_ROOT = Path(__file__).resolve().parent
RELAY_URL = "http://localhost:3333"


def relay_status() -> dict:
    try:
        r = requests.get(f"{RELAY_URL}/status", timeout=3)
        return r.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


def find_skill(app: str, name: str | None) -> Path:
    skills_dir = LEARN_ROOT / app / "skills"
    if name:
        p = skills_dir / name
        if p.exists():
            return p
    candidates = sorted(skills_dir.glob("*.payload.json"))
    if not candidates:
        raise FileNotFoundError(f"No skills in {skills_dir}")
    return candidates[0]


def execute(app: str, skill_name: str | None = None, live: bool = False) -> Path:
    skill_path = find_skill(app, skill_name)
    payload = json.loads(skill_path.read_text())
    runs_dir = LEARN_ROOT / app / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_path = runs_dir / f"{ts}__{skill_path.stem}.json"

    status = relay_status()
    print(f"  relay status: {status}")

    tests = payload.get("_tests") or [{"name": "default", "params": {}, "expect": "unknown"}]
    results = []
    for tc in tests:
        materialized = json.loads(json.dumps(payload))  # deep copy
        for k, v in tc.get("params", {}).items():
            materialized.setdefault("params", {})[k] = v
        materialized.pop("_tests", None)

        if not live:
            results.append({
                "test": tc["name"],
                "outcome": "dry-run",
                "would_post_to": f"{RELAY_URL}/run",
                "param_overrides": tc.get("params", {}),
                "expect": tc.get("expect"),
            })
            continue

        try:
            r = requests.post(f"{RELAY_URL}/run", json=materialized, timeout=120)
            chain_result = r.json()
        except Exception as e:
            chain_result = {"ok": False, "error": str(e)}

        results.append({
            "test": tc["name"],
            "outcome": "ok" if chain_result.get("ok") else "fail",
            "expect": tc.get("expect"),
            "chain_result": chain_result,
        })

    report = {
        "app": app,
        "skill": skill_path.name,
        "started_at": ts,
        "live": live,
        "relay_status": status,
        "results": results,
        # TODO: feedback hook — when outcome != expect, append failure summary
        # to learn/<app>/theory_refinements/<ts>.md and trigger re-theorize.
    }
    run_path.write_text(json.dumps(report, indent=2))
    print(f"  wrote {run_path}")
    return run_path


if __name__ == "__main__":
    args = sys.argv[1:]
    live = "--live" in args
    args = [a for a in args if a != "--live"]
    app = args[0] if args else "yeshid"
    skill = args[1] if len(args) > 1 else None
    execute(app, skill, live=live)
