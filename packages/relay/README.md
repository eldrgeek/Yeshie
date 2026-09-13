# Relay

## Attribution

`POST /run` and `POST /run/async` accept optional requester-attribution headers:

- `traceparent`: W3C trace context header (`00-<32hex>-<16hex>-<2hex>`). Malformed values are ignored.
- `x-agent-program`: calling agent program (for example, `cursor`).
- `x-agent-seat`: seat or worker identity.
- `x-agent-task`: task identifier.
- `x-on-behalf-of`: principal/user the caller is acting for.

Each run request writes a `run_requested` entry to `logs/conversations/<date>.jsonl` including:

- request IDs (`jobId`, `commandId`), route, trace/span, requester fields
- recipe identity (`site`, `recipe`) derived from payload metadata
- `param_names` only (never parameter values)

If no valid `traceparent` is provided, the relay logs `requester: "unattributed"`.
