# Task A: Schema Validation and Instructions Loader

## Summary
Add JSON schema validation to the Tab page script loader to ensure all instruction files follow `llm-reply-schema.json`. Refuse to execute scripts that fail validation and display a helpful error toast.

## Acceptance Criteria
- [ ] Instructions are validated before execution.
- [ ] Invalid instructions stop execution and show an error message.
- [ ] Existing instruction files conform to the schema or are corrected.

## Implementation Notes
- Use a lightweight JSON schema validator in the Tab page (e.g., Ajv).
- Integrate validation into the auto-run logic before iterating over tasks.
- Provide descriptive errors in `results.json` when validation fails.
