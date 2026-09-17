#!/usr/bin/env python3
"""chrome-split.py — turn two Chrome tabs into a native Split View.

Chrome 153 has no extension API or DevTools Protocol command that creates a
split view (chrome.tabs.createSplit is documented as "Pending"). Chrome's tab
context menu does have one: "New Split View with Current Tab". It pairs the
tab you right-click with the window's active tab. This script opens that menu
through macOS Accessibility (the AXShowMenu action on the tab button, so the
mouse does not move) and presses the item.

Usage:
    chrome-split.py '{"titles": [...], "activeIndex": 3, "targetIndex": 7}'

    titles       every tab title in the window, in tab-strip order. It is the
                 fingerprint that picks the right Chrome window, because a
                 window's Accessibility title is only its active tab's title.
    activeIndex  index of the active tab (the left half of the split).
    targetIndex  index of the tab to right-click (the right half).

Prints one JSON object. Exit 0 when the menu item was pressed, 1 otherwise.
The caller (the Yeshie extension) confirms the split by reading splitViewId.

Written 2026-09-17 by Claude (Opus 5) with Mike Wolf, from his "Make split"
side-panel design.
"""
from __future__ import annotations

import json
import re
import sys
import time

CHROME_BUNDLE = "com.google.Chrome"
MENU_TIMEOUT_S = 2.0

# Chrome appends status to a tab button's Accessibility title, for example
# "Docs - Memory usage - 182 MB", "Docs - Inactive tab - 103 MB freed up",
# "Docs - Left view - ...". The tab's own title is always the prefix.


def title_matches(ax_title: str | None, tab_title: str | None) -> bool:
    ax = (ax_title or "").strip()
    tab = (tab_title or "").strip()
    if not tab:
        # Chrome shows the URL for an untitled tab; the extension cannot know
        # that exact text, so an empty title matches anything.
        return True
    return ax == tab or ax.startswith(tab + " - ")


def window_score(ax_titles: list[str], tab_titles: list[str]) -> bool:
    """True when a window's tab strip matches the extension's tab list exactly."""
    if len(ax_titles) != len(tab_titles):
        return False
    return all(title_matches(a, t) for a, t in zip(ax_titles, tab_titles))


SPLIT_ITEM = re.compile(r"^(New|Add).*split view", re.IGNORECASE)


def is_split_item(title: str | None) -> bool:
    return bool(title) and bool(SPLIT_ITEM.search(title or ""))


def validate(req: dict) -> str | None:
    titles = req.get("titles")
    if not isinstance(titles, list) or not titles or not all(isinstance(t, str) for t in titles):
        return "titles must be a non-empty list of strings"
    for key in ("activeIndex", "targetIndex"):
        v = req.get(key)
        if not isinstance(v, int) or isinstance(v, bool) or not 0 <= v < len(titles):
            return f"{key} must be an index into titles"
    if req["activeIndex"] == req["targetIndex"]:
        return "activeIndex and targetIndex must differ"
    return None


# ── Accessibility side (macOS only; imported lazily so tests run anywhere) ────

def run(req: dict) -> dict:
    from ApplicationServices import (  # type: ignore
        AXUIElementCopyAttributeValue,
        AXUIElementCreateApplication,
        AXUIElementPerformAction,
    )
    from AppKit import NSWorkspace  # type: ignore

    def attr(el, name):
        err, val = AXUIElementCopyAttributeValue(el, name, None)
        return val if err == 0 else None

    def collect(el, want, stop, depth=0, out=None):
        out = [] if out is None else out
        if depth > 20 or stop(el):
            return out
        if want(el):
            out.append(el)
            return out
        for child in attr(el, "AXChildren") or []:
            collect(child, want, stop, depth + 1, out)
        return out

    apps = [a for a in NSWorkspace.sharedWorkspace().runningApplications()
            if a.bundleIdentifier() == CHROME_BUNDLE]
    if not apps:
        return {"ok": False, "error": "Google Chrome is not running"}

    titles = req["titles"]
    for chrome in apps:
        app = AXUIElementCreateApplication(chrome.processIdentifier())
        windows = attr(app, "AXWindows")
        if windows is None:
            return {"ok": False, "error": "Accessibility access denied for the relay's process (System Settings > Privacy & Security > Accessibility)"}
        for win in windows:
            tabs = collect(win, lambda e: attr(e, "AXSubrole") == "AXTabButton", lambda e: False)
            ax_titles = [attr(t, "AXTitle") or "" for t in tabs]
            if not window_score(ax_titles, titles):
                continue
            target = tabs[req["targetIndex"]]
            AXUIElementPerformAction(target, "AXShowMenu")  # returns -25204 even when the menu opens
            deadline = time.time() + MENU_TIMEOUT_S
            seen: list[str] = []
            while time.time() < deadline:
                menus = collect(app, lambda e: attr(e, "AXRole") == "AXMenu",
                                lambda e: attr(e, "AXRole") == "AXMenuBar")
                for menu in menus:
                    items = attr(menu, "AXChildren") or []
                    seen = [attr(i, "AXTitle") or "" for i in items]
                    for item in items:
                        if is_split_item(attr(item, "AXTitle")):
                            err = AXUIElementPerformAction(item, "AXPress")
                            return {"ok": err == 0, "pressed": attr(item, "AXTitle"), "axError": err}
                    if seen:
                        AXUIElementPerformAction(menu, "AXCancel")
                        return {"ok": False, "error": "tab menu has no split-view item", "menu": [s for s in seen if s]}
                time.sleep(0.05)
            return {"ok": False, "error": "tab menu did not open"}
    return {"ok": False, "error": "no Chrome window has exactly these tabs (a collapsed tab group hides tabs from Accessibility)"}


def main(argv: list[str]) -> int:
    try:
        req = json.loads(argv[1]) if len(argv) > 1 else {}
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "error": f"bad JSON: {e}"}))
        return 1
    problem = validate(req if isinstance(req, dict) else {})
    if problem:
        print(json.dumps({"ok": False, "error": problem}))
        return 1
    result = run(req)
    print(json.dumps(result))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
