# Yeshie Background Script Architecture - PRD

## Overview

This document outlines the requirements and architecture for the Yeshie Chrome Extension's background script, which serves as the central hub for the extension's functionality. The background script manages tab tracking, message handling, WebSocket communication, and other core functions.

## Core Components

### 1. Background Script (index.ts)

The background script is the main entry point for the extension's background operations. It initializes when the extension loads and remains active throughout the browser session.

#### Key Responsibilities:
- Initialize tab tracking
- Set up message handlers
- Manage extension lifecycle events
- Handle session persistence
- Establish and manage WebSocket connections
- Manage speech recognition state and coordination

### 2. Tab Tracking System

The tab tracking system monitors browser tab activity to provide context awareness for the extension.

#### Requirements:
- Track the last active tab
- Store tab information including ID, URL, title, and timestamp
- Handle tab focus, navigation, and removal events
- Maintain a list of application tabs across windows
- Debounce tab updates to prevent excessive storage operations

### 3. Message Handling System

The extension uses a robust message handling system for communication between components.

#### Requirements:
- Provide a centralized message routing mechanism
- Support asynchronous responses
- Enable background-to-content script communication
- Handle message types for various operations (focus, navigation, data retrieval)

### 4. WebSocket Client

A configurable WebSocket client for real-time communication with external services.

#### Requirements:
- Support configurable connection endpoints
- Enable secure communication
- Handle connection lifecycle (connect, reconnect, disconnect)
- Process incoming and outgoing messages
- Support message serialization/deserialization
- Provide error handling and logging

#### Configuration Options:
- Server URL (configurable via storage or environment)
- Authentication settings
- Reconnection strategy
- Message format
- Heartbeat/ping interval
- Connection timeout settings

### 5. Speech Recognition Coordination

A system to manage and coordinate speech recognition across multiple SpeechEditor instances.

#### Requirements:
- Maintain global speech recognition state 
- Coordinate handoff between SpeechEditor instances
- Track the currently active/focused SpeechEditor (CSE)
- Ensure only one SpeechEditor instance has active speech recognition
- Monitor Control Tab availability and provide fallback mechanisms
- Store and synchronize user preferences for speech recognition

## Message Protocol

### Incoming Messages

| Message Type | Source | Purpose | Payload Structure |
|-------------|--------|---------|-------------------|
| `getLastTab` | UI | Retrieve information about the last active tab | `{}` |
| `focusLastTab` | UI | Switch focus to the previously active tab | `{ force?: boolean }` |
| `CONTROL_PAGE_UNLOADING` | Control Page | Notify background that the control page is closing | `{}` |
| `pageInfo` | Content Script | Send page information to background | `{ title: string, url: string, isServerPage: boolean, sessionId?: string, serverUrl?: string }` |
| `socketMessage` | Content Script | Forward message to WebSocket server | `{ event: string, payload: any }` |
| `SPEECH_EDITOR_REGISTER` | SpeechEditor | Register a new SpeechEditor instance | `{ editorId: string, tabId: number }` |
| `SPEECH_EDITOR_FOCUS` | SpeechEditor | Notify that an editor gained focus | `{ editorId: string, tabId: number }` |
| `SPEECH_EDITOR_BLUR` | SpeechEditor | Notify that an editor lost focus | `{ editorId: string, tabId: number }` |
| `GET_TRANSCRIPTION_STATE` | SpeechEditor | Request current transcription state | `{ editorId: string }` |
| `SET_TRANSCRIPTION_STATE` | SpeechEditor/Control | Update global transcription state | `{ enabled: boolean }` |
| `CHECK_CONTROL_TAB_STATUS` | SpeechEditor | Check if Control tab is available | `{}` |

### Outgoing Messages

