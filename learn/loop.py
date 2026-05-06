"""
Yeshie "learn one skill at a time" loop — main entry point.

Usage:
    python loop.py <app>                 # run all four steps
    python loop.py <app> --steps fetch,theorize
    python loop.py <app> --steps propose
    python loop.py <app> --execute --live

Apps live in learn/apps/<app>.yaml. Outputs land in learn/<app>/.

The loop:
  1. fetch       — pull docs corpus from configured seed URLs (+ existing site evidence)
  2. theorize    — Sonnet-grade pass: corpus → theory.md (conceptual model)
  3. propose     — Sonnet-grade pass: theory → first skill (Yeshie payload JSON)
  4. execute     — POST skill to Yeshie relay, capture outcome, log to runs/

Architecture comment:
  Bootstrap (steps 2 & 3) is high-reasoning — Sonnet via `claude -p`.
  Execution (step 4) and any in-loop decisions during a live run can be cheap
  (Haiku / Gemini Flash) because the skill is structured and the executor is
  largely deterministic. The cost asymmetry is the whole point: pay Sonnet
  prices once at encoding time, then run the skill cheaply forever.
"""
from __future__ import annotations

import argparse
import sys
import traceback

import fetcher
import theorize as theorize_mod
import propose_skill as propose_mod
import execute as execute_mod


STEPS = ("fetch", "theorize", "propose", "execute")


def run(app: str, steps: list[str], live: bool) -> int:
    failures = []
    for step in steps:
        print(f"\n=== [{app}] step: {step} ===")
        try:
            if step == "fetch":
                fetcher.fetch_corpus(app)
            elif step == "theorize":
                theorize_mod.theorize(app)
            elif step == "propose":
                propose_mod.propose(app)
            elif step == "execute":
                execute_mod.execute(app, None, live=live)
            else:
                print(f"unknown step: {step}")
        except Exception as e:
            failures.append((step, e))
            print(f"  FAIL: {e}")
            traceback.print_exc()
    if failures:
        print(f"\n{len(failures)} step(s) failed:")
        for s, e in failures:
            print(f"  {s}: {e}")
        return 1
    print("\nALL STEPS COMPLETE")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("app", help="App name (matches learn/apps/<app>.yaml)")
    ap.add_argument("--steps", default="fetch,theorize,propose",
                    help="Comma-separated steps to run. Default skips execute.")
    ap.add_argument("--execute", action="store_true",
                    help="Append execute step.")
    ap.add_argument("--live", action="store_true",
                    help="With --execute, actually POST to relay (default is dry-run).")
    args = ap.parse_args()

    steps = [s.strip() for s in args.steps.split(",") if s.strip()]
    if args.execute and "execute" not in steps:
        steps.append("execute")
    invalid = [s for s in steps if s not in STEPS]
    if invalid:
        ap.error(f"unknown step(s): {invalid}. Choose from {STEPS}")

    sys.exit(run(args.app, steps, args.live))


if __name__ == "__main__":
    main()
