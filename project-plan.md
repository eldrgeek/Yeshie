# Yeshie Project Plan

## Phase 1: LLM Learning Implementation

### Step 1: Editor Implementation
- [ ] Disable iframe editor (temporarily)
- [ ] Enhance built-in editor functionality
- [ ] Add command history
- [ ] Implement command execution feedback
- [ ] Add toast notifications for user guidance

### Step 2: Command Parser Implementation
- [ ] Create command parser to detect "Learn" commands (case-insensitive)
- [ ] Implement URL extraction and validation
- [ ] Add command type detection for "Learn" vs regular commands
- [ ] Create initial ChatGPT pattern bootstrap code

### Step 3: Learning Workflow UI
- [ ] Create toast notification system for learning mode
- [ ] Implement step-by-step instructions in toast
- [ ] Add cancel and reload buttons to toast
- [ ] Add visual feedback for user actions

### Step 4: Stepper Integration
- [ ] Implement navigation to target LLM
- [ ] Add page load detection with reload option
- [ ] Create element interaction tracking
- [ ] Implement clipboard monitoring
- [ ] Add error handling with retry options

### Step 5: Selector Discovery
- [ ] Implement input field selector detection
- [ ] Add submit action detection
- [ ] Create response area selector detection
- [ ] Implement selector inference from user actions
- [ ] Add pattern storage for discovered selectors

### Step 6: Data Collection and Storage
- [ ] Create data structure for LLM interaction patterns
- [ ] Implement data collection during learning
- [ ] Add storage mechanism for learned patterns
- [ ] Create pattern validation system

### Step 7: Command Execution
- [ ] Implement command injection into LLM
- [ ] Add response capture mechanism
- [ ] Create pattern application system
- [ ] Add error recovery mechanisms

### Step 8: Debugging Infrastructure
- [ ] Implement console log capture
- [ ] Add error tracking
- [ ] Create clipboard-based debugging output
- [ ] Add automatic test command execution after reload

### Step 9: Testing and Refinement
- [ ] Test with ChatGPT interface
- [ ] Refine selector detection
- [ ] Optimize user interaction flow
- [ ] Add pattern sharing capabilities

## Next Steps
After completing Phase 1, we will:
1. Test the learning system with multiple LLM interfaces
2. Implement the command execution system
3. Add voice input support
4. Create the Pro Mode toggle

## Current Status
Ready to begin with Step 1: Editor Implementation

## Implementation Notes
- Toast notifications will be used for user guidance
- Cancel and reload buttons will be added to toast
- Initial ChatGPT pattern will be hardcoded
- Console logs will be captured to clipboard
- Automatic test command execution after reload
- Iframe code will be preserved but disabled with comments
- Built-in editor will be enhanced for command execution 