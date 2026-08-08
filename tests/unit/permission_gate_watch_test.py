#!/usr/bin/env python3
"""
Unit tests for scripts/permission-gate-watch.py.

Pure-function tests only: classify_prompt_window() / format_hud_message()
take plain strings in, return plain dicts/strings out — no PyObjC, no
display, no network. Run with:

  python3 -m unittest tests/unit/permission_gate_watch_test.py -v
"""

import importlib.util
import os
import sys
import unittest

SCRIPT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "scripts", "permission-gate-watch.py"
)
spec = importlib.util.spec_from_file_location("permission_gate_watch", SCRIPT_PATH)
pgw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pgw)


class ClassifyPromptWindowTest(unittest.TestCase):
    def test_non_prompt_owner_returns_none(self):
        self.assertIsNone(pgw.classify_prompt_window("Finder", "Desktop"))
        self.assertIsNone(pgw.classify_prompt_window("Google Chrome", "New Tab"))

    def test_accessibility_owner_with_no_title(self):
        result = pgw.classify_prompt_window("universalAccessAuthWarn", None)
        self.assertIsNotNone(result)
        self.assertEqual(result["permission_class"], "Accessibility")
        self.assertIsNone(result["requester"])
        self.assertFalse(result["title_available"])

    def test_generic_owner_with_screen_recording_title(self):
        title = '"iTerm" would like to record your screen.'
        result = pgw.classify_prompt_window("UserNotificationCenter", title)
        self.assertEqual(result["permission_class"], "Screen Recording")
        self.assertEqual(result["requester"], "iTerm")
        self.assertTrue(result["title_available"])

    def test_generic_owner_with_automation_title(self):
        title = '"Yeshie" would like to access "Google Chrome".'
        result = pgw.classify_prompt_window("CoreServicesUIAgent", title)
        self.assertEqual(result["permission_class"], "Automation")
        self.assertEqual(result["requester"], "Yeshie")

    def test_owner_specific_class_survives_generic_title(self):
        # universalAccessAuthWarn is Accessibility-specific even if the title
        # doesn't contain one of our keywords.
        result = pgw.classify_prompt_window("universalAccessAuthWarn", "Some odd title")
        self.assertEqual(result["permission_class"], "Accessibility")

    def test_unknown_permission_falls_back_to_generic_guidance(self):
        result = pgw.classify_prompt_window("UserNotificationCenter", None)
        self.assertIsNone(result["permission_class"])
        self.assertEqual(result["guidance"], pgw.RESOLUTION_GUIDANCE[None])


class FormatHudMessageTest(unittest.TestCase):
    def test_full_detail_message(self):
        prompt = pgw.classify_prompt_window(
            "UserNotificationCenter", '"Terminal" would like to access the microphone.'
        )
        msg = pgw.format_hud_message(prompt)
        self.assertIn("[MAC-PERMISSION]", msg)
        self.assertIn("Terminal", msg)
        self.assertIn("Microphone", msg)
        self.assertIn("Resolution:", msg)
        self.assertNotIn("window title unreadable", msg)

    def test_degraded_message_when_title_missing(self):
        prompt = pgw.classify_prompt_window("UserNotificationCenter", None)
        msg = pgw.format_hud_message(prompt)
        self.assertIn("unknown app", msg)
        self.assertIn("window title unreadable", msg)

    def test_never_implies_auto_resolution(self):
        # The script must never claim *it* resolved anything - only ever
        # describe what a human needs to do.
        for owner in pgw.PROMPT_OWNER_HINTS:
            prompt = pgw.classify_prompt_window(owner, None)
            msg = pgw.format_hud_message(prompt)
            for phrase in ("i approved", "i granted", "i clicked", "auto-approved", "auto-granted"):
                self.assertNotIn(phrase, msg.lower())


class RunScanDryRunTest(unittest.TestCase):
    def test_dry_run_never_calls_post_hud_ask(self):
        calls = []
        pgw.post_hud_ask = lambda *a, **k: calls.append((a, k)) or {"id": "should-not-happen"}
        pgw.list_prompt_windows = lambda: [
            pgw.classify_prompt_window("universalAccessAuthWarn", None)
        ]
        rc = pgw.run_scan("http://localhost:3333", dry_run=True)
        self.assertEqual(rc, 0)
        self.assertEqual(calls, [])

    def test_no_prompts_is_a_clean_exit(self):
        pgw.list_prompt_windows = lambda: []
        rc = pgw.run_scan("http://localhost:3333", dry_run=True)
        self.assertEqual(rc, 0)


if __name__ == "__main__":
    unittest.main()
