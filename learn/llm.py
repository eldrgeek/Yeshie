"""
LLM caller for the bootstrap loop.

Uses `claude -p` (the Claude Code CLI, already authed for this user) as the
backend. Avoids needing a separate ANTHROPIC_API_KEY in the environment.

Bootstrap stages (theorize, propose_skill) want high reasoning — Sonnet-class.
Execution stage (running an encoded skill against a live page) is intentionally
NOT routed through this module: once a skill is structured/deterministic, the
extension's executor calls a cheap model (Haiku / Gemini Flash) for any
in-loop decisions. Keep this module *only* for cold-start reasoning.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

CLAUDE_BIN = shutil.which("claude") or "/usr/local/bin/claude"


def call_claude(prompt: str, *, model: str = "sonnet", timeout: int = 600) -> str:
    """Run `claude -p` with the given prompt and return stdout text.

    Falls back to printing the prompt to a file and asking the operator to run it
    if the CLI isn't available.
    """
    if not Path(CLAUDE_BIN).exists() and not shutil.which("claude"):
        raise RuntimeError(
            f"claude CLI not found at {CLAUDE_BIN}. "
            "Install Claude Code or set CLAUDE_BIN in env."
        )
    cmd = [CLAUDE_BIN, "-p", prompt, "--model", model]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        env={**os.environ},
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"claude -p failed (exit {proc.returncode}): {proc.stderr[:500]}"
        )
    return proc.stdout.strip()


if __name__ == "__main__":
    print(call_claude(sys.argv[1] if len(sys.argv) > 1 else "Say hi in 3 words."))
