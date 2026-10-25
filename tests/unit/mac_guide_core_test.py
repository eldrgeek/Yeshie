#!/usr/bin/env python3
"""
Unit tests for scripts/mac_guide_core.py: guide checks, AX matching, doneWhen
and tooltip placement over plain dicts, so they run without macOS. Run with:

  python3 -m unittest tests/unit/mac_guide_core_test.py -v
"""

import glob
import json
import os
import sys
import tempfile
import time
import unittest

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
import mac_guide_core as core  # noqa: E402


def node(role, kids=(), frame=(10, 10, 50, 20), **attrs):
    return {'role': role, 'frame': frame, 'kids': list(kids), **attrs}


ATTRS = lambda n: n  # noqa: E731
KIDS = lambda n: n['kids']  # noqa: E731

WINDOW = node('AXWindow', title='Accessibility', frame=(0, 0, 1000, 800), kids=[
    node('AXGroup', identifier='list', kids=[
        node('AXStaticText', value='Terminal'),
        node('AXCheckBox', description='Terminal', value=0, frame=(300, 200, 40, 22)),
        node('AXCheckBox', description='iTerm', value=1),
    ]),
    node('AXButton', title='Add', description='add'),
    node('AXButton', title='Hidden', frame=(0, 0, 0, 0)),
])


class Probe:
    def __init__(self, root=WINDOW, titles=('Accessibility',)):
        self.root, self.titles = root, list(titles)

    def find(self, m):
        return core.find([self.root], m, ATTRS, KIDS)

    def value(self, n):
        return n.get('value')

    def window_titles(self):
        return self.titles

    def text(self):
        return core.collect_text([self.root], ATTRS, KIDS)

    def frontmost(self):
        return ('com.apple.systempreferences', 'System Settings')

    def running(self, spec):
        return spec == 'System Settings'

    def shell(self, cmd):
        return cmd == 'true'


class MatchTest(unittest.TestCase):
    def test_role_and_text(self):
        hit = core.find([WINDOW], {'role': 'AXCheckBox', 'text': 'terminal'}, ATTRS, KIDS)
        self.assertEqual(hit['frame'], (300, 200, 40, 22))

    def test_exact(self):
        self.assertIsNone(core.find([WINDOW], {'title': 'ad', 'exact': True}, ATTRS, KIDS))
        self.assertIsNotNone(core.find([WINDOW], {'title': 'add', 'exact': True}, ATTRS, KIDS))

    def test_fallback_list_and_index(self):
        hit = core.find([WINDOW], [{'role': 'AXSlider'}, {'role': 'AXCheckBox', 'index': 1}], ATTRS, KIDS)
        self.assertEqual(hit['description'], 'iTerm')

    def test_within(self):
        m = {'role': 'AXCheckBox', 'within': {'identifier': 'list'}}
        self.assertIsNotNone(core.find([WINDOW], m, ATTRS, KIDS))
        m['within'] = {'identifier': 'nope'}
        self.assertIsNone(core.find([WINDOW], m, ATTRS, KIDS))

    def test_match_case(self):
        root = node('AXWindow', frame=(0, 0, 1000, 800), kids=[
            node('AXCheckBox', identifier='claude_Toggle', frame=(10, 10, 36, 16)),
            node('AXCheckBox', identifier='Claude_Toggle', frame=(10, 50, 36, 16)),
        ])
        m = {'identifier': 'Claude_Toggle', 'exact': True}
        self.assertEqual(core.find([root], m, ATTRS, KIDS)['frame'][1], 10)
        m['matchCase'] = True
        self.assertEqual(core.find([root], m, ATTRS, KIDS)['frame'][1], 50)

    def test_rows_scrolled_out_of_view_skipped(self):
        root = node('AXWindow', frame=(0, 0, 1000, 800), kids=[
            node('AXScrollArea', frame=(0, 100, 500, 600), kids=[
                node('AXCheckBox', identifier='Zoom_Toggle', frame=(400, 760, 36, 16)),
                node('AXCheckBox', identifier='Omi_Toggle', frame=(400, 300, 36, 16)),
            ]),
        ])
        self.assertIsNone(core.find([root], {'identifier': 'Zoom_Toggle'}, ATTRS, KIDS))
        self.assertIsNotNone(core.find([root], {'identifier': 'Omi_Toggle'}, ATTRS, KIDS))
        self.assertIsNotNone(core.find([root], {'identifier': 'Zoom_Toggle'}, ATTRS, KIDS, visible_only=False))

    def test_invisible_nodes_skipped(self):
        self.assertIsNone(core.find([WINDOW], {'title': 'Hidden'}, ATTRS, KIDS))

    def test_value_numbers_and_bools(self):
        self.assertTrue(core.node_matches({'value': True}, {'value': '1', 'exact': True}))
        self.assertTrue(core.node_matches({'value': 1}, {'value': '1'}))


