#!/usr/bin/env python3
"""
permission-gate-watch.py — surface pending native macOS permission prompts
(TCC dialogs: Accessibility, Screen Recording, Automation, Microphone, Camera,
Full Disk Access, Input Monitoring, ...) into the existing Yeshie/Pulse "ask"
surface, so they don't stall work silently.

This script only OBSERVES. It never clicks, approves, denies, or writes to
TCC.db, and it never simulates consent. See classify_prompt_window() for the
detection heuristic and its documented limits.

Reuses existing infrastructure rather than inventing a new one:
  - relay's existing POST /hud/ask + GET /hud/asks queue
    (packages/relay/index.js:2034, :2090) — the same path mac-controller's
    `cc.py hud-ask` and Pulse already use for "needs a human" prompts.
  - No new server, no new storage, no new polling surface for Pulse to learn.

Usage:
  # One-shot scan, print what would be posted (no network calls):
  python3 scripts/permission-gate-watch.py scan --dry-run

  # One-shot scan, actually POST any found prompt to the relay:
  python3 scripts/permission-gate-watch.py scan --relay-url http://localhost:3333

  # Poll every N seconds (foreground; no launchd/service wiring here by design):
  python3 scripts/permission-gate-watch.py watch --interval 5 --dry-run

Known boundary (read before wiring this into anything automatic):
  Reading *window titles* via CGWindowListCopyWindowInfo requires the calling
  process to already hold Screen Recording permission on macOS 10.15+. Without
  it, kCGWindowName is silently omitted and we can only see *that* a
  TCC-prompt-hosting process (owner name) has an on-screen window — not which
  app requested access or which permission class, unless the owner process
  name itself is permission-specific (several are). This script fails open:
  with title access it reports full detail; without it, it still reports
  "a permission prompt is pending, requester/class unknown" rather than
  staying silent. See PROMPT_OWNER_HINTS below for what each owner name does
  and doesn't tell you on its own.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

# Process (CGWindowOwnerName) known to host native TCC/consent dialogs.
# permission_class is set when the owner name alone is permission-specific;
# None means "this owner hosts prompts for several permission classes — read
# the window title (if available) to disambiguate."
PROMPT_OWNER_HINTS = {
    "UserNotificationCenter": None,  # generic alert host: mic/camera/automation/etc.
    "universalAccessAuthWarn": "Accessibility",
    "tccd": None,  # the TCC daemon itself; rarely owns a visible window, kept defensively
    "SecurityAgent": "Authentication",  # admin/password prompts, not a TCC grant per se
    "CoreServicesUIAgent": "Automation",  # "X wants to control Y" AppleEvent prompts
}

# Title keyword -> permission class, used when kCGWindowName is available
# (i.e. this process already has Screen Recording permission).
TITLE_KEYWORDS = [
    ("screen recording", "Screen Recording"),
    ("record your screen", "Screen Recording"),
    ("accessibility features", "Accessibility"),
    ("control this computer", "Accessibility"),
    ("microphone", "Microphone"),
    ("camera", "Camera"),
    ("would like to access", "Automation"),
    ("wants to access", "Automation"),
    ("full disk access", "Full Disk Access"),
    ("input monitoring", "Input Monitoring"),
    ("contacts", "Contacts"),
    ("calendar", "Calendar"),
    ("photos", "Photos"),
]

RESOLUTION_GUIDANCE = {
    "Accessibility": "System Settings > Privacy & Security > Accessibility — toggle the requesting app on, then re-launch it (a stale toggle for a rebuilt/re-signed binary looks granted but isn't).",
    "Screen Recording": "System Settings > Privacy & Security > Screen Recording — toggle on, then quit and relaunch the requesting app (this permission does not take effect until the app restarts).",
    "Automation": "System Settings > Privacy & Security > Automation — expand the requesting app and enable the specific target app it's asking to control.",
    "Microphone": "System Settings > Privacy & Security > Microphone — toggle the requesting app on.",
    "Camera": "System Settings > Privacy & Security > Camera — toggle the requesting app on.",
    "Full Disk Access": "System Settings > Privacy & Security > Full Disk Access — toggle the requesting app on, then relaunch it.",
    "Input Monitoring": "System Settings > Privacy & Security > Input Monitoring — toggle the requesting app on, then relaunch it.",
    "Authentication": "This is a macOS admin/password prompt, not an app permission grant — enter credentials or Touch ID if you initiated the action; investigate if you didn't.",
    None: "Open System Settings > Privacy & Security and look for a pending toggle under the service this app is asking about; some prompts need the app relaunched after granting.",
}


def classify_prompt_window(owner_name, window_title):
    """Pure function: given one CGWindowListCopyWindowInfo entry's owner name
    and (possibly missing) title, decide whether it looks like a TCC prompt
    and, if so, what we can say about it. No side effects, no macOS APIs —
    kept separate from list_prompt_windows() so it's unit-testable without
    PyObjC or a real display.
    """
    if owner_name not in PROMPT_OWNER_HINTS:
        return None

    permission_class = PROMPT_OWNER_HINTS[owner_name]
    requester = None

    if window_title:
        lowered = window_title.lower()
        for keyword, cls in TITLE_KEYWORDS:
            if keyword in lowered:
                permission_class = cls
                break
        # Titles are typically: '"AppName" would like to access the ...'
        if '"' in window_title:
            parts = window_title.split('"')
            if len(parts) >= 2:
                requester = parts[1]

    return {
        "owner": owner_name,
        "permission_class": permission_class,
        "requester": requester,
        "window_title": window_title,
        "title_available": window_title is not None,
        "guidance": RESOLUTION_GUIDANCE.get(permission_class, RESOLUTION_GUIDANCE[None]),
    }


def format_hud_message(prompt):
    requester = prompt["requester"] or "unknown app"
    cls = prompt["permission_class"] or "unknown permission (title unavailable)"
    tag = "[MAC-PERMISSION]"
    msg = f'{tag} {requester} is blocked on a native macOS "{cls}" prompt.'
    if not prompt["title_available"]:
        msg += " (window title unreadable — this process lacks Screen Recording permission, so requester/class are best-effort from the dialog host process only.)"
    msg += f' Resolution: {prompt["guidance"]}'
    return msg


def list_prompt_windows():
    """Enumerate on-screen windows and return classify_prompt_window() results
    for any that look like a TCC prompt host. Requires PyObjC/Quartz — import
    is deferred so classify_prompt_window()/format_hud_message() stay testable
    on any Python.
    """
    try:
        import Quartz
    except ModuleNotFoundError as exc:
        missing = exc.name or "PyObjC module"
        raise SystemExit(
            f"ERROR: Missing macOS Python bridge module '{missing}'.\n"
            "Run with a Python that has PyObjC installed, e.g.:\n"
            "  /opt/homebrew/bin/python3 -m pip install pyobjc-framework-Quartz\n"
        ) from exc

    options = Quartz.kCGWindowListOptionOnScreenOnly
    window_list = Quartz.CGWindowListCopyWindowInfo(options, Quartz.kCGNullWindowID) or []

    found = []
    for w in window_list:
        owner = w.get("kCGWindowOwnerName")
        title = w.get("kCGWindowName")  # may be absent without Screen Recording permission
        classified = classify_prompt_window(owner, title)
        if classified:
            found.append(classified)
    return found


def post_hud_ask(relay_url, message, timeout_s=300):
    payload = json.dumps({"message": message, "timeout": timeout_s}).encode()
    req = urllib.request.Request(
        f"{relay_url.rstrip('/')}/hud/ask",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read())


def run_scan(relay_url, dry_run):
    prompts = list_prompt_windows()
    if not prompts:
        print("No pending macOS permission prompts detected.")
        return 0

    for prompt in prompts:
        message = format_hud_message(prompt)
        if dry_run:
            print(f"[dry-run] would POST /hud/ask: {message}")
            continue
        try:
            result = post_hud_ask(relay_url, message)
            print(f"posted hud ask {result.get('id')}: {message}")
        except urllib.error.URLError as e:
            print(f"failed to reach relay at {relay_url}: {e}", file=sys.stderr)
            return 1
    return 0


def main(argv=None):
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--relay-url", default="http://localhost:3333")
    common.add_argument("--dry-run", action="store_true", help="print instead of posting to the relay")

    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter, parents=[common]
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("scan", help="scan once and exit", parents=[common])
    watch = sub.add_parser(
        "watch", help="poll on an interval (foreground only; no service install here)", parents=[common]
    )
    watch.add_argument("--interval", type=float, default=5.0)

    args = parser.parse_args(argv)

    if args.command == "scan":
        return run_scan(args.relay_url, args.dry_run)

    if args.command == "watch":
        print(f"Watching for macOS permission prompts every {args.interval}s (Ctrl-C to stop)...")
        try:
            while True:
                run_scan(args.relay_url, args.dry_run)
                time.sleep(args.interval)
        except KeyboardInterrupt:
            return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
