---
title: E2E Testing Framework Documentation
last_updated: 2024-03-19
author: Claude 3.5 Sonnet
category: testing
priority: 1
status: current
dependencies:
  - file: tests/e2e/command_execution/test_minimal.py
    sha: current
    last_verified: 2024-03-19
  - file: tests/e2e/requirements.txt
    sha: current
    last_verified: 2024-03-19
  - file: extension/build/chrome-mv3-dev
    sha: current
    last_verified: 2024-03-19
related_notes: []
---

# Yeshie E2E Testing Framework Documentation

**Last Updated**: March 19, 2024
**Author**: Claude 3.5 Sonnet

## Overview
This document describes the end-to-end (E2E) testing framework for the Yeshie Chrome extension. The framework uses Playwright with Python to automate browser interactions and verify the extension's functionality.

## Source Files Referenced
- `tests/e2e/command_execution/test_minimal.py` - Main test file
- `tests/e2e/requirements.txt` - Test dependencies
- `extension/build/chrome-mv3-dev` - Built extension directory

## Test Architecture

### Technology Stack
- **Playwright**: Browser automation framework
- **pytest**: Test runner and framework
- **pytest-asyncio**: Async support for pytest
- **Python 3.11**: Programming language

### Test Structure
The framework uses a single, comprehensive test file that verifies the core functionality of the Yeshie extension. This approach was chosen for simplicity and reliability after iterating through several more complex approaches.

### Key Components Tested
1. Extension Loading
   - Proper loading in Chrome
   - Visibility of extension icon

2. Local Development Environment
   - Navigation to localhost:3000
   - Verification of editor functionality
   - Slider interaction

3. GitHub Integration
   - Extension functionality on github.com
   - Icon visibility and interaction

## Running the Tests

### Prerequisites
1. Chrome browser installed
2. Python virtual environment with requirements installed
3. Extension built in `extension/build/chrome-mv3-dev`
4. Vite development server running for localhost testing

### Command to Run Tests
```bash
PYTHONPATH=. pytest -s tests/e2e/command_execution/test_minimal.py -v
```

### Test Flow
1. Kills existing Chrome instances
2. Launches Chrome with debugging enabled
3. Connects to Chrome via DevTools Protocol
4. Executes test sequence
5. Captures screenshots on failure
6. Cleans up browser instances

## Error Handling
- Retry mechanism for element selection
- Screenshot capture on failure
- Proper cleanup in both success and failure cases
- Increased timeouts for network-dependent operations

## Known Behaviors
- TensorFlow Lite messages in console (can be ignored)
- GPU process and network service messages (don't affect functionality)
- Chrome DevTools Protocol connection messages

## Future Improvements
1. Add more granular tests for specific features
2. Implement parallel test execution
3. Add CI/CD integration
4. Expand GitHub interaction testing

## Maintenance Notes
- Keep selectors updated if UI changes
- Monitor Chrome DevTools Protocol compatibility
- Update timeouts if needed based on performance

## Document History
- 2024-03-19: Initial creation and verification of testing framework

---

## Document Metadata
- **Last Updated**: March 19, 2024
- **Sources Used**:
  1. `tests/e2e/command_execution/test_minimal.py` (SHA: current)
  2. `tests/e2e/requirements.txt` (SHA: current)
  3. Live test execution results
  4. Chrome DevTools Protocol documentation
  5. Playwright Python documentation 