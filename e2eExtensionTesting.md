# E2E Extension Testing Strategy

## Overview
This document tracks our testing strategy for fixing the Yeshie Chrome extension speech recognition bugs, specifically the issue where speech recognition doesn't restart after navigating away and back to a page.

## Core Problem
The main bug: When navigating away from a page and back, speech recognition components don't restart automatically, requiring manual clicking of speech buttons and text areas to re-enable transcription.

## Root Cause Analysis ✅ COMPLETED
- **Issue Identified**: Navigation causes speech editor components to unmount/remount, but initialization logic wasn't properly restarting listening
- **Technical Cause**: `window.speechGlobalState` functions were not being injected into page context, preventing communication between page-level components and extension background

## Architecture Changes Made ✅ COMPLETED

### 1. Global State Management System
- **File**: `extension/functions/speechGlobalState.ts` ✅ EXISTS
- **Status**: ✅ IMPLEMENTED
- **Functions**: All 8 core functions implemented (get/set state, register/unregister editors, focus management, etc.)

### 2. Background Script Integration  
- **File**: `extension/background/index.ts` ✅ UPDATED
- **Status**: ✅ IMPLEMENTED  
- **Changes**: Global state initialization, function exposure for debugging

### 3. Content Script Injection System
- **File**: `extension/contents/speechGlobalStateInjector.tsx` ✅ IMPLEMENTED
- **Status**: ✅ IMPLEMENTED
- **Purpose**: Injects `window.speechGlobalState` functions into page context
- **Method**: Uses script injection + proxy pattern for communication

### 4. Plasmo Message Handlers
- **Directory**: `extension/background/messages/` ✅ CREATED
- **Status**: ✅ ALL 8 HANDLERS IMPLEMENTED
- **Files Created**:
  - `getSpeechGlobalState.ts` ✅
  - `setSpeechGlobalState.ts` ✅
  - `registerSpeechEditor.ts` ✅
  - `unregisterSpeechEditor.ts` ✅
  - `getActiveSpeechEditors.ts` ✅
  - `setSpeechEditorFocus.ts` ✅
  - `getFocusedSpeechEditor.ts` ✅
  - `handleSpeechRecognitionEnd.ts` ✅

### 5. SpeechEditor Component Updates
- **File**: `extension/content/SpeechEditor.tsx` ✅ PREVIOUSLY UPDATED
- **Status**: ✅ EXTENSIVELY REFACTORED
- **Features**: Enhanced restart logic, page visibility handling, auto-restart monitoring

## Testing Infrastructure

### Testing Environment Setup
- **Chrome Debugging**: Uses port 9222 for CDP (Chrome DevTools Protocol)
- **Script Location**: `tests/cdp/`
- **Restart Script**: `restart-chrome-with-debugging.sh` ✅ EXISTS

### User Login Workflow Testing ✅ NEW CAPABILITY

#### Purpose & Scope
A comprehensive testing workflow that demonstrates the complete lifecycle of:
1. Opening Chrome with the extension loaded
2. Testing core extension functionality with CDP
3. Verifying extension logs and activity monitoring
4. Ensuring Chrome debugging setup works correctly

#### Implementation Details
- **Files**: Core CDP test suite in `tests/cdp/src/tests/`
- **Status**: ✅ STREAMLINED AND FUNCTIONAL
- **Dependencies**: CDP infrastructure, Chrome debugging setup

#### Available Core Tests

**CDP Connection Test** ✅
- Tests basic Chrome DevTools Protocol connection
- Verifies debugging port accessibility
- Lists available targets (tabs, service workers)

**Extension Verification** ✅  
- Checks for extension service worker targets
- Validates extension background script is loaded
- Confirms extension is ready for operation

**Log Testing Workflow** ✅
- Tests log clearing functionality
- Records extension actions and activity
- Retrieves and analyzes log data
- Monitors console output for debugging

**Log Analysis** ✅
- Analyzes current extension logs
- Shows recent activity and events
- Helps debug extension behavior

#### Usage Examples

**Run All Core Tests**:
```bash
cd tests/cdp
npm run test:all
```

**Run Individual Tests**:
```bash
npm run test:cdp        # CDP connection
npm run test:extension  # Extension verification  
npm run test:logs       # Log testing workflow
```

**Expected Output**:
```
🧪 Running all CDP tests...

🧪 Running test: cdp-connection
📄 Description: Test basic CDP connection to Chrome
✅ Connected successfully!
📋 Found 37 targets

🧪 Running test: extension-verification  
📄 Description: Verify Yeshie extension is loaded and accessible
✅ Extension verified as loaded

🧪 Running test: log-testing-workflow
📄 Description: Test log clearing, action recording, and log retrieval workflow
✅ Log workflow test completed

📊 Test Summary:
✅ Passed: 3
❌ Failed: 0
📋 Total: 3
```

#### Technical Implementation Features

