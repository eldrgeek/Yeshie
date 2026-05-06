"""
Step 3 of the loop: from theory.md, pick the top-ranked skill candidate and
emit a Yeshie payload JSON for it.

The payload schema matches sites/<app>/tasks/*.payload.json:
  - _meta (task, description, requiredParams, params, prerequisite, auth, verificationStrategy)
  - runId, mode, site, params (template), abstractTargets, chain, branches, stateGraph

We ALSO emit a sibling test cases file so the executor (step 4) has fixtures to run.

Cheap-model note: this stage is still Sonnet — proposing a structurally correct
payload from a theory + the schema requires reasoning. Once a payload exists
and is being executed, in-loop decisions (which selector candidate matches?
what does the snackbar say?) can be Haiku/Flash.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

from llm import call_claude

LEARN_ROOT = Path(__file__).resolve().parent
REPO_ROOT = LEARN_ROOT.parent

PROPOSE_PROMPT = """You are generating the FIRST automation skill (Yeshie payload JSON) for the application "{display_name}", based on the theory document below.

Pick the highest-leverage skill candidate from §11 of the theory ("Skill Candidates — RANKED"). Use the top one unless its prerequisite is missing — in which case use the prerequisite. State which one you chose and why in the JSON `_meta.proposalRationale` field.

Output a single JSON object that conforms to Yeshie's payload schema. Reference example (a real production payload from this same repo):

```json
{example_payload}
```

Schema rules (MUST follow):
1. Top-level keys: `_meta`, `runId`, `mode`, `site`, `params`, `abstractTargets`, `chain`, `branches`, `stateGraph`.
2. `_meta` includes: task, description, requiredParams (array), params (object with description/required/hint per param), auth, verificationStrategy, proposalRationale (your justification for picking this skill).
3. `chain` is an array of step objects. Each step has stepId, action, plus action-specific fields. Action types you may use: `navigate`, `wait_for`, `assess_state`, `type`, `click`, `click_preset`, `read`, `js`. Use `guard` for state checks before acting. Use `responseSignature` and `failureSignature` after submit-style clicks.
4. `abstractTargets` is a registry of named UI targets. Each has a `match` block (role, vuetify_label, name_contains, etc.) and may have `cachedSelector: null` (UNKNOWN — the executor will resolve at runtime), plus `cachedConfidence: 0` for unverified targets.
5. `stateGraph` reuses node names from the theory's §7 where possible.
6. ALWAYS include a home-bookend pattern: navigate to home at start (h0/h0b/h0c) and end (hZ/hZb/hZc) so verification can compare before/after.
7. For UNKNOWN selectors, set `cachedSelector: null`, `cachedConfidence: 0.0`, and provide good `match` heuristics (role, name_contains) so the live executor can resolve. Do not hallucinate selectors.
8. Mark this proposal `mode: "exploratory"` (NOT "verification" or "production") because it has not been validated.

Also emit a parallel JSON object — test cases — under a top-level `_tests` key INSIDE the payload, like:
```json
"_tests": [
  {{"name": "happy-path", "params": {{ ... }}, "expect": "success"}},
  {{"name": "missing-required-param", "params": {{ ... }}, "expect": "validation-error"}}
]
```
The executor will iterate these.

Output ONLY the JSON object. No prose, no fence (or use a single ```json fence only if you must).

=========== THEORY ===========
{theory}
=========== END THEORY ===========
"""


def load_example_payload() -> str:
    candidate = REPO_ROOT / "sites" / "yeshid" / "tasks" / "01-user-add.payload.json"
    if candidate.exists():
        return candidate.read_text()
    return "{}"


def extract_json(text: str) -> dict:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*\n(.*?)\n```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    return json.loads(text)


def propose(app: str) -> Path:
    cfg = yaml.safe_load((LEARN_ROOT / "apps" / f"{app}.yaml").read_text())
    theory_path = LEARN_ROOT / app / "theory.md"
    if not theory_path.exists():
        raise FileNotFoundError(f"Run theorize first — no {theory_path}")

    theory = theory_path.read_text()
    example = load_example_payload()

    prompt = PROPOSE_PROMPT.format(
        display_name=cfg["display_name"],
        theory=theory,
        example_payload=example[:12000],
    )

    print(f"  calling claude -p (sonnet) for skill proposal ...")
    output = call_claude(prompt, model="sonnet", timeout=900)

    skills_dir = LEARN_ROOT / app / "skills"
    skills_dir.mkdir(parents=True, exist_ok=True)

    raw_path = skills_dir / "_proposed_raw.txt"
    raw_path.write_text(output)

    try:
        payload = extract_json(output)
    except Exception as e:
        print(f"  WARN: could not parse JSON ({e}); raw output saved to {raw_path}")
        return raw_path

    task_name = payload.get("_meta", {}).get("task", "proposed-skill")
    skill_path = skills_dir / f"00-{task_name}.payload.json"
    skill_path.write_text(json.dumps(payload, indent=2))
    print(f"  wrote {skill_path}")
    return skill_path


if __name__ == "__main__":
    app = sys.argv[1] if len(sys.argv) > 1 else "yeshid"
    propose(app)