class DoneTest(unittest.TestCase):
    def test_value_equals(self):
        done = {'valueEquals': {'target': {'role': 'AXCheckBox', 'text': 'Terminal'}, 'value': 1}}
        self.assertFalse(core.is_step_done(done, core.StepWatch(), Probe()))
        done['valueEquals']['target']['text'] = 'iTerm'
        self.assertTrue(core.is_step_done(done, core.StepWatch(), Probe()))

    def test_element_gone_needs_seen_first(self):
        done = {'elementGone': {'title': 'Add'}}
        watch = core.StepWatch()
        empty = node('AXWindow')
        self.assertFalse(core.is_step_done(done, watch, Probe(empty)))
        self.assertFalse(core.is_step_done(done, watch, Probe()))
        self.assertTrue(core.is_step_done(done, watch, Probe(empty)))

    def test_window_gone_and_appears(self):
        watch = core.StepWatch()
        self.assertFalse(core.is_step_done({'windowGone': 'access'}, watch, Probe()))
        self.assertTrue(core.is_step_done({'windowGone': 'access'}, watch, Probe(titles=[])))
        self.assertTrue(core.is_step_done({'windowAppears': 'ACCESS'}, core.StepWatch(), Probe()))

    def test_text_app_shell(self):
        w = core.StepWatch()
        self.assertTrue(core.is_step_done({'textAppears': 'ITERM'}, w, Probe()))
        self.assertTrue(core.is_step_done({'appFrontmost': 'System Settings'}, w, Probe()))
        self.assertTrue(core.is_step_done({'appQuit': 'Mail'}, w, Probe()))
        self.assertTrue(core.is_step_done({'shell': 'true'}, core.StepWatch(), Probe()))
        self.assertFalse(core.is_step_done({'shell': 'false'}, core.StepWatch(), Probe()))

    def test_file_appears_only_after_step_start(self):
        with tempfile.TemporaryDirectory() as d:
            old = os.path.join(d, 'old.zip')
            open(old, 'w').close()
            os.utime(old, (time.time() - 100, time.time() - 100))
            watch = core.StepWatch()
            pattern = os.path.join(d, '*.zip')
            self.assertFalse(core.is_step_done({'fileAppears': pattern}, watch, Probe()))
            open(os.path.join(d, 'new.zip'), 'w').close()
            self.assertTrue(core.is_step_done({'fileAppears': pattern}, watch, Probe()))


class GuideFileTest(unittest.TestCase):
    def ok(self, **over):
        g = {'app': 'TextEdit', 'steps': [{'instruction': 'Do it', 'target': {'title': 'x'},
                                           'doneWhen': {'windowAppears': 'y'}}]}
        g.update(over)
        return g

    def test_valid(self):
        core.check_guide(self.ok())

    def test_rejects(self):
        bad = [
            self.ok(app=None),
            self.ok(steps=[]),
            self.ok(steps=[{'instruction': 'x', 'target': {'title': 'x'}}]),  # last step lacks doneWhen
            self.ok(steps=[{'instruction': 'x', 'doneWhen': {'urlIncludes': 'y'}}]),
            self.ok(steps=[{'instruction': 'x', 'target': {'css': 'y'}, 'doneWhen': {'windowAppears': 'y'}}]),
            self.ok(steps=[{'instruction': 'x' * 501, 'doneWhen': {'windowAppears': 'y'}}]),
        ]
        for g in bad:
            with self.assertRaises(core.GuideError):
                core.check_guide(g)

    def test_vars(self):
        self.assertEqual(core.fill_vars('a {{ app }} "{{x}}"', {'app': 'T', 'x': 'q"'}), 'a T "q\\""')
        with self.assertRaises(core.GuideError):
            core.fill_vars('{{missing}}', {})

    def test_repo_guides_are_valid(self):
        files = glob.glob(os.path.join(ROOT, 'apps', '*', 'guides', '*.guide.json'))
        self.assertTrue(files)
        for f in files:
            with open(f) as fh:
                names = set(__import__('re').findall(r'\{\{\s*(\w+)\s*\}\}', fh.read()))
            core.load_guide(f, {n: 'Terminal' for n in names})


class GeometryTest(unittest.TestCase):
    def test_ax_to_cocoa(self):
        self.assertEqual(core.ax_to_cocoa((10, 100, 50, 20), 1000), (10, 880, 50, 20))

    def test_place_below_then_above(self):
        screen = (0, 0, 1000, 800)
        x, y = core.place_tooltip((400, 500, 100, 30), (300, 100), screen)
        self.assertEqual(y, 500 - 12 - 100)
        x, y = core.place_tooltip((400, 50, 100, 30), (300, 100), screen)
        self.assertEqual(y, 50 + 30 + 12)

    def test_place_no_target_and_clamp(self):
        self.assertEqual(core.place_tooltip(None, (300, 100), (0, 0, 1000, 800)), (350, 620))
        x, y = core.place_tooltip((0, 0, 1000, 800), (300, 100), (0, 0, 1000, 800))
        self.assertTrue(0 <= x <= 700 and 0 <= y <= 700)


class ResultTest(unittest.TestCase):
    def test_round_trip(self):
        with tempfile.TemporaryDirectory() as d:
            os.environ['YESHIE_MAC_GUIDE_DIR'] = d
            core.write_result('g1', {'status': 'active'})
            self.assertEqual(core.read_result('g1'), {'status': 'active'})
            self.assertIsNone(core.read_result('nope'))
            self.assertTrue(core.pid_alive(os.getpid()))


if __name__ == '__main__':
    unittest.main()
