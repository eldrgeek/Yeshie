# Autoloop Command: `autoloop-finalize`

Use the local `autoloop` CLI as the source of truth for this workflow action.

These installed names are agent wrappers, not native `autoloop` CLI subcommands. A wrapper may call multiple `autoloop` commands and edit normal project files under the hood.

## Required action

1. Work from the current workspace root.
2. Use `autoloop` commands, preferring `--json` when structured output is needed.
3. Return important CLI output faithfully.
4. Do not manually edit `.autoloop/state.json`, `.autoloop/last_eval.json`, or `.autoloop/experiments.jsonl`.
5. If the `autoloop` executable is unavailable, stop and tell the user to install or build it.

## Shared contract reference

# Shared Action: `autoloop-finalize`

Create clean review branches from committed kept experiments.

## Inputs

- Current workspace root
- Optional session or all-history scope

## Behavior

1. Confirm the working tree is clean before finalizing.
2. Run `autoloop finalize`, using `--json` when structured output is useful.
3. Present the created review branches and any skipped experiments.
4. If experiments were skipped because they were kept without `--commit`, say so plainly and recommend rerunning future keeps with commits enabled.

## Rules

- Do not manually build review branches outside the CLI when autoloop can do it.
- Treat skipped experiments as a workflow gap, not as silent success.

