# Autoloop Command: `autoloop-status`

Use the local `autoloop` CLI as the source of truth for this workflow action.

These installed names are agent wrappers, not native `autoloop` CLI subcommands. A wrapper may call multiple `autoloop` commands and edit normal project files under the hood.

## Required action

1. Work from the current workspace root.
2. Use `autoloop` commands, preferring `--json` when structured output is needed.
3. Return important CLI output faithfully.
4. Do not manually edit `.autoloop/state.json`, `.autoloop/last_eval.json`, or `.autoloop/experiments.jsonl`.
5. If the `autoloop` executable is unavailable, stop and tell the user to install or build it.

## Shared contract reference

# Shared Action: `autoloop-status`

Inspect the current autoloop state and summarize it for the user.

## Inputs

- Current workspace root
- Optional request for current-session scope or all-history scope

## Behavior

1. Run `autoloop status`, using `--json` when structured output is useful.
2. Explain the most important current state:
   - active session
   - baseline presence
   - pending eval
   - kept/discarded/crashed counts
   - current streak and best improvement
3. If there is a pending eval, tell the user whether the next action is effectively keep or discard.

## Rules

- Do not mutate autoloop state from this action.

