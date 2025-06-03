import { storageGet, storageSet } from "./storage";
import { logInfo, logWarn, logError } from "./logger";

// Storage keys for global speech state
export const SPEECH_GLOBAL_STATE_KEY = "yeshie_speech_global_state";
export const SPEECH_ACTIVE_EDITORS_KEY = "yeshie_speech_active_editors";

// Global speech state interface
export interface SpeechGlobalState {
  isTranscribing: boolean;
  isListening: boolean;
  autoRestart: boolean; // Whether to auto-restart listening when it stops
  sharedText: string; // Shared text content across all instances
  lastTextUpdate: number; // Timestamp of last text update
}

// Speech editor instance interface
export interface SpeechEditorInstance {
  editorId: string;
  tabId: number;
  lastActive: number;
  focused: boolean;
}

// Default global state - transcribing enabled, listening enabled, auto-restart enabled
const DEFAULT_GLOBAL_STATE: SpeechGlobalState = {
  isTranscribing: true,
  isListening: true,
  autoRestart: true,
  sharedText: "",
  lastTextUpdate: 0
};

// Get current global speech state
export async function getSpeechGlobalState(): Promise<SpeechGlobalState> {
  try {
    const state = await storageGet<SpeechGlobalState>(SPEECH_GLOBAL_STATE_KEY);
    return state || DEFAULT_GLOBAL_STATE;
  } catch (error) {
    logError("SpeechGlobalState", "Error getting global speech state", { error });
    return DEFAULT_GLOBAL_STATE;
  }
}

// Set global speech state
export async function setSpeechGlobalState(state: Partial<SpeechGlobalState>): Promise<void> {
  try {
    const currentState = await getSpeechGlobalState();
    const newState = { ...currentState, ...state };
    
    // If updating text, ensure timestamp is current
    if (state.sharedText !== undefined) {
      newState.lastTextUpdate = Date.now();
    }
    
    await storageSet(SPEECH_GLOBAL_STATE_KEY, newState);
    
    logInfo("SpeechGlobalState", "Global speech state updated", { 
      previousState: currentState, 
      newState: newState,
      changes: state
    });

    // Notify all active speech editors about the state change
    await notifyAllSpeechEditors("stateChanged", newState);
  } catch (error) {
    logError("SpeechGlobalState", "Error setting global speech state", { error, state });
  }
}

// Update shared text content across all editors
export async function updateSharedText(text: string, updatingEditorId?: string): Promise<void> {
  try {
    const currentState = await getSpeechGlobalState();
    const newState = {
      ...currentState,
      sharedText: text,
      lastTextUpdate: Date.now()
    };
    
    await storageSet(SPEECH_GLOBAL_STATE_KEY, newState);
    
    logInfo("SpeechGlobalState", "Shared text updated", { 
      textLength: text.length,
      updatingEditorId,
      timestamp: newState.lastTextUpdate
    });

    // Notify all active speech editors about the text change
    // Pass the updating editor ID to avoid circular updates
    await notifyAllSpeechEditors("textChanged", {
      sharedText: text,
      lastTextUpdate: newState.lastTextUpdate,
      updatingEditorId
    });
  } catch (error) {
    logError("SpeechGlobalState", "Error updating shared text", { error, text, updatingEditorId });
  }
}

// Register a speech editor instance
export async function registerSpeechEditor(editorId: string, tabId: number): Promise<void> {
  try {
    const editors = await getActiveSpeechEditors();
    const existingIndex = editors.findIndex(e => e.editorId === editorId);
    
    const editorInstance: SpeechEditorInstance = {
      editorId,
      tabId,
      lastActive: Date.now(),
      focused: false
    };

    if (existingIndex >= 0) {
      editors[existingIndex] = editorInstance;
    } else {
      editors.push(editorInstance);
    }

    await storageSet(SPEECH_ACTIVE_EDITORS_KEY, editors);
    logInfo("SpeechGlobalState", "Speech editor registered", { editorId, tabId, editorsCount: editors.length });
  } catch (error) {
    logError("SpeechGlobalState", "Error registering speech editor", { error, editorId, tabId });
  }
}

