#!/usr/bin/env python3
"""
ax-inject.py — Inject a message into a Claude Desktop session via AX APIs.

Usage:
  python3 ax-inject.py "message"
  python3 ax-inject.py --session "Chat Title" "message"
  python3 ax-inject.py --session "Chat Title" --save-restore "message"

State handling:
  - Mid-response: Queue button appears and undims when text is set → click it
  - Idle: No button → focus text area + CGEvent Return keystroke
"""

from claude_ax import main


if __name__ == '__main__':
    main()
