# Feature Documentation for Speech Editor Component and Control Integration

## Current Features in SpeechEditor Component

### Speech Recognition
- Provides speech-to-text capabilities via Web Speech API
- Shows real-time transcription in the editor
- Supports continuous listening with interim results
- Handles microphone permissions gracefully

### Text Processing
- Intelligent punctuation handling with proper spacing
- Command word processing:
  - "literally" to type command words verbatim
  - "all caps" and "end caps" for capitalization control
- "new line" for paragraph breaks
- Various punctuation commands (period, comma, etc.)
- Preserves new line characters in output so capitalization after a break works
  consistently

### User Interface
- Microphone toggle button with visual feedback
- Status messages for user guidance
- Automatic cursor positioning
- Debug mode with clipboard logging

### Control Commands
- Special voice commands including:
  - "transcribe" - starts transcription
  - "stop" - stops transcription
  - "send" - submits text
  - "back" - removes last word

## Required New Features for PRD

### 1. Current Speech Editor (CSE) Focus Tracking
- Implement a global state manager to track which SpeechEditor instance is currently focused/active
- Register each SpeechEditor instance with a unique ID upon mounting
- Track focus/blur events on each instance to update the globally active component
- Provide hooks or context for components to access the current active state
- Store the active state in a persistent location accessible across different parts of the extension

### 2. Speech Recognition Handoff Between Editors
- When focus changes between SpeechEditor instances:
  - Send a deactivation message to the previously active SpeechEditor (Old CSE)
  - The Old CSE must stop speech recognition and transcription
  - Send an activation message to the newly focused SpeechEditor (New CSE)
  - The New CSE must initialize and start speech recognition if appropriate
- Implement a message bus system for communication between SpeechEditor instances
- Handle edge cases such as multiple rapid focus changes
- Ensure proper cleanup of speech recognition resources

### 3. Global Transcription State Management
- Maintain a global state for transcription status (on/off)
- Implement storage for transcription settings across browser sessions
- Create a central controller to manage transcription state changes
- Provide state change notifications to all SpeechEditor instances
- Ensure transcription state is synchronized across all instances
- Allow for manual override of transcription state from control panel

### 4. Control Tab Page Integration
- Ensure the Tab Control page is loaded and accessible
- Implement heartbeat checks to verify Control page status
- Add auto-recovery mechanisms if Control page is unresponsive
- Create APIs for SpeechEditor instances to communicate with the Control page
- Establish event listeners for Control page lifecycle events
- Implement fallback strategies when Control page is unavailable
- Add detailed logging for Control page state changes
- Provide user-facing status indicators for Control page connectivity

## Implementation Notes
- All instances of SpeechEditor must register with the global state manager on mount
- Control page should maintain the source of truth for active SpeechEditor and transcription state
- Message passing should utilize Chrome extension messaging APIs for reliability
- Consider performance implications of frequent focus changes between editors
- Implement appropriate error recovery mechanisms for all communication channels

## Technical Requirements
- Storage requirements for persisting state across browser sessions
- Message format specifications for inter-component communication
- API documentation for Control page integration
- Event schema for state change notifications
- Error handling protocols for failed communications 