// Unregister a speech editor instance
export async function unregisterSpeechEditor(editorId: string): Promise<void> {
  try {
    const editors = await getActiveSpeechEditors();
    const filteredEditors = editors.filter(e => e.editorId !== editorId);
    
    await storageSet(SPEECH_ACTIVE_EDITORS_KEY, filteredEditors);
    logInfo("SpeechGlobalState", "Speech editor unregistered", { editorId, editorsCount: filteredEditors.length });
  } catch (error) {
    logError("SpeechGlobalState", "Error unregistering speech editor", { error, editorId });
  }
}

// Get all active speech editors
export async function getActiveSpeechEditors(): Promise<SpeechEditorInstance[]> {
  try {
    const editors = await storageGet<SpeechEditorInstance[]>(SPEECH_ACTIVE_EDITORS_KEY);
    return editors || [];
  } catch (error) {
    logError("SpeechGlobalState", "Error getting active speech editors", { error });
    return [];
  }
}

// Set focus state for a speech editor
export async function setSpeechEditorFocus(editorId: string, focused: boolean): Promise<void> {
  try {
    const editors = await getActiveSpeechEditors();
    const editorIndex = editors.findIndex(e => e.editorId === editorId);
    
    if (editorIndex >= 0) {
      // Find currently focused editor (if any) before making changes
      const currentlyFocusedEditor = editors.find(e => e.focused);
      
      // Set all editors to unfocused first, then set the target editor's focus state
      editors.forEach(editor => {
        editor.focused = false;
        editor.lastActive = Date.now();
      });
      
      editors[editorIndex].focused = focused;
      editors[editorIndex].lastActive = Date.now();
      
      await storageSet(SPEECH_ACTIVE_EDITORS_KEY, editors);
      logInfo("SpeechGlobalState", "Speech editor focus updated", { editorId, focused });
      
      // EVENT-DRIVEN FOCUS MANAGEMENT: Send targeted commands to editors
      const globalState = await getSpeechGlobalState();
      
      if (focused && globalState.isTranscribing) {
        // New editor gained focus - tell it to start listening
        try {
          await chrome.tabs.sendMessage(editors[editorIndex].tabId, {
            type: "speechFocusCommand",
            data: {
              targetEditorId: editorId,
              command: "startListening"
            }
          });
          logInfo("SpeechGlobalState", "Sent startListening command to newly focused editor", { editorId });
        } catch (error) {
          logWarn("SpeechGlobalState", "Failed to send startListening command", { editorId, error });
        }
      }
      
      // If there was a previously focused editor and it's different from the new one, tell it to stop
      if (currentlyFocusedEditor && currentlyFocusedEditor.editorId !== editorId) {
        try {
          await chrome.tabs.sendMessage(currentlyFocusedEditor.tabId, {
            type: "speechFocusCommand", 
            data: {
              targetEditorId: currentlyFocusedEditor.editorId,
              command: "stopListening"
            }
          });
          logInfo("SpeechGlobalState", "Sent stopListening command to previously focused editor", { 
            editorId: currentlyFocusedEditor.editorId 
          });
        } catch (error) {
          logWarn("SpeechGlobalState", "Failed to send stopListening command to previous editor", { 
            editorId: currentlyFocusedEditor.editorId, error 
          });
        }
      }
      
      // Legacy: If an editor gains focus and global transcribing is enabled, ensure listening is enabled
      if (focused) {
        if (globalState.isTranscribing && !globalState.isListening) {
          await setSpeechGlobalState({ isListening: true });
        }
      }
    }
  } catch (error) {
    logError("SpeechGlobalState", "Error setting speech editor focus", { error, editorId, focused });
  }
}

// Get the currently focused speech editor
export async function getFocusedSpeechEditor(): Promise<SpeechEditorInstance | null> {
  try {
    const editors = await getActiveSpeechEditors();
    return editors.find(e => e.focused) || null;
  } catch (error) {
    logError("SpeechGlobalState", "Error getting focused speech editor", { error });
    return null;
  }
}

