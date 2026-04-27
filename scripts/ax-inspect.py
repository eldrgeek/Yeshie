#!/usr/bin/env python3
"""
ax-inspect.py — Inspect Claude Desktop UI structure via AX APIs.

Usage:
  python3 ax-inspect.py overview
  python3 ax-inspect.py sessions
  python3 ax-inspect.py composer
  python3 ax-inspect.py tree --max-depth 4
"""

import argparse
import json
import sys

from claude_ax import (
    find_claude_window,
    get_composer_state,
    get_selected_session,
    list_sessions,
    serialize_tree,
)


def build_parser():
    parser = argparse.ArgumentParser(description='Inspect Claude Desktop AX structure')
    subparsers = parser.add_subparsers(dest='command', required=True)

    subparsers.add_parser('overview', help='Show sessions plus composer state')
    subparsers.add_parser('sessions', help='List visible sidebar sessions')
    subparsers.add_parser('composer', help='Show prompt composer state')
    tree = subparsers.add_parser('tree', help='Dump a JSON AX tree snapshot')
    tree.add_argument('--max-depth', type=int, default=5, help='Maximum AX tree depth to include')
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    win = find_claude_window()
    if not win:
        return 1

    sessions = [
        {'title': session['title'], 'selected': session['selected']}
        for session in list_sessions(win)
    ]
    selected = get_selected_session(win)
    composer = get_composer_state(win)

    if args.command == 'sessions':
        payload = {
            'sessions': sessions,
            'selected_session': selected['title'] if selected else None,
        }
    elif args.command == 'composer':
        payload = composer
    elif args.command == 'tree':
        payload = serialize_tree(win, max_depth=args.max_depth)
    else:
        payload = {
            'selected_session': selected['title'] if selected else None,
            'session_count': len(sessions),
            'sessions': sessions,
            'composer': composer,
        }

    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write('\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