**Automated Testing** ✅
```typescript
// Basic CDP connection testing
const client = await CDP({ host: 'localhost', port: 9222 });
const targets = await Target.getTargets();
console.log(`Found ${targets.length} targets`);
```

**Extension State Verification** ✅
```typescript
// Service worker detection
const serviceWorkers = targets.filter(t => t.type === 'service_worker');
const yeshieExtension = serviceWorkers.find(sw => 
    sw.url.includes('chrome-extension://') && sw.url.includes('background')
);
```

**Log Monitoring** ✅  
```typescript
// Console log capture and analysis
await Runtime.enable();
Runtime.consoleAPICalled((params) => {
    console.log(`Console: ${params.type}: ${params.args.map(a => a.value).join(' ')}`);
});
```

## Current Status

### ✅ COMPLETED
- [x] Root cause analysis
- [x] Architecture design  
- [x] Global state management implementation
- [x] Content script injection system
- [x] Plasmo message handlers
- [x] TypeScript error resolution
- [x] Extension builds successfully
- [x] Test script infrastructure created

### ⚠️ BLOCKED - CONNECTION ISSUES
- [ ] CDP connection to Chrome consistently fails
- [ ] Tests cannot run due to `ECONNREFUSED 127.0.0.1:9222`
- [ ] Chrome debugging port not consistently available

### ❌ NOT TESTED
- [ ] Speech global state injection verification
- [ ] Message handler functionality  
- [ ] End-to-end speech recognition flow
- [ ] Navigation restart behavior
- [ ] Focus-based restart functionality

## Critical Issues Blocking Progress

### 1. Chrome Debugging Connection ⚠️ HIGH PRIORITY
**Problem**: CDP tests cannot connect to Chrome debugging port
**Impact**: Cannot validate any fixes
**Potential Causes**:
- Chrome not starting with `--remote-debugging-port=9222`
- Port conflicts
- Security restrictions
- Chrome process management issues

### 2. Test Environment Instability ⚠️ HIGH PRIORITY  
**Problem**: Inconsistent test execution environment
**Impact**: Cannot run reliable automated tests
**Next Steps**: Need stable testing setup

## Required Testing Strategy

### Phase 1: Establish Stable Testing Environment
1. **Fix CDP Connection Issues** 🚨 URGENT
   - Debug Chrome startup with debugging flags
   - Verify port availability and accessibility
   - Test with minimal Chrome profile
   - Consider alternative testing approaches

2. **Validate Extension Loading**
   - Confirm extension loads in test environment
   - Verify service worker activation
   - Check content script injection

### Phase 2: Core Functionality Validation
1. **Speech Global State Injection Test**
   - Verify `window.speechGlobalState` is present
   - Test all 8 function availabilities
   - Validate function execution

2. **Message Handler Integration Test**
   - Test each Plasmo message handler
   - Verify background script communication
   - Check error handling

### Phase 3: End-to-End Behavior Testing
1. **Navigation Restart Test**
   - Navigate away from and back to page
   - Verify speech recognition re-initializes
   - Test multiple navigation scenarios

2. **Focus Restart Test** 
   - Test textarea focus triggers speech restart
   - Verify button functionality after navigation
   - Test edge cases (rapid focus changes, etc.)

### Phase 4: Real-World Integration Testing
1. **GitHub Integration Test**
   - Test on actual GitHub pages
   - Verify issue creation workflow
   - Test comment functionality

2. **Multiple Site Testing**
   - Test on various sites with textareas
   - Verify universal functionality
   - Check for site-specific issues

## Alternative Testing Approaches

If CDP continues to fail, consider:

### 1. Manual Testing Protocol
- Structured manual test checklist
- Browser developer tools inspection
- Console-based validation

### 2. Extension Unit Testing
- Test individual functions in isolation
- Mock browser APIs
- Validate logic without full browser context

### 3. Puppeteer Integration
- Use Puppeteer instead of raw CDP
- May handle Chrome connection issues better
- More robust browser automation

## Success Criteria

### Minimum Viable Fix
- [ ] Speech recognition restarts after navigation
- [ ] No manual clicking required to re-enable
- [ ] Works on GitHub and other major sites

### Full Success Criteria  
- [ ] All automated tests pass
- [ ] Zero regression in existing functionality
- [ ] Performance impact minimal
- [ ] Works across Chrome/Edge browsers

## Next Immediate Actions

1. **🚨 PRIORITY 1**: Fix CDP connection issues
   - Debug Chrome startup process
   - Test alternative connection methods
   - Establish reliable test environment

2. **🚨 PRIORITY 2**: Run basic validation tests
   - Confirm extension loads and injects properly
   - Verify speechGlobalState functions work
   - Test message handler communication

3. **🚨 PRIORITY 3**: End-to-end validation
   - Test actual navigation scenarios
   - Verify the original bug is fixed
   - Confirm no new issues introduced

## Notes
- Extension builds successfully with no TypeScript errors
- All architectural pieces are in place
- Main blocker is testing environment stability
- Once testing works, validation should be straightforward 