// Notify all speech editors about state changes
async function notifyAllSpeechEditors(type: string, data: any): Promise<void> {
  try {
    const editors = await getActiveSpeechEditors();
    
    for (const editor of editors) {
      try {
        let messageData;
        
        if (type === "textChanged") {
          // Special handling for text changes to avoid updating the editor that initiated the change
          if (data.updatingEditorId && data.updatingEditorId === editor.editorId) {
            continue; // Skip notifying the editor that made the change
          }
          messageData = {
            type: "speechTextUpdate",
            data: {
              sharedText: data.sharedText,
              lastTextUpdate: data.lastTextUpdate,
              targetEditorId: editor.editorId
            }
          };
        } else {
          // Standard state change notification
          messageData = {
            type: "speechGlobalStateUpdate",
            data: {
              type,
              state: data,
              targetEditorId: editor.editorId
            }
          };
        }
        
        // Send message to the tab containing this speech editor
        await chrome.tabs.sendMessage(editor.tabId, messageData);
      } catch (error) {
        // Tab might be closed, remove this editor
        logWarn("SpeechGlobalState", "Failed to notify speech editor, removing from registry", { 
          editorId: editor.editorId, 
          tabId: editor.tabId,
          error 
        });
        await unregisterSpeechEditor(editor.editorId);
      }
    }
  } catch (error) {
    logError("SpeechGlobalState", "Error notifying all speech editors", { error, type, data });
  }
}

// Initialize global speech state on extension startup
export async function initializeSpeechGlobalState(): Promise<void> {
  try {
    // Ensure default state exists
    const currentState = await getSpeechGlobalState();
    
    // Force transcribing and listening to be enabled on startup
    if (!currentState.isTranscribing || !currentState.isListening) {
      await setSpeechGlobalState({
        isTranscribing: true,
        isListening: true,
        autoRestart: true
      });
      logInfo("SpeechGlobalState", "Speech state initialized to enabled on startup");
    }
    
    // Clear any stale editor registrations
    await storageSet(SPEECH_ACTIVE_EDITORS_KEY, []);
    logInfo("SpeechGlobalState", "Speech editor registrations cleared on startup");
  } catch (error) {
    logError("SpeechGlobalState", "Error initializing global speech state", { error });
  }
}

// Handle speech recognition restart when it stops due to silence
export async function handleSpeechRecognitionEnd(editorId: string, wasIntentional: boolean): Promise<boolean> {
  try {
    const globalState = await getSpeechGlobalState();
    const focusedEditor = await getFocusedSpeechEditor();
    
    // Only auto-restart if:
    // 1. Global auto-restart is enabled
    // 2. Global transcribing is enabled  
    // 3. This editor is focused (or no editor is focused but this is the most recent)
    // 4. The stop was not intentional (due to silence, not user action)
    const shouldRestart = globalState.autoRestart && 
                         globalState.isTranscribing && 
                         (!focusedEditor || focusedEditor.editorId === editorId) &&
                         !wasIntentional;
    
    if (shouldRestart) {
      logInfo("SpeechGlobalState", "Auto-restarting speech recognition", { 
        editorId, 
        wasIntentional,
        globalState,
        focusedEditor: focusedEditor?.editorId 
      });
      
      // Set listening back to true to trigger restart
      await setSpeechGlobalState({ isListening: true });
      return true;
    } else {
      logInfo("SpeechGlobalState", "Not auto-restarting speech recognition", { 
        editorId,
        wasIntentional,
        globalState,
        focusedEditor: focusedEditor?.editorId,
        shouldRestart 
      });
      
      // Update global listening state to false if intentionally stopped
      if (wasIntentional) {
        await setSpeechGlobalState({ isListening: false });
      }
      return false;
    }
  } catch (error) {
    logError("SpeechGlobalState", "Error handling speech recognition end", { error, editorId, wasIntentional });
    return false;
  }
} 