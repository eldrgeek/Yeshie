// extension/functions/learn.ts (Refactored for direct recording)

import { logDebug, logInfo, logError } from "./logger";

// Define the structure for raw recorded data
export interface RawStepData { // Export interface for use in background script
  timestamp: number; // Use number for easier sorting
  type: 'click' | 'type' | 'change' | 'navigate' | 'switchTab' | 'scroll' | 'hover' | string; // Add more as needed
  selector?: string; // CSS Selector - Needs robust generation
  value?: string | number | boolean; // Input value, scroll position, checked state etc.
  url: string; // URL at the time of action
  tabId: number; // Tab ID where action occurred
  tagName?: string; // Target element tag name
  elementType?: string; // e.g., 'text', 'checkbox', 'button'
}

// --- State within this content script instance ---
let isContentScriptRecordingActive = false;
let collectedContentScriptSteps: RawStepData[] = [];
let currentTabId: number | undefined = undefined;

// --- Robust Selector Generation (Placeholder - Needs Implementation) ---
// This is critical for reliable test playback.
// Consider using libraries or established patterns (e.g., shortest unique path).
function getRobustSelector(element: Element): string {
    if (element.id) {
        // Check if ID is unique enough, otherwise combine with tag/classes
        // Simple case:
        return `#${element.id}`;
    }
    // Fallback to CSS selector path (needs implementation)
    // Example: body > div:nth-child(2) > p.content
    // For now, basic tag + class:
    let selector = element.tagName.toLowerCase();
    if (element.className && typeof element.className === 'string') { // Check type for safety
        selector += '.' + element.className.trim().replace(/\s+/g, '.');
    }
    logDebug("Using basic selector (needs improvement):", { selector, element });
    return selector;
}

// --- Core Event Handlers ---

const handleClick = (event: MouseEvent) => {
    if (!isContentScriptRecordingActive || !currentTabId) return;
    // Ignore clicks inside the recorder UI itself if it exists in the content script
    // if ((event.target as Element).closest('.yeshie-recorder-ui')) return;

    if (event.target instanceof Element) {
        const targetElement = event.target as Element;
        const step: RawStepData = {
            timestamp: Date.now(),
            type: 'click',
            selector: getRobustSelector(targetElement),
            url: window.location.href,
            tabId: currentTabId,
            tagName: targetElement.tagName,
            elementType: (targetElement as HTMLInputElement).type || undefined, // e.g., 'checkbox', 'text'
            value: (targetElement as HTMLInputElement).checked !== undefined ? (targetElement as HTMLInputElement).checked : undefined, // Capture checkbox state on click
        };
        collectedContentScriptSteps.push(step);
        logDebug("Recorded click step", { step });
    }
};

// Handles input fields, textareas
const handleInput = (event: Event) => {
    // Debounce this? Only record after a pause?
    // For now, let's rely on 'change' or 'blur' for final value,
    // but we could capture 'type' events if needed for specific cases.
     logDebug("Input event detected", { type: event.type, target: event.target }); // Less noisy log
};

// Handles select dropdowns, checkboxes, radio buttons, and final input/textarea values on blur/change
const handleChange = (event: Event) => {
    if (!isContentScriptRecordingActive || !currentTabId) return;

    if (event.target instanceof Element) {
        const targetElement = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        let stepType: RawStepData['type'] = 'change';
        let stepValue: RawStepData['value'] = targetElement.value;

        // Adjust type and value for checkboxes/radios
        if (targetElement.type === 'checkbox' || targetElement.type === 'radio') {
            stepValue = (targetElement as HTMLInputElement).checked;
            stepType = 'click'; // Record as 'click' representing the user action
        }

        const step: RawStepData = {
            timestamp: Date.now(),
            type: stepType,
            selector: getRobustSelector(targetElement),
            value: stepValue,
            url: window.location.href,
            tabId: currentTabId,
            tagName: targetElement.tagName,
            elementType: targetElement.type,
        };


        // Avoid duplicate events if click already captured checkbox state very recently
        const lastStep = collectedContentScriptSteps[collectedContentScriptSteps.length - 1];
        if (lastStep &&
            lastStep.type === 'click' &&
            lastStep.selector === step.selector &&
            (step.timestamp - lastStep.timestamp < 50)) { // Check if click was almost simultaneous
             // Update the click step with the change value instead of adding a separate change event.
             lastStep.value = step.value;
             logDebug("Updated click step with change value", { step: lastStep });
        } else {
            collectedContentScriptSteps.push(step);
            logDebug("Recorded change/click(radio/checkbox) step", { step });
        }
    }
};

// --- Listener Management ---

function attachListeners() {
    logInfo(`Attaching recording listeners for tab ${currentTabId}`);
    // Use capture phase to get events early
    window.addEventListener('click', handleClick, true);
    // window.addEventListener('input', handleInput, true); // Probably too noisy, rely on change
    window.addEventListener('change', handleChange, true); // Catches final input/textarea value on blur, select changes, checkbox/radio clicks
}

function detachListeners() {
    logInfo(`Detaching recording listeners for tab ${currentTabId}`);
    window.removeEventListener('click', handleClick, true);
    // window.removeEventListener('input', handleInput, true);
    window.removeEventListener('change', handleChange, true);
}

// --- Main Control Function (called by LearnMode.tsx) ---

/**
 * Toggles the recording state for this content script instance.
 * Attaches or detaches event listeners.
 * When stopping, sends collected steps to the background script.
 * @param options - Contains the desired state and the target tab ID for context.
 */
export function toggleRecording(options: { activate: boolean; tabId: number }) {
    // Ensure tabId is set for this instance
    if (options.tabId !== undefined) {
      currentTabId = options.tabId;
    } else {
        logError("toggleRecording called without tabId!");
        return; // Cannot proceed without tabId
    }

    if (options.activate && !isContentScriptRecordingActive) {
        logInfo(`Activating recording for tab ${currentTabId}`);
        isContentScriptRecordingActive = true;
        collectedContentScriptSteps = []; // Clear steps from previous session
        attachListeners();

    } else if (!options.activate && isContentScriptRecordingActive) {
        logInfo(`Deactivating recording for tab ${currentTabId}`);
        isContentScriptRecordingActive = false;
        detachListeners();

        // Make a copy of steps before clearing
        const stepsToSend = [...collectedContentScriptSteps];
        collectedContentScriptSteps = []; // Clear steps immediately

        logInfo(`Sending ${stepsToSend.length} steps from tab ${currentTabId} to background`);
        chrome.runtime.sendMessage({
            type: "FORWARD_RECORDED_STEPS",
            payload: {
                steps: stepsToSend
                // sender tabId is added automatically by the runtime
            }
        }).catch(error => logError("Error sending recorded steps to background", { error }));

    } else {
        logDebug(`Recording state change ignored: activate=${options.activate}, currentlyActive=${isContentScriptRecordingActive}`);
    }
}

// --- Cleanup ---
// Ensure no old functions/state remain (like TASK_NAMES, isLearning, startLearnSession etc.)