| Message Type | Target | Purpose | Payload Structure |
|-------------|--------|---------|-------------------|
| Various operations | Content Script | Control page actions | `{ type: string, data: any }` |
| `extension` | WebSocket Server | Send data to server | Varies by operation |
| `SPEECH_EDITOR_ACTIVATE` | SpeechEditor | Activate speech recognition for an editor | `{ editorId: string }` |
| `SPEECH_EDITOR_DEACTIVATE` | SpeechEditor | Deactivate speech recognition for an editor | `{ editorId: string }` |
| `TRANSCRIPTION_STATE_CHANGED` | All SpeechEditors | Notify of transcription state change | `{ enabled: boolean }` |
| `CONTROL_TAB_STATUS` | SpeechEditor | Respond with Control tab status | `{ available: boolean, tabId?: number }` |
| `ENSURE_CONTROL_TAB` | Browser | Create Control tab if not present | `{}` |

## Storage Keys

| Key | Purpose | Structure |
|-----|---------|-----------|
| `yeshie_last_active_tab` | Store information about the last active tab | `TabInfo` |
| `yeshie_application_tabs` | Store information about all tracked application tabs | `Record<string, TabInfo[]>` |
| `yeshie_control_page_tabs` | Store information about open control page tabs | `Array<{windowId: number, index: number, active: boolean}>` |
| `yeshie_log_configuration` | Store logging configuration | `LogConfig` |
| `yeshieSessionLogs` | Store session logs | `LogEntry[]` |
| `yeshie_speech_active_editor` | Store the ID of the currently active speech editor | `string` |
| `yeshie_transcription_enabled` | Store whether transcription is globally enabled | `boolean` |
| `yeshie_speech_editors` | Store registered speech editor instances | `Array<{editorId: string, tabId: number, lastActive: number}>` |

## WebSocket Communication

### Connection Establishment
1. The background script directly establishes a WebSocket connection to a server running on the host machine or in the cloud
2. The connection is initiated during background script startup using the configured server URL
3. The connection is maintained throughout the browser session with automatic reconnection when needed

### Server Configuration
- The socket server can be running locally on the user's machine (host) or remotely in the cloud
- Server endpoints are configurable through extension settings
- Local development servers typically run on localhost with a specified port
- Production servers run on secure cloud infrastructure

### Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `message` | Outgoing | Send a user message to the server |
| `init` | Outgoing | Initialize or restore a session |
| `response` | Incoming | Receive a response from the server |

### Security Considerations
- All WebSocket connections must use secure protocols (WSS) for cloud servers
- Local development may use WS for localhost connections
- Authentication tokens should be stored securely
- Message validation should be performed for all incoming messages
- Rate limiting should be implemented to prevent abuse

## Speech Recognition State Management

### Editor Registration and Focus Tracking
1. Each SpeechEditor instance registers with the background script when mounted
2. Focus/blur events update the current active editor
3. The background script manages handoff between editors

### State Synchronization
1. Global transcription state is stored in Chrome storage
2. Changes are broadcast to all registered editors
3. New editors receive the current state on registration

### Control Tab Management
1. Background script monitors Control Tab availability
2. If Control Tab is closed, attempts to reopen or provides fallback
3. Periodic heartbeat checks ensure Control Tab is responsive

### Failover Mechanisms
1. If Control Tab becomes unresponsive, local state management takes over
2. Background script maintains separate speech state to handle disconnections
3. Reconnection protocol restores synchronized state when Control Tab returns

## Dependencies

The background script relies on the following modules:

| Module | Purpose |
|--------|---------|
| `functions/storage.ts` | Handle persistent storage operations |
| `functions/logger.ts` | Provide structured logging |
| `functions/extcomms.ts` | Manage WebSocket communication |
| `functions/speechState.ts` | Manage speech recognition state |
| `socket.io-client` | WebSocket client library |

## Implementation Details

### WebSocket Client Implementation

The WebSocket client will be implemented as a reusable module with the following features:

```typescript
interface WebSocketConfig {
  serverUrl: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  authToken?: string;
  pingInterval?: number;
  timeout?: number;
  debug?: boolean;
}

class WebSocketClient {
  constructor(config: WebSocketConfig);
  
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  
  // Message handling
  send<T>(type: string, payload: T): Promise<void>;
  onMessage<T>(type: string, handler: (data: T) => void): void;
  
  // Status management
  isConnected(): boolean;
  getStatus(): ConnectionStatus;
}
```

