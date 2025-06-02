import React, { useState, useEffect, useRef, useCallback, forwardRef, useMemo } from 'react';
import { sendToBackground } from "@plasmohq/messaging";

// TEST MESSAGE LISTENER - Add this early to catch all messages
let globalMessageHandler: ((message: any, sender: chrome.runtime.MessageSender) => void) | null = null;

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        // Forward to React component if handler is set
        if (globalMessageHandler) {
            globalMessageHandler(message, sender);
        }
        
        return false; // Don't keep port open
    });
} else {
    // No logging here since addToLog isn't available yet
}

// Speech Global State Helper Functions
const getSpeechGlobalState = async () => {
    return await sendToBackground({ name: "getSpeechGlobalState" });
};

const setSpeechGlobalState = async (state: any) => {
    return await sendToBackground({ name: "setSpeechGlobalState", body: state });
};

const registerSpeechEditor = async (editorId: string, tabId: number) => {
    return await sendToBackground({ name: "registerSpeechEditor", body: { editorId, tabId } });
};

const unregisterSpeechEditor = async (editorId: string) => {
    return await sendToBackground({ name: "unregisterSpeechEditor", body: { editorId } });
};

const getActiveSpeechEditors = async () => {
    return await sendToBackground({ name: "getActiveSpeechEditors" });
};

const setSpeechEditorFocus = async (editorId: string, focused: boolean) => {
    return await sendToBackground({ name: "setSpeechEditorFocus", body: { editorId, focused } });
};

const getFocusedSpeechEditor = async () => {
    return await sendToBackground({ name: "getFocusedSpeechEditor" });
};

const handleSpeechRecognitionEnd = async (editorId: string, result: any) => {
    return await sendToBackground({ name: "handleSpeechRecognitionEnd", body: { editorId, result } });
};

enum P { before = 1, after = 2, none = 3 }
// --- Configuration ---
const punctuation = [
    ['period', '.', P.after],
    ['comma', ',', P.after],
    ['question mark', '?', P.after],
    ['exclamation point', '!', P.after],
    ['exclamation mark', '!', P.after],
    ['colon', ':', P.after],
    ['semicolon', ';', P.after],
    ['hyphen', '-', P.none],
    ['dash', '-', P.none],
    ['ellipsis', '...', P.none],
    ['open quote', '"', P.before],
    ['close quote', '"', P.after],
    ['single quote', "'", P.before],
    ['apostrophe', "'", P.none],
    ['quote', '"', P.before],
    ['open paren', '(', P.before],
    ['close paren', ')', P.after],
    ['open bracket', '[', P.before],
    ['close bracket', ']', P.after],
    ['open brace', '{', P.before],
    ['close brace', '}', P.after],
];

const PUNCTUATION_MAP = {}
punctuation.forEach(([name, symbol, position]) => {
  PUNCTUATION_MAP[name] = { before: position === P.before, after: position === P.after };
});



const CONTROL_WORDS = {
    'new line': '\n',
    // Add other control words if needed
};

const SPECIAL_COMMANDS = new Set([
    'literally',
    'all caps',
    'end caps',
    ...Object.keys(PUNCTUATION_MAP),
    ...Object.keys(CONTROL_WORDS),
]);

// Simple timestamp function
const getTimestamp = () => new Date().toISOString();

// --- Demo Parent Component ---
function SpeechComponent() {
    const handleTextSubmit = (finalText) => {
      alert(`Submitting: ${finalText}`);
      // Send the text to your backend, update state, etc.
    };

    const displayHelp = () => {
       alert(`
        **Speech Input Help**

        * Click the microphone 🎤 to toggle speech-to-text.
        * Speak clearly. Your words will appear in the text box.
        * Say punctuation names like "period", "comma", "question mark".
        * Say "new line" to start a new paragraph.
        * Say "all caps" to make following text uppercase until you say "end caps".
        * To type a command word itself (e.g., the word "period"), say "literally" before it (e.g., "literally period").
        * Press Cmd+Enter (Mac) or Ctrl+Enter (Windows) to submit the text.
        * Type "help" and press Cmd/Ctrl+Enter to see this message again.
        * Click the "Debug" button to copy logs and text to clipboard.
      `);
    }

    return (
      <div>
        <SpeechInput
          onSubmit={handleTextSubmit}
          onShowHelp={displayHelp}
          initialText="Welcome! Try speaking."
        />
      </div>
    );
  }


