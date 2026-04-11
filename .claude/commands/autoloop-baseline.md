# Autoloop Command: `autoloop-baseline`

Use the local `autoloop` CLI as the source of truth for this workflow action.

These installed names are agent wrappers, not native `autoloop` CLI subcommands. A wrapper may call multiple `autoloop` commands and edit normal project files under the hood.

## Required action

1. Work from the current workspace root.
2. Use `autoloop` commands, preferring `--json` when structured output is needed.
3. Return important CLI output faithfully.
4. Do not manually edit `.autoloop/state.json`, `.autoloop/last_eval.json`, or `.autoloop/experiments.jsonl`.
5. If the `autoloop` executable is unavailable, stop and tell the user to install or build it.

## Shared contract reference

# Shared Action: `autoloop-baseline`

Record a baseline metric once autoloop is configured.

## Inputs

- Current workspace root
- `.autoloop/config.toml`

## Behavior

1. Confirm autoloop is initialized.
2. Run `autoloop doctor --json` before baselining.
3. If doctor reports an unhealthy config and a verified repair is available, run `autoloop doctor --fix --json`.
4. Only continue when doctor reports a healthy config.
5. Run `autoloop baseline`.
6. If baseline fails because parsing or formatting is obviously wrong, rerun `autoloop doctor --json`, apply `--fix` when safe, and retry baseline once.
7. Return the CLI output faithfully, including the recorded metric.
8. If baseline still fails and the next correction is not obvious, ask one short blocking question.

## Rules

- Prefer a deterministic baseline over a noisy or flaky one.
- Do not continue into autonomous looping until baseline succeeds.
- Do not treat a failed baseline as acceptable setup completion.
- Do not skip doctor when the config is new, inferred, or recently repaired.