### Speech State Manager Implementation

```typescript
interface SpeechEditorInfo {
  editorId: string;
  tabId: number;
  lastActive: number;
}

interface TranscriptionState {
  enabled: boolean;
  activeEditorId: string | null;
}

class SpeechStateManager {
  constructor();
  
  // Registration
  registerEditor(editorId: string, tabId: number): Promise<void>;
  unregisterEditor(editorId: string): Promise<void>;
  
  // Focus management
  setActiveEditor(editorId: string): Promise<string | null>; // Returns previous active editor id
  getActiveEditor(): Promise<string | null>;
  
  // Transcription state
  setTranscriptionEnabled(enabled: boolean): Promise<void>;
  isTranscriptionEnabled(): Promise<boolean>;
  
  // Control tab
  ensureControlTabAvailable(): Promise<boolean>;
  checkControlTabStatus(): Promise<boolean>;
}
```

### File Structure

```
extension/
├── background/
│   ├── index.ts                 # Main entry point
│   ├── tabHistory.ts            # Tab tracking functionality
│   ├── reportHandler.ts         # User report handling
│   ├── speechManager.ts         # Speech recognition coordination
│   └── messages/                # Message handlers for various operations
│       ├── focusTab.ts
│       ├── getLastTab.ts
│       ├── speechEditorRegister.ts
│       ├── speechEditorFocus.ts
│       └── ...
├── functions/
│   ├── storage.ts               # Storage operations
│   ├── logger.ts                # Logging system
│   ├── websocket.ts             # WebSocket client (to be implemented)
│   ├── extcomms.ts              # Extension communications
│   └── speechState.ts           # Speech state management
└── components/
    ├── types.ts                 # Shared type definitions
    └── SpeechEditor.tsx         # Speech editor component
```

## Issues and Improvements

### Current Issues:
1. WebSocket connection handling is tightly coupled with background script lifecycle
2. Connection configuration is hardcoded
3. Error handling for WebSocket operations is limited
4. No centralized speech recognition coordination

### Proposed Improvements:
1. Implement a dedicated WebSocket client module
2. Add configurable connection settings via storage
3. Improve reconnection logic and error handling
4. Add support for multiple simultaneous connections
5. Implement more robust message validation
6. Create a centralized speech recognition coordinator
7. Add speech editor registration and focus tracking
8. Implement control tab monitoring and failover mechanisms

## Testing Requirements

The WebSocket client should be thoroughly tested for:

1. Connection establishment and maintenance
2. Reconnection handling
3. Message sending and receiving
4. Error handling
5. Performance under load
6. Security compliance

The Speech Recognition Coordinator should be tested for:

1. Editor registration and focus tracking
2. Proper state synchronization across multiple editors
3. Graceful handling of Control Tab unavailability
4. Recovery from disconnections
5. Performance with multiple editors active

## Migration Plan

1. Implement the new WebSocket client module
2. Update configuration options
3. Create a bridge for backward compatibility
4. Gradually migrate existing code to use the new client
5. Remove deprecated code after successful migration
6. Implement speech recognition coordination
7. Update SpeechEditor component to integrate with the coordinator
8. Test and validate speech recognition handoff

## Configuration Schema

```json
{
  "websocket": {
    "serverUrl": "wss://api.example.com",
    "reconnectInterval": 2000,
    "maxReconnectAttempts": 5,
    "authToken": "",
    "pingInterval": 30000,
    "timeout": 5000,
    "debug": false
  },
  "speech": {
    "enabled": true,
    "autoStartOnFocus": true,
    "controlTabHeartbeatInterval": 10000,
    "editorInactivityTimeout": 300000,
    "useLocalFallbackWhenNoControl": true
  }
}
```

This configuration will be stored in extension storage and can be updated via the options page. 