// --- Helper Hook for Speech Recognition ---
const useSpeechRecognition = ({ onResult, onError, onEnd, onLog }) => {
    const recognitionRef = useRef(null);
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState('prompt');

    // Helper to safely call onLog
    const log = useCallback((message, level = 'info', data = undefined) => {
        if (onLog) {
            onLog(message, level, data);
        }
    }, [onLog]);


    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            log('Speech Recognition API not supported', 'error');
            setIsSupported(false);
            if (onError) onError({ error: 'browser-not-supported' });
            return;
        }

        log('Speech Recognition API supported', 'info');
        setIsSupported(true);
        try {
            recognitionRef.current = new SpeechRecognition();
        } catch (e) {
            log('Failed to create SpeechRecognition instance', 'error', e);
             setIsSupported(false);
            if (onError) onError({ error: 'init-failed', message: e.message });
            return;
        }

        let recognition = recognitionRef.current;

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1; // Simplify for now
        recognition.lang = 'en-US';

        // --- Event Listeners with Logging via Callback ---
        recognition.onstart = () => {
            log("SpeechRecognition: onstart fired");
            // Actual start state is handled by the hook's state and parent component
        };
        recognition.onaudiostart = () => {
            log("SpeechRecognition: onaudiostart fired");
        };
        recognition.onspeechstart = () => {
            log("SpeechRecognition: onspeechstart fired");
        };
        recognition.onspeechend = () => {
            log("SpeechRecognition: onspeechend fired");
            // User stopped talking, but recognition might still be processing
        };
        recognition.onaudioend = () => {
            log("SpeechRecognition: onaudioend fired");
            // Audio capture stopped. onend should follow shortly.
        };
        recognition.onresult = (event) => {
            // log("SpeechRecognition: onresult fired", 'debug', event); // Can be very noisy
            if (onResult) onResult(event);
        };
        recognition.onerror = (event) => {
            log(`SpeechRecognition: onerror fired: ${event.error}`, 'error', event.message);
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                setPermissionStatus('denied');
            } else if (event.error === 'no-speech') {
                 // Often happens normally, let onEnd handle state unless specifically needed
                 log('Error: No speech detected', 'warn');
            }
            if (onError) onError(event); // Forward the error
        };
        recognition.onend = () => {
            log("SpeechRecognition: onend fired");
            // CRITICAL FIX: Reset isListening state when service actually ends
            // This is essential for restart logic to work properly
            log("SpeechRecognition: onend - setting isListening to false");
            setIsListening(false);
            
            // Then call the parent's onEnd callback for restart logic
            if (onEnd) {
                log("SpeechRecognition: onend - calling parent onEnd callback");
                onEnd();
            } else {
                log("SpeechRecognition: onend - NO parent onEnd callback");
            }
        };

        // Check initial permission state
        if (navigator.permissions) {
            navigator.permissions.query({ name: 'microphone' as PermissionName })
                .then((permission) => {
                    log(`Initial microphone permission state: ${permission.state}`, 'info');
                    setPermissionStatus(permission.state);
                    permission.onchange = () => {
                        log(`Microphone permission state changed to: ${permission.state}`, 'info');
                        setPermissionStatus(permission.state);
                    }
                })
                .catch(err => {
                     log('Could not query microphone permission', 'error', err);
                      // Assume denied if query fails? Or prompt? Let's assume prompt.
                     setPermissionStatus('prompt');
                });
        } else {
            log('navigator.permissions API not supported', 'warn');
            // Cannot check permission proactively, will rely on start() errors
             setPermissionStatus('prompt'); // Assume we need to ask
        }

        return () => {
            log('Cleaning up SpeechRecognition instance', 'info');
            if (recognition) {
                // Remove listeners? Maybe not strictly necessary if instance is discarded
                recognition.onstart = null;
                recognition.onaudiostart = null;
                // ... and so on for all listeners
                try {
                     // Only stop if it's potentially running
                     // Checking internal state is unreliable, just try stopping
                    log('Attempting cleanup stop()', 'debug');
                    recognition.abort(); // Use abort for faster cleanup
                    // recognition.stop();
                    log('Cleanup stop()/abort() called', 'debug');
                } catch (e) {
                     log('Error during cleanup stop/abort', 'warn', e);
                     // Ignore errors during cleanup
                }
                recognitionRef.current = null;
            }
        };
    }, [onResult, onError, onEnd, log]);

    const startListening = useCallback(() => {
        if (recognitionRef.current && !isListening && isSupported) {
             try {
                 log("startListening: Attempting to start...");
                 recognitionRef.current.start();
                 log("startListening: recognition.start() called successfully");
                 setIsListening(true);
                 log("startListening: setIsListening(true) called");
                 // Don't assume pending, wait for events or errors
              } catch(e) {
                 log("startListening: Error during start", 'error', e);
                 // Handle cases like starting too soon after stopping, or API busy
                 if (onError) onError({error: 'start-failed', message: e.message});
                 setIsListening(false); // Ensure state reflects failure
             }
        } else {
             if (!isSupported) {
                 log("startListening: Not starting, not supported", 'warn');
             }
             if (isListening) {
                 log("startListening: Not starting, already listening", 'warn');
             }
             if (!recognitionRef.current) {
                 log("startListening: Not starting, recognition instance not available", 'error');
             }
        }
    }, [isListening, isSupported, onError, log]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current && isListening) {
             try {
                 log("stopListening: Attempting to stop...");
                 // Use abort() for a potentially quicker stop and to discard results
                 recognitionRef.current.abort();
                 log("stopListening: recognition.abort() called");
                 // recognitionRef.current.stop(); // stop() waits for result processing
                 // Important: Let the 'onend' event triggered by stop/abort
                 // handle the final state update via the onEnd callback.
                 // Avoid setting isListening false directly here unless absolutely necessary.
                 // setIsListening(false); // Let onEnd handle this
             } catch(e) {
                 log("stopListening: Error during stop/abort", 'error', e);
                  // Ignore errors during stop generally, but log them.
                 if (onError) onError({error: 'stop-failed', message: e.message});
                 // Force state if stop fails badly? Maybe not, let onEnd handle.
             }
        } else {
             if (!isListening) {
                 log("stopListening: Not stopping, not listening", 'warn');
             }
             if (!recognitionRef.current) {
                 log("stopListening: Not stopping, recognition instance not available", 'error');
             }
        }
    }, [isListening, onError, log]);


    return {
        isListening,
        isSupported,
        permissionStatus,
        startListening,
        stopListening,
        // Exposing setIsListening can be risky, prefer managing state via callbacks
        // setIsListening,
    };
};

// Add periodic status check inside the hook
const useSpeechRecognitionWithDebug = ({ onResult, onError, onEnd, onLog }) => {
    const hookResult = useSpeechRecognition({ onResult, onError, onEnd, onLog });
    
    // This will be inside the hook context but we can't access recognitionRef from outside
    // Instead, let's add the debugging directly in the main hook
    
    return hookResult;
};


// --- The Main Component ---
interface SpeechInputProps {
    onSubmit?: (text: string) => void;
    onShowHelp?: () => void;
    initialText?: string;
    onChange?: (text: string) => void;
}

