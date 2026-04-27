#!/usr/bin/env python3
"""
claude-desktop-control.py — High-level Claude Desktop automation via AX APIs.

Examples:
  python3 claude-desktop-control.py focus-map
  python3 claude-desktop-control.py sessions
  python3 claude-desktop-control.py click --contains "Projects"
  python3 claude-desktop-control.py switch-session --title "Cognitive Architecture"
  python3 claude-desktop-control.py set-prompt "Draft message"
  python3 claude-desktop-control.py submit
  python3 claude-desktop-control.py inject --session "Cognitive Architecture" "Hello"
"""

import argparse
import sys
import time

from claude_ax import (
    activate_claude,
    click_control,
    click_first_match,
    find_claude_window,
    get_active_web_title,
    get_composer_state,
    get_selected_session,
    inject_message,
    list_controls,
    list_sessions,
    press_key,
    print_json,
    serialize_tree,
    set_prompt_text,
    submit_prompt,
)


def build_parser():
    parser = argparse.ArgumentParser(description='Claude Desktop automation')
    subparsers = parser.add_subparsers(dest='command', required=True)

    subparsers.add_parser('activate', help='Bring Claude Desktop to the front')
    subparsers.add_parser('focus-map', help='Summarize current Claude Desktop UI state')
    subparsers.add_parser('sessions', help='List visible Claude session titles')
    controls = subparsers.add_parser('controls', help='List named AX controls')
    controls.add_argument('--role', action='append', help='Filter by AX role, e.g. AXButton')

    tree = subparsers.add_parser('tree', help='Dump the AX tree')
    tree.add_argument('--max-depth', type=int, default=5)

    click = subparsers.add_parser('click', help='Click a matching AX control')
    add_match_args(click)

    switch = subparsers.add_parser('switch-session', help='Switch to a visible Claude session by title substring')
    switch.add_argument('--title', required=True)

    set_prompt = subparsers.add_parser('set-prompt', help='Set the Claude composer text')
    set_prompt.add_argument('text')

    subparsers.add_parser('submit', help='Submit the current composer contents')
    subparsers.add_parser('new-chat', help='Open a new Claude chat')
    subparsers.add_parser('open-search', help='Open Claude search')
    subparsers.add_parser('open-projects', help='Open Projects')
    subparsers.add_parser('open-scheduled', help='Open Scheduled items')
    subparsers.add_parser('open-dispatch', help='Open Dispatch')
    subparsers.add_parser('open-artifacts', help='Open Artifacts')
    subparsers.add_parser('open-customize', help='Open Customize')
    subparsers.add_parser('open-chat', help='Switch to Chat mode')
    subparsers.add_parser('open-cowork', help='Switch to Cowork mode')
    subparsers.add_parser('open-code', help='Switch to Code mode')
    subparsers.add_parser('open-get-apps', help='Open Get apps and extensions')
    subparsers.add_parser('open-bypass-permissions', help='Open Bypass permissions if visible')
    subparsers.add_parser('attach-file', help='Open file attachment flow')
    subparsers.add_parser('share-chat', help='Open share-chat flow if visible')

    inject = subparsers.add_parser('inject', help='Inject text, optionally after switching session')
    inject.add_argument('--session')
    inject.add_argument('--save-restore', action='store_true')
    inject.add_argument('text')

    press = subparsers.add_parser('press', help='Send a key press')
    press.add_argument('key')
    press.add_argument('--modifier', action='append', default=[])

    return parser


def add_match_args(parser):
    parser.add_argument('--title')
    parser.add_argument('--contains')
    parser.add_argument('--description')
    parser.add_argument('--role')


def require_window():
    win = find_claude_window()
    if not win:
        sys.exit(1)
    return win


def click_named(win, *, title=None, contains=None, description=None):
    return click_control(win, title=title, contains=contains, description=description, role='AXButton')


def click_alias(win, aliases):
    return click_first_match(
        win,
        [{**alias, 'role': 'AXButton'} for alias in aliases],
    )


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.command == 'activate':
        return 0 if activate_claude() else 1

    win = require_window()

    if args.command == 'focus-map':
        sessions = [{'title': s['title'], 'selected': s['selected']} for s in list_sessions(win)]
        selected = get_selected_session(win)
        payload = {
            'active_web_title': get_active_web_title(win),
            'selected_session': selected['title'] if selected else None,
            'composer': get_composer_state(win),
            'session_count': len(sessions),
            'sessions': sessions,
        }
        print_json(payload)
        return 0

    if args.command == 'sessions':
        sessions = [{'title': s['title'], 'selected': s['selected']} for s in list_sessions(win)]
        print_json({'selected_session': (get_selected_session(win) or {}).get('title'), 'sessions': sessions})
        return 0

    if args.command == 'controls':
        roles = set(args.role or [])
        controls = [
            {
                'role': control['role'],
                'title': control['title'],
                'description': control['description'],
                'placeholder': control['placeholder'],
                'selected': control['selected'],
            }
            for control in list_controls(win, roles=roles or None)
        ]
        print_json({'controls': controls})
        return 0

    if args.command == 'tree':
        print_json(serialize_tree(win, max_depth=args.max_depth))
        return 0

    if args.command == 'click':
        ok = click_control(
            win,
            title=args.title,
            contains=args.contains,
            description=args.description,
            role=args.role,
        )
        return 0 if ok else 1

    if args.command == 'switch-session':
        ok = click_control(win, contains=args.title, role='AXButton')
        if ok:
            time.sleep(1.0)
        return 0 if ok else 1

    if args.command == 'set-prompt':
        return 0 if set_prompt_text(win, args.text) else 1

    if args.command == 'submit':
        return 0 if submit_prompt(win) else 1

    if args.command == 'new-chat':
        return 0 if click_named(win, contains='New chat') else 1

    if args.command == 'open-search':
        return 0 if click_named(win, description='Search') else 1

    if args.command == 'open-projects':
        return 0 if click_named(win, title='Projects') else 1

    if args.command == 'open-scheduled':
        return 0 if click_alias(win, [{'title': 'Scheduled'}, {'contains': 'Scheduled'}]) else 1

    if args.command == 'open-dispatch':
        return 0 if click_alias(win, [{'title': 'Dispatch'}, {'contains': 'Dispatch'}]) else 1

    if args.command == 'open-artifacts':
        return 0 if click_named(win, title='Artifacts') else 1

    if args.command == 'open-customize':
        return 0 if click_named(win, title='Customize') else 1

    if args.command == 'open-chat':
        return 0 if click_named(win, description='Chat') else 1

    if args.command == 'open-cowork':
        return 0 if click_named(win, description='Cowork') else 1

    if args.command == 'open-code':
        return 0 if click_named(win, description='Code') else 1

    if args.command == 'open-get-apps':
        return 0 if click_named(win, description='Get apps and extensions') else 1

    if args.command == 'open-bypass-permissions':
        return 0 if click_alias(win, [{'title': 'Bypass permissions'}, {'contains': 'Bypass permissions'}]) else 1

    if args.command == 'attach-file':
        return 0 if click_alias(win, [{'description': 'Attach file'}, {'title': 'Choose Files: No file chosen'}]) else 1

    if args.command == 'share-chat':
        return 0 if click_named(win, description='Share chat') else 1

    if args.command == 'inject':
        if args.session:
            ok = click_control(win, contains=args.session, role='AXButton')
            if not ok:
                return 1
            time.sleep(1.0)
        return 0 if inject_message(win, args.text) else 1

    if args.command == 'press':
        press_key(args.key, modifiers=args.modifier)
        return 0

    return 1


if __name__ == '__main__':
    sys.exit(main())
