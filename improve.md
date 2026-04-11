# autoimprove: yeshie-test-coverage

## Change
scope: tests/unit/, tests/fixtures/
exclude: src/, packages/, node_modules/

## Check
test: npm test 2>&1
test-files: tests/unit/
run: npm test 2>&1 | grep -oP 'Tests:\s+(\d+) failed' | grep -oP '\d+' || echo "SCORE: $(npm test 2>&1 | grep -oP '(\d+) passed' | grep -oP '\d+')"
score: SCORE: {value}
goal: higher
guard: Tests:\s+(\d+) failed < 1
keep_if_equal: true
timeout: 2m

## Stop
budget: 1h
stale: 10
rounds: 30

## Agent
provider: claude
model: sonnet

## Instructions

### Priority 1: Fix the failing test
The test in tests/unit/listener.test.ts fails because it expects "claude_code" in the base listener system prompt. Either fix the system prompt to include the expected string, or update the test assertion to match reality. Prefer fixing the source if the test expectation is correct.

### Priority 2: Increase test coverage
The two largest source files have the most surface area for bugs:

**src/step-executor.ts (~680 lines)** — the core chain execution engine. Test:
- Error handling in each step type (click, type, navigate, wait, extract)
- Timeout behavior
- Chain abort/retry logic
- Edge cases: empty selectors, missing elements, stale DOM references

**src/target-resolver.ts (~258 lines)** — resolves natural language targets to CSS selectors. Test:
- Ambiguous targets that match multiple elements
- Targets with special characters
- Cache hit/miss behavior
- Fallback resolution strategies

**packages/relay/index.js (~542 lines)** — Socket.IO relay. Test:
- Connection/disconnection lifecycle
- Message routing between extension and MCP server
- Concurrent connection handling
- Malformed message handling

### What NOT to do
- Don't modify source files in src/ or packages/ — only touch test files
- Don't add new dependencies
- Don't create integration tests (those run separately)
- Don't make tests flaky or timing-dependent
- Keep total test suite runtime under 15 seconds