export const SpeechInput = forwardRef<HTMLTextAreaElement, SpeechInputProps>(({
    onShowHelp = () => alert('Help: ...'), // Provide default help message
    initialText = '',
    onChange = (text) => {}, // Add optional onChange prop with default no-op
    onSubmit, // Will be set after addToLog is available
}, forwardedRef) => {
    // --- State Declarations First ---
    const [text, setText] = useState(initialText);
    const [isAllCaps, setIsAllCaps] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Initializing...');
    const [micPosition, setMicPosition] = useState<'top' | 'bottom'>('bottom');
    const [logBuffer, setLogBuffer] = useState<string[]>([]); // Store logs
    const [isTranscribing, setIsTranscribing] = useState(true); // Initialize to true by default
    const [permissionDeniedCount, setPermissionDeniedCount] = useState(0); // Track permission denial attempts

    // Generate unique editor ID for this instance
    const editorId = useMemo(() => `speechEditor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, []);
    
    // Track global state
    const [globalSpeechState, setGlobalSpeechState] = useState<any | null>(null);

    // Use local ref for textarea access
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    const finalProcessedTranscriptRef = useRef(''); // Keep for potential future use/debug
    // --- Refactored Insertion Refs ---
    const interimRangeRef = useRef<{ start: number | null, end: number | null }>({ start: null, end: null });
    const lastCursorPosRef = useRef<number>(0);
    const wasListeningIntentionallyRef = useRef(false); // Track user intent
    const justManuallyStartedRef = useRef(false); // Track recent manual start attempt
    const manualStartTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Add rate limiting for restart attempts
    const lastRestartAttemptRef = useRef<number>(0);
    const RESTART_COOLDOWN_MS = 500; // Reduced from 2000 to 500ms for debugging

    // --- Logging Function with Page Identification (AFTER STATE DECLARATIONS) ---
    const addToLog = useCallback((message: string, level: string = 'info', data: any = undefined) => {
        const timestamp = getTimestamp();
        
        // Get page identification
        const pageInfo = (() => {
            try {
                const url = window.location.href;
                const isExtensionPage = url.startsWith('chrome-extension://');
                const isContentScript = !isExtensionPage;
                
                if (isExtensionPage) {
                    // Extract page type from extension URL
                    const pathMatch = url.match(/\/([^\/]+)\.html/);
                    const pageType = pathMatch ? pathMatch[1] : 'extension';
                    return `[EXT:${pageType}]`;
                } else {
                    // Content script - get domain
                    const domain = new URL(url).hostname;
                    return `[CONTENT:${domain}]`;
                }
            } catch (e) {
                return '[UNKNOWN]';
            }
        })();
        
        let logEntry = `${timestamp} ${pageInfo} [${level.toUpperCase()}] ${message}`;
        if (data !== undefined) {
            try {
                // Append simple data directly, stringify complex objects/errors
                if (data instanceof Error) {
                     logEntry += ` | Data: ${data.name}: ${data.message}`;
                     if(data.stack) logEntry += `\nStack: ${data.stack.substring(0, 100)}...`; // Limit stack trace
                } else if (typeof data === 'object' && data !== null) {
                    logEntry += ` | Data: ${JSON.stringify(data)}`;
                } else {
                     logEntry += ` | Data: ${String(data)}`;
                }
            } catch (e) {
                logEntry += ` | (Failed to stringify data)`;
            }
        }
        setLogBuffer(prev => [...prev, logEntry]);
    }, [setLogBuffer]); // Correct dependency array

    // Set default onSubmit now that addToLog is available
    const finalOnSubmit = onSubmit || ((text) => addToLog('Submitted: ' + text, 'info'));

    // --- Speech Recognition Hook (Declared Early) ---
    const handleResultRef = useRef(null);
    const handleErrorRef = useRef(null);
    const handleEndRef = useRef(null);

    // Memoize the callback functions that will be passed to the hook
    const memoizedOnResult = useCallback((event) => {
        handleResultRef.current?.(event);
    }, []); // Dependencies should include anything from the outer scope if used inside, but handleResultRef.current is stable itself

    const memoizedOnError = useCallback((event) => {
        handleErrorRef.current?.(event);
    }, []); // Same as above

    const memoizedOnEnd = useCallback(() => {
        handleEndRef.current?.();
    }, []);

    const {
        isListening,
        isSupported,
        permissionStatus,
        startListening,
        stopListening,
        // setIsListening, // Avoid using the direct setter if possible
    } = useSpeechRecognition({
        onResult: memoizedOnResult, // Use memoized callback
        onError: memoizedOnError,   // Use memoized callback
        onEnd: memoizedOnEnd,     // Use memoized callback
        onLog: addToLog, // Pass the logging function to the hook
    });

    // Register this speech editor instance on mount and get initial global state
    useEffect(() => {
        let mounted = true;
        
        const initializeEditor = async () => {
            try {
                // Get current tab ID for registration
                const response = await sendToBackground({ name: "getTabId" });
                const tabId = response?.tabId;
                
                if (tabId && mounted) {
                    // Register this editor instance
                    await registerSpeechEditor(editorId, tabId);
                    
                    // Get initial global state
                    const initialGlobalState = await getSpeechGlobalState();
                    if (mounted) {
                        setGlobalSpeechState(initialGlobalState);
                        setIsTranscribing(initialGlobalState.isTranscribing);
                        
                        addToLog(`Speech editor registered with global state: ${JSON.stringify(initialGlobalState)}`, 'info');
                    }
                }
            } catch (error) {
                if (mounted) {
                    addToLog(`Error initializing speech editor: ${error}`, 'error');
                }
            }
        };
        
        initializeEditor();
        
        return () => {
            mounted = false;
            // Unregister this editor instance on unmount
            unregisterSpeechEditor(editorId).catch(error => {
                addToLog(`Error unregistering speech editor: ${error}`, 'error');
            });
        };
    }, [editorId, addToLog]);

    // Listen for global state changes and focus commands from background
    useEffect(() => {
        const handleMessage = (message: any, sender: chrome.runtime.MessageSender) => {
            // DEBUG: Log all received messages
            addToLog(`MESSAGE RECEIVED: ${JSON.stringify(message)}, sender: ${JSON.stringify(sender)}`, 'info');
            
            // Handle global state updates (existing functionality)
            if (message.type === "speechGlobalStateUpdate" && 
                message.data?.targetEditorId === editorId) {
                
                const newGlobalState = message.data.state;
                setGlobalSpeechState(newGlobalState);
                setIsTranscribing(newGlobalState.isTranscribing);
                
                addToLog(`Received global state update: ${JSON.stringify(newGlobalState)}`, 'info');
                
                // REMOVED: No auto-restart here - only handle state updates
            }
            
            // Handle new focus commands (event-driven approach)
            if (message.type === "speechFocusCommand" && 
                message.data?.targetEditorId === editorId) {
                
                const command = message.data.command;
                addToLog(`Received focus command: ${command}`, 'info');
                
                // REMOVED: Focus commands are now handled by visibility change handler
                // This avoids duplicate restart logic and conflicts
                addToLog(`Focus command ignored - handled by visibility change instead: ${command}`, 'debug');
            }
        };
        
        // Use the global bridge instead of direct chrome.runtime.onMessage listener
        globalMessageHandler = handleMessage;
        
        return () => {
            globalMessageHandler = null;
        };
    }, [editorId, isSupported, permissionStatus, isListening, startListening, stopListening, addToLog]);

    // --- Update Status Message based on State ---
    useEffect(() => {
        addToLog(`Status Effect: isSupported=${isSupported}, permission=${permissionStatus}, isListening=${isListening}, wasIntentional=${wasListeningIntentionallyRef.current}`, 'debug');
        if (!isSupported) {
            setStatusMessage('Speech recognition not supported by this browser.');
        } else if (permissionStatus === 'denied') {
            if (permissionDeniedCount > 1) {
                // Likely permanently denied
                setStatusMessage('Microphone access blocked. Please enable it in your browser settings.');
            } else {
                setStatusMessage('Microphone permission denied. Click the mic icon to try again.');
            }
        } else if (isTranscribing) {
            setStatusMessage('Transcribing...');
        } else if (!isTranscribing) {
            setStatusMessage('Transcription disabled. Click mic to enable.');
        } else if (permissionStatus === 'prompt') {
            setStatusMessage('Click the mic icon to grant microphone permission.');
        }
    }, [isListening, isSupported, permissionStatus, addToLog, isTranscribing, permissionDeniedCount]);


    // --- SIMPLIFIED Tab Focus/Blur Handlers (Cases #3 and #4) ---
    useEffect(() => {
        let stopListeningTimeout: NodeJS.Timeout | null = null;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Case #4: Stop when page loses focus (user goes to another tab/app)
                // Add a short delay to handle quick switches to extension pages
                if (isListening && !stopListeningTimeout) {
                    addToLog('Page became hidden: Scheduling stop listening in 2 seconds', 'info');
                    
                    stopListeningTimeout = setTimeout(() => {
                        // Only stop if still hidden after delay
                        if (document.hidden && isListening) {
                            addToLog('Page still hidden after delay: Stopping listening', 'info');
                            wasListeningIntentionallyRef.current = false;
                            stopListening();
                        }
                        stopListeningTimeout = null;
                    }, 2000); // 2 second delay for extension page switches
                }
            } else {
                // Case #3: Start when user returns to tab (ALWAYS start listening when page has focus)
                addToLog('Page became visible: Setting listening as intentional', 'info');
                
                // Cancel any pending stop
                if (stopListeningTimeout) {
                    clearTimeout(stopListeningTimeout);
                    stopListeningTimeout = null;
                    addToLog('Canceled scheduled stop', 'debug');
                }
                
                wasListeningIntentionallyRef.current = true; // ALWAYS intentional when page has focus
                
                if (!isListening && isSupported && permissionStatus === 'granted') {
                    addToLog('Page became visible: Starting listening', 'info');
                    startListening();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // Clean up timeout on unmount
            if (stopListeningTimeout) {
                clearTimeout(stopListeningTimeout);
            }
        };
    }, [isSupported, permissionStatus, isListening, startListening, stopListening, addToLog]);


    // --- Processing Transcript ---
    const processTranscriptSegment = useCallback((segment, isFirstSegmentOfResult = false, textBeforeSegment = '') => {
        const words = segment.toLowerCase().split(' ');
        let processedWords = [];
        let currentIsAllCaps = isAllCaps; // Use state at time of processing
        let literallyMode = false;

        // Capitalization check based on text *immediately* before where this segment starts
        let requiresCapitalization =
            textBeforeSegment === '' ||
            /[.!?\n]\s*$/.test(textBeforeSegment);

        addToLog(`Processing segment: "${segment}". Initial cap: ${requiresCapitalization}. AllCaps: ${currentIsAllCaps}`, 'debug', {textBeforeSegment});


        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (!word) continue;

            // --- Command Handling ---
            if (literallyMode) {
                processedWords.push(currentIsAllCaps ? word.toUpperCase() : word);
                literallyMode = false;
                requiresCapitalization = false; // Word typed literally doesn't reset sentence start
                continue;
            }
            if (word === 'literally') { literallyMode = true; continue; }
            if (word === 'all' && words[i+1] === 'caps') { currentIsAllCaps = true; setIsAllCaps(true); i++; addToLog('Command: ALL CAPS ON', 'debug'); continue; }
            if (word === 'end' && words[i+1] === 'caps') { currentIsAllCaps = false; setIsAllCaps(false); i++; addToLog('Command: ALL CAPS OFF', 'debug'); continue; }

            // --- Punctuation Handling ---
            const punctuationInfo = PUNCTUATION_MAP[word]; // Use the correct map
            if (punctuationInfo) {
                const symbol: string = punctuation[punctuation.findIndex(([name]) => name === word)][1] as string; // Get symbol and assert type
                addToLog(`Command: Punctuation "${word}" -> "${symbol}"`, 'debug');

                let needsSpaceAfter = false;
                // Remove trailing space from previous word if needed (no space BEFORE symbol)
                if (processedWords.length > 0 && !punctuationInfo.before && /\s$/.test(processedWords[processedWords.length - 1])) {
                    processedWords[processedWords.length - 1] = processedWords[processedWords.length - 1].trimEnd();
                }
                // Add space before if needed (rare for punctuation but check map)
                if (punctuationInfo.before && processedWords.length > 0 && !/\s$/.test(processedWords[processedWords.length - 1])) {
                    processedWords.push(' ');
                }
                needsSpaceAfter = punctuationInfo.after;

                processedWords.push(symbol);

                // Determine if next word needs capitalization based on this punctuation
                requiresCapitalization = ['.', '!', '?'].includes(symbol);

                if (needsSpaceAfter) {
                     processedWords.push(' ');
                     // If space added, next word doesn't need cap unless punctuation dictates it
                } else {
                     // If no space added after (e.g., closing bracket), next word doesn't automatically need cap
                     requiresCapitalization = false; // Adjusted: Assume no cap if no space follows
                }
                continue;
            }

            // --- Control Word Handling ---
            const control = CONTROL_WORDS[word];
             if (control === '\n') {
                addToLog(`Command: New Line`, 'debug');
                // Remove trailing space before newline
                if (processedWords.length > 0 && /\s$/.test(processedWords[processedWords.length - 1])) {
                    processedWords[processedWords.length - 1] = processedWords[processedWords.length - 1].trimEnd();
                }
                processedWords.push(control);
                requiresCapitalization = true; // Capitalize after newline
                continue;
            } else if (control) {
                 // Other control words (if any)
                 processedWords.push(control);
                 requiresCapitalization = false;
                 continue;
            }

            // --- Regular Word Processing ---
            let processedWord = word;
            if (currentIsAllCaps) {
                processedWord = word.toUpperCase();
            } else if (requiresCapitalization) {
                // Capitalize if it looks like a standard lowercase word start
                if (word.length > 0 && word[0] >= 'a' && word[0] <= 'z') {
                   processedWord = word.charAt(0).toUpperCase() + word.slice(1);
                   addToLog(`Capitalized "${word}" -> "${processedWord}"`, 'debug');
                }
            }
            // Whether we capitalized or not, the *next* word doesn't need forced capitalization unless a rule triggers later
            requiresCapitalization = false;

            // Add space *after* the word
            processedWords.push(processedWord + ' ');
        }

        // Join and clean up potentially multiple spaces or trailing space from last word
        let result = processedWords.join('').replace(/\s+/g, ' ').trimEnd();

        addToLog(`Segment processing result: "${result}"`, 'debug');
        return result;
    }, [isAllCaps, addToLog]);


    // --- Event Handlers ---
    handleResultRef.current = useCallback((event) => {
        let interimTranscript = '';
        let finalTranscriptSegment = ''; // Accumulate final parts *within this event*

        const textarea = textAreaRef.current;
        if (!textarea) {
            addToLog("handleResult: Textarea ref not found!", 'error');
            return;
        }
        const currentText = textarea.value; // Get fresh value

        // --- Process Results ---
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcript = result[0].transcript; // Assuming maxAlternatives=1

            if (result.isFinal) {
                 addToLog(`handleResult: Final transcript segment: "${transcript}"`, 'debug');
                 finalTranscriptSegment += transcript + ' '; // Append raw final segments
            } else {
                interimTranscript += transcript + ' '; // Append raw interim segments
            }
        }
        interimTranscript = interimTranscript.trim();
        finalTranscriptSegment = finalTranscriptSegment.trim();

        // --- Check for Commands ---
        if (finalTranscriptSegment) {
            const lowerFinal = finalTranscriptSegment.toLowerCase().trim();
            
            // Handle command words
            if (lowerFinal === 'transcribe') {
                addToLog('Command detected: "Transcribe". Starting transcription.', 'info');
                setIsTranscribing(true);
                interimRangeRef.current = { start: null, end: null };
                return;
            } 
            else if (lowerFinal === 'stop') {
                addToLog('Command detected: "Stop". Stopping transcription.', 'info');
                setIsTranscribing(false);
                interimRangeRef.current = { start: null, end: null };
                return;
            }
            else if (lowerFinal === 'send') {
                addToLog('Command detected: "Send". Submitting text.', 'info');
                if (text.trim().toLowerCase() === 'help') {
                    onShowHelp();
                } else {
                    finalOnSubmit(text);
                }
                interimRangeRef.current = { start: null, end: null };
                return;
            }
            else if (lowerFinal === 'back') {
                addToLog('Command detected: "Back". Deleting last word.', 'info');
                const cursorPos = textarea.selectionStart;
                
                // Find the last word before cursor
                const textBeforeCursor = currentText.substring(0, cursorPos);
                const lastWordMatch = textBeforeCursor.match(/\S+\s*$/);
                
                if (lastWordMatch) {
                    const lastWordStart = textBeforeCursor.lastIndexOf(lastWordMatch[0]);
                    const newText = currentText.substring(0, lastWordStart) + currentText.substring(cursorPos);
                    setText(newText);
                    
                    // Update cursor position
                    setTimeout(() => {
                        if (textAreaRef.current) {
                            textAreaRef.current.value = newText;
                            textAreaRef.current.setSelectionRange(lastWordStart, lastWordStart);
                        }
                    }, 0);
                }
                
                interimRangeRef.current = { start: null, end: null };
                return;
            }
        }

        // If not transcribing, don't process or insert any text
        if (!isTranscribing) {
            addToLog('Not transcribing, ignoring transcript.', 'debug');
            return;
        }

        // --- Determine Range for Replacement ---
        let replaceStart: number;
        let replaceEnd: number;

        if (interimRangeRef.current.start === null) {
            // Start of a new utterance, use current cursor/selection
            replaceStart = textarea.selectionStart;
            replaceEnd = textarea.selectionEnd; // Use selection end in case user selected text
            interimRangeRef.current.start = replaceStart;
            interimRangeRef.current.end = replaceEnd; // Initial range covers selection
            addToLog(`handleResult: New utterance detected. Initial range [${replaceStart}, ${replaceEnd}]`, 'debug');
        } else {
            // Continuing utterance, use stored range of last interim insert
            replaceStart = interimRangeRef.current.start;
            replaceEnd = interimRangeRef.current.end ?? replaceStart; // Fallback if end is null
            addToLog(`handleResult: Continuing utterance. Replacing range [${replaceStart}, ${replaceEnd}]`, 'debug');
        }

        // Ensure valid range within current text length
        replaceStart = Math.max(0, Math.min(replaceStart, currentText.length));
        replaceEnd = Math.max(replaceStart, Math.min(replaceEnd, currentText.length));

        // --- Apply Changes ---
        const textBefore = currentText.substring(0, replaceStart);
        const textAfter = currentText.substring(replaceEnd);

        let newText = currentText;
        let newCursorPos = textarea.selectionStart; // Default to current

        if (finalTranscriptSegment) {
            // Process final segment first if available
            const processedFinal = processTranscriptSegment(finalTranscriptSegment, true, textBefore);
            // Add a space if this is the first segment after restarting transcription
            const needsSpace = textBefore.length > 0 && !textBefore.endsWith(' ');
            newText = textBefore + (needsSpace ? ' ' : '') + processedFinal + textAfter;
            newCursorPos = replaceStart + (needsSpace ? 1 : 0) + processedFinal.length;

            addToLog(`handleResult: Applying final text. New length: ${newText.length}, Cursor: ${newCursorPos}`, 'debug');

            // Final result means this utterance is done, reset the range for the next one
            interimRangeRef.current = { start: null, end: null };
            finalProcessedTranscriptRef.current += processedFinal + ' '; // Optional: Accumulate final text

        } else if (interimTranscript) {
            // Process interim segment if no final segment in this event
            const processedInterim = processTranscriptSegment(interimTranscript, interimRangeRef.current.start === textarea.selectionStart, textBefore);
             // Add a space if this is the first segment after restarting transcription
             const needsSpace = textBefore.length > 0 && !textBefore.endsWith(' ');
             newText = textBefore + (needsSpace ? ' ' : '') + processedInterim + textAfter;
             newCursorPos = replaceStart + (needsSpace ? 1 : 0) + processedInterim.length;

             addToLog(`handleResult: Applying interim text. New length: ${newText.length}, Cursor: ${newCursorPos}`, 'debug');

            // Update the end of the interim range for the *next* replacement
            interimRangeRef.current.end = newCursorPos;
        }

        // --- Update State and DOM ---
        if (newText !== currentText) {
            setText(newText); // Update React state
            onChange(newText); // Notify parent of change

            // Use setTimeout to ensure cursor/scroll update happens after DOM update
             setTimeout(() => {
                 if (textAreaRef.current) {
                     textAreaRef.current.value = newText; // Ensure DOM sync if React update is slow
                     textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                     textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight; // Scroll to bottom
                     addToLog(`handleResult: Cursor set to ${newCursorPos}`, 'debug');
                 }
             }, 0);
        } else {
            addToLog(`handleResult: No change in text.`, 'debug');
        }

    }, [processTranscriptSegment, setText, addToLog, isAllCaps, setIsTranscribing, isTranscribing, finalOnSubmit, onShowHelp, onChange, text]);

    handleErrorRef.current = useCallback((event) => {
        addToLog(`handleError: ${event.error}`, 'error', event.message);
         let userMessage = `Speech error: ${event.error}`;
         // Handle specific errors if needed for user feedback
         if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
             userMessage = 'Microphone permission denied.';
             // Increment the denied counter to track repeated denials
             setPermissionDeniedCount(prev => prev + 1);
             // State already updated by permission listener/hook
         } else if (event.error === 'no-speech') {
             userMessage = 'No speech detected. Listening stopped.';
             // Let onEnd handle state changes naturally unless specific action needed
         } else if (event.error === 'network') {
             userMessage = 'Network error during speech recognition.';
         } else if (event.error === 'audio-capture') {
             userMessage = 'Microphone error.';
         } else if (event.error === 'aborted') {
              userMessage = 'Listening stopped.'; // Common after manual stop or silence
         } else if (event.error === 'start-failed') {
             userMessage = `Mic start failed (${event.message || ''}). Try again.`;
             // Ensure internal state reflects failure if startListening didn't catch it
             wasListeningIntentionallyRef.current = false; // Failed start wasn't intentional listening
             if (manualStartTimerRef.current) clearTimeout(manualStartTimerRef.current);
             justManuallyStartedRef.current = false;
             // Note: isListening should already be false from startListening's catch block
         } else {
             userMessage = `Unknown speech error (${event.error}). Listening stopped.`;
         }
        setStatusMessage(userMessage); // Update user-facing message

        // Crucially, ensure intent flag is false on most errors so restart doesn't happen
        if (event.error !== 'no-speech') { // 'no-speech' is often recoverable/expected
            wasListeningIntentionallyRef.current = false;
             if (manualStartTimerRef.current) clearTimeout(manualStartTimerRef.current);
             justManuallyStartedRef.current = false;
        }

        // Reset insertion range on significant errors
        if (event.error !== 'no-speech') {
           interimRangeRef.current = { start: null, end: null };
        }

    }, [addToLog, setStatusMessage]); // Dependencies


    handleEndRef.current = useCallback(async () => {
        addToLog(`handleEnd: Recognition service ended. Was intentional: ${wasListeningIntentionallyRef.current}, Page hidden: ${document.hidden}`, 'info');

        // If it ended, any manual start grace period is over.
        if (manualStartTimerRef.current) clearTimeout(manualStartTimerRef.current);
        justManuallyStartedRef.current = false;

        // If the service ends, clear the current interim range tracking.
        interimRangeRef.current = { start: null, end: null };

        // SIMPLIFIED RESTART LOGIC: Always restart if page is visible and listening was intentional
        if (wasListeningIntentionallyRef.current && !document.hidden) {
            addToLog('Service ended but page is visible and listening was intentional - attempting restart', 'info');
            
            // Add small delay to avoid immediate restart conflicts
            setTimeout(() => {
                // Re-check basic conditions for restart (isListening should now be false)
                if (isSupported && permissionStatus === 'granted' && !isListening && !document.hidden) {
                    addToLog('Auto restart: Starting listening now', 'info');
                    wasListeningIntentionallyRef.current = true; // Keep intent flag true
                    startListening();
                } else {
                    addToLog(`Auto restart: Conditions not met - supported:${isSupported}, permission:${permissionStatus}, listening:${isListening}, hidden:${document.hidden}`, 'warn');
                    // Only reset intent if page is hidden, otherwise keep trying
                    if (document.hidden) {
                        wasListeningIntentionallyRef.current = false;
                    }
                }
            }, 100);
        } else {
            addToLog(`Service ended - not restarting. Intentional: ${wasListeningIntentionallyRef.current}, Hidden: ${document.hidden}`, 'info');
            if (document.hidden) {
                wasListeningIntentionallyRef.current = false;
            }
        }

    }, [addToLog, isSupported, permissionStatus, isListening, startListening]);


    // --- Effect for Initial Setup with Global State ---
    useEffect(() => {
        addToLog('===== SpeechInput component mounted =====', 'debug');
        addToLog('Component Mounted', 'info');
        
        // ALWAYS set listening as intentional when component mounts (page loads)
        if (!document.hidden) {
            wasListeningIntentionallyRef.current = true;
            addToLog('Initial setup: Setting listening as intentional (page visible)', 'info');
        }
        
        if (isSupported) {
            if (permissionStatus === 'granted') {
                addToLog('Initial Effect: Permission granted, starting listening if not hidden', 'info');
                
                // Start listening immediately if page is visible and basic conditions are met
                if (!document.hidden && !isListening) {
                    addToLog('Initial Effect: Starting listening on page load', 'info');
                    // Add a small delay to avoid race conditions with DOM readiness
                    setTimeout(() => {
                        if (!isListening && !document.hidden) {
                            addToLog('Actually calling startListening now', 'debug');
                            startListening(); // Start the service
                        }
                    }, 50);
                }
            } else if (permissionStatus === 'prompt') {
                setStatusMessage('Click the mic icon to grant permission.');
            } else if (permissionStatus === 'denied') {
                setStatusMessage('Microphone permission denied. Click the mic icon to try again.');
            } else if (permissionStatus === 'pending' || permissionStatus === null) {
                addToLog('Initial Effect: Waiting for permission status...', 'info');
                setStatusMessage('Checking microphone permission...');
            }
        } else {
            addToLog('Speech Recognition NOT supported', 'warn');
            setStatusMessage('Speech recognition not supported by this browser.');
        }
        
        // Cleanup function for component unmount
        return () => {
            addToLog('Component Unmounting', 'info');
            // Ensure listening stops on unmount if running
            if (isListening) {
                wasListeningIntentionallyRef.current = false; // Prevent restart attempts after unmount
                if (manualStartTimerRef.current) clearTimeout(manualStartTimerRef.current);
                justManuallyStartedRef.current = false;
                stopListening();
            }
        };
    }, [isSupported, permissionStatus, addToLog, startListening, stopListening, isListening]); // Removed globalSpeechState dependency

    // --- Periodic Status Check for Debugging ---
    useEffect(() => {
        const interval = setInterval(() => {
            addToLog('Status Check from Component', 'debug', {
                isListening,
                isSupported,
                permissionStatus,
                wasIntentional: wasListeningIntentionallyRef.current,
                pageHidden: document.hidden,
                isTranscribing
            });
        }, 5000); // Every 5 seconds

        return () => clearInterval(interval);
    }, [isListening, isSupported, permissionStatus, isTranscribing, addToLog]);


    // --- User Interaction Handlers ---
    const handleKeyDown = (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            addToLog(`Submit triggered (Cmd/Ctrl+Enter)`, 'info');
            if (text.trim().toLowerCase() === 'help') {
                onShowHelp();
            } else {
                finalOnSubmit(text);
                // Optional: Clear text after submit?
                // setText('');
            }
        }
    };

    // Function to attempt to request microphone permission
    const requestMicrophonePermission = async () => {
        addToLog('Attempting to request microphone permission', 'info');
        
        // First try using the MediaDevices API to trigger the permission prompt
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(async (stream) => {
                    addToLog('Microphone permission granted via getUserMedia', 'info');
                    // Stop all tracks to release the microphone
                    stream.getTracks().forEach(track => track.stop());
                    
                    try {
                        // Enable global transcription and listening state
                        await setSpeechGlobalState({
                            isTranscribing: true,
                            isListening: true,
                            autoRestart: true
                        });
                        
                        // Now try to start the recognition service
                        wasListeningIntentionallyRef.current = true;
                        startListening();
                    } catch (error) {
                        addToLog(`Error enabling global speech state: ${error}`, 'error');
                    }
                })
                .catch(err => {
                    addToLog(`Failed to get microphone permission: ${err.name}`, 'error', err);
                    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                        setPermissionDeniedCount(prev => prev + 1);
                        if (permissionDeniedCount > 1) {
                            // Show instructions for enabling microphone in browser settings
                            showBrowserSpecificPermissionInstructions();
                        }
                    }
                });
        } else {
            // Fallback to using SpeechRecognition directly
            addToLog('MediaDevices API not available, trying SpeechRecognition directly', 'warn');
            
            try {
                // Enable global transcription and listening state
                await setSpeechGlobalState({
                    isTranscribing: true,
                    isListening: true,
                    autoRestart: true
                });
                
                wasListeningIntentionallyRef.current = true;
                startListening();
            } catch (error) {
                addToLog(`Error enabling global speech state: ${error}`, 'error');
            }
        }
    };

    // Function to show browser-specific instructions for enabling microphone
    const showBrowserSpecificPermissionInstructions = () => {
        const isChrome = navigator.userAgent.indexOf('Chrome') !== -1;
        const isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
        const isSafari = navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') === -1;
        
        let instructions = 'To enable microphone access:';
        
        if (isChrome) {
            instructions += '\n1. Click the lock/info icon in the address bar\n2. Select "Site Settings"\n3. Change Microphone permission to "Allow"';
        } else if (isFirefox) {
            instructions += '\n1. Click the lock/info icon in the address bar\n2. Click "More Information"\n3. Go to "Permissions" tab\n4. Change "Use the Microphone" to "Allow"';
        } else if (isSafari) {
            instructions += '\n1. Open Safari Preferences\n2. Go to "Websites" tab\n3. Select "Microphone" on the left\n4. Find this website and set permission to "Allow"';
        } else {
            instructions += '\nCheck your browser settings to allow microphone access for this site.';
        }
        
        // Show instructions in status message and optionally in an alert
        setStatusMessage('Microphone blocked. Check browser settings.');
        alert(instructions);
    };

    const handleToggleListen = async () => {
        if (!isSupported) {
             addToLog('Toggle ignored: Not supported', 'warn');
             return;
        }
        
        // If permission is denied, try to request it again
        if (permissionStatus === 'denied') {
            addToLog('Toggle: Permission denied. Attempting to re-request...', 'info');
            requestMicrophonePermission();
            return;
        }
        
        // If permission is prompt, request it
        if (permissionStatus === 'prompt') {
            addToLog('Toggle: Permission is prompt. Requesting...', 'info');
            requestMicrophonePermission();
            return;
        }

        // Toggle the global transcribing state (only if permission is granted)
        const newTranscribingState = !isTranscribing;
        addToLog(`Toggle: Setting global transcribing to ${newTranscribingState}.`, 'info');
        
        try {
            // Update global state instead of local state
            await setSpeechGlobalState({ 
                isTranscribing: newTranscribingState,
                isListening: newTranscribingState, // If transcribing is enabled, listening should be enabled too
                autoRestart: true
            });
            
            // Reset tracking for new utterance/session if starting transcription
            if (newTranscribingState) {
                finalProcessedTranscriptRef.current = '';
                interimRangeRef.current = { start: null, end: null };
                
                // If we're not already listening, start listening
                if (!isListening && isSupported && permissionStatus === 'granted') {
                    wasListeningIntentionallyRef.current = true;
                    startListening();
                }
            } else {
                // If disabling transcription, stop listening intentionally
                wasListeningIntentionallyRef.current = false;
                if (isListening) {
                    stopListening();
                }
            }
        } catch (error) {
            addToLog(`Error updating global speech state: ${error}`, 'error');
        }
    };

    // Handle textarea focus
    const handleTextareaFocus = async () => {
        addToLog('Textarea focused', 'debug');
        
        try {
            // Update focus state in global registry
            await setSpeechEditorFocus(editorId, true);
            
            // Don't directly start listening here - let the consolidated auto-restart effect handle it
            // This prevents multiple restart attempts and conflicts between effects
            
        } catch (error) {
            addToLog(`Error setting editor focus: ${error}`, 'error');
        }
    };

    // Handle textarea blur
    const handleTextareaBlur = async () => {
        addToLog('Textarea blurred', 'debug');
        
        try {
            // Update focus state in global registry
            await setSpeechEditorFocus(editorId, false);
        } catch (error) {
            addToLog(`Error clearing editor focus: ${error}`, 'error');
        }
        
        // No need to stop recognition service, just update UI state
        // We keep recognition running in the background as per requirements
    };

    const handleSelectionChange = () => {
        const textarea = textAreaRef.current;
        if (!textarea) return;

        const cursorPos = textarea.selectionStart;
        // Update cursor position ref if changed
        if (cursorPos !== lastCursorPosRef.current) {
            lastCursorPosRef.current = cursorPos;
            addToLog(`Cursor position changed: ${cursorPos}`, 'debug');

            // Update mic position based on cursor
            const value = textarea.value;
            const halfwayPoint = value.length / 2;
            const newPosition = cursorPos > halfwayPoint ? 'top' : 'bottom';
            if (newPosition !== micPosition) {
                setMicPosition(newPosition);
                addToLog(`Mic position changed: ${newPosition}`, 'debug');
            }
        }
    };

     const handleCopyDebugInfo = async () => {
        addToLog('Copy Debug Info button clicked', 'info');
        const logContent = logBuffer.join('\n');
        const textContent = text;
        const combinedInfo = `--- LOGS ---\n${logContent}\n\n--- TEXT AREA CONTENT ---\n${textContent}`;

        try {
            await navigator.clipboard.writeText(combinedInfo);
            addToLog('Debug info copied to clipboard.', 'info');
            setStatusMessage('Debug info copied!');
            setLogBuffer([]); // Clear logs after copying
             setTimeout(() => setStatusMessage( isListening ? 'Listening...' : 'Mic idle.'), 2000); // Reset status after 2s
        } catch (err) {
             addToLog('Failed to copy debug info to clipboard', 'error', err);
             setStatusMessage('Error copying debug info.');
             setTimeout(() => setStatusMessage( isListening ? 'Listening...' : 'Mic idle.'), 2000);
        }
    };


    // --- Rendering ---
    const getMicButtonClass = () => {
        let baseClass = 'mic-button';
        if (!isSupported) return `${baseClass} disabled`;
        if (permissionStatus === 'denied') return `${baseClass} denied`;
        if (isTranscribing) return `${baseClass} listening`; // Use isTranscribing for icon state
        return `${baseClass} idle`;
    }

    // Update text state and call onChange
    const updateText = useCallback((newText: string) => {
        setText(newText);
        onChange(newText);
    }, [onChange]);

    // Update textarea onChange handler
    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        addToLog('Text changed via keyboard/input event', 'debug');
        updateText(e.target.value);
        // When user types manually, reset the interim range as it's no longer valid
        if (interimRangeRef.current.start !== null) {
            addToLog('Manual typing detected, resetting interim range.', 'debug');
            interimRangeRef.current = { start: null, end: null };
        }
        // Also update selection state immediately
        handleSelectionChange();
    }, [updateText, addToLog]);

    return (
        <div className="speech-input-container">
            <textarea
                ref={textAreaRef}
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                onFocus={handleTextareaFocus}
                onBlur={handleTextareaBlur}
                // Track selection/cursor changes accurately
                onSelect={handleSelectionChange}
                onClick={handleSelectionChange} // Handle clicks as well
                onKeyUp={handleSelectionChange}  // Handle cursor movement via keys
                placeholder="Enter text here, or use the microphone..."
                rows={10}
                cols={50}
                disabled={!isSupported}
            />
            <button
                type="button"
                onClick={handleToggleListen}
                className={getMicButtonClass()}
                data-tooltip={
                    permissionStatus === 'denied' 
                        ? 'Click to request microphone permission' 
                        : (isTranscribing ? 'Stop Transcribing (Mic On)' : 'Start Transcribing (Mic Off)')
                }
                aria-label={
                    permissionStatus === 'denied' 
                        ? 'Click to request microphone permission' 
                        : (isTranscribing ? 'Stop Transcribing (Mic On)' : 'Start Transcribing (Mic Off)')
                }
                disabled={!isSupported}
                style={{
                    position: 'absolute',
                    right: '10px',
                    ...(micPosition === 'top' ? { top: '10px' } : { bottom: '45px' }), // Adjusted bottom to make space for debug btn
                    width: '20px', // Reduced from 40px
                    height: '20px', // Reduced from 40px
                    borderRadius: '50%',
                    border: 'none',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    fontSize: '10px', // Reduced from 20px
                    padding: '0',
                    zIndex: 1, // Ensure it's above status/debug button potentially
                }}
            >
                {/* SVG Icon */}
                 <svg
                    viewBox="0 0 24 24"
                    width="12" // Reduced from 24
                    height="12" // Reduced from 24
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                        transition: 'transform 0.2s ease',
                        transform: isTranscribing ? 'scale(1.1)' : 'scale(1)'
                    }}
                >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
            </button>

            {/* Status Message and Debug Button Area */}
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '5px' }}>
                <p className="status-message" style={{ margin: 0, flexGrow: 1, marginRight: '10px' }}>{statusMessage}</p>
                <button
                    type="button"
                    onClick={handleCopyDebugInfo}
                    data-tooltip="Copy Debug Logs & Text"
                    aria-label="Copy Debug Logs & Text"
                     style={{
                        padding: '5px 10px',
                        fontSize: '0.8rem',
                        cursor: 'pointer'
                     }}
                >
                    Debug
                </button>
             </div>


            {/* Inline Styles - Consider moving to a CSS file */}
            <style>{`
                .speech-input-container {
                    position: relative;
                    display: block; /* Changed from inline-block for full width */
                    width: 100%;
                }
                .speech-input-container textarea {
                    width: 100%; /* Ensure it takes full width */
                    box-sizing: border-box; /* Include padding/border in width */
                    padding: 10px;
                    padding-right: 60px; /* Space for mic button */
                    font-family: sans-serif;
                    font-size: 1rem;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    resize: vertical;
                    min-height: 100px;
                }
                .speech-input-container textarea:focus {
                    outline: none;
                    border-color: #007AFF;
                    box-shadow: 0 0 0 2px rgba(0,122,255,0.2);
                }
                .status-message {
                    font-size: 0.9rem;
                    color: #555;
                    /* margin-top: 5px; */ /* Handled by flex container now */
                    min-height: 1.2em;
                    line-height: 1.2em;
                }
                .mic-button {
                    background-color: #cccccc; /* Idle grey */
                }
                .mic-button:hover:not(:disabled) {
                    transform: scale(1.05);
                    box-shadow: 0 3px 6px rgba(0,0,0,0.3);
                }
                .mic-button:active:not(:disabled) {
                    transform: scale(0.95);
                }
                .mic-button.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    background-color: #ccc !important;
                }
                .mic-button.denied {
                    background-color: #ff4444 !important; /* Red for denied */
                }
                 .mic-button.idle {
                     background-color: #007AFF; /* Blue for idle/ready */
                 }
                .mic-button.listening {
                    background-color: #4cd964 !important; /* Green for listening */
                    animation: pulse 1.5s infinite ease-in-out;
                }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(76, 217, 100, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(76, 217, 100, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(76, 217, 100, 0); }
                }
            `}</style>
        </div>
    );
});

// Export the demo parent or the main input component as needed
export default SpeechComponent;
// export { SpeechInput }; // Alternatively export only the input
