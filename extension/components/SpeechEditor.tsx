import React, { useState, useEffect, useRef, useCallback } from 'react';

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

// --- Helper Function for Timestamp ---
const getTimestamp = () => {
    const now = new Date();
    return `${now.toLocaleTimeString()}.${String(now.getMilliseconds()).padStart(3, '0')}`;
}

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
            // Important: Don't set isListening false here directly.
            // Let the parent component manage state via the onEnd callback
            // based on its own logic (wasListeningIntentionallyRef).
            if (onEnd) onEnd();
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
    }, [onResult, onError, onEnd, log]); // log is stable due to useCallback

    const startListening = useCallback(() => {
        if (recognitionRef.current && !isListening && isSupported) {
             try {
                 log("startListening: Attempting to start...");
                 recognitionRef.current.start();
                 log("startListening: recognition.start() called.");
                 setIsListening(true);
                 // Don't assume pending, wait for events or errors
              } catch(e) {
                 log("startListening: Error during start", 'error', e);
                 // Handle cases like starting too soon after stopping, or API busy
                 if (onError) onError({error: 'start-failed', message: e.message});
                 setIsListening(false); // Ensure state reflects failure
             }
        } else {
             if (!isSupported) log("startListening: Not starting, not supported", 'warn');
             if (isListening) log("startListening: Not starting, already listening", 'warn');
             if (!recognitionRef.current) log("startListening: Not starting, recognition instance not available", 'error');
        }
    }, [isListening, isSupported, onError, log]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current && isListening) {
             try {
                 log("stopListening: Attempting to stop...");
                 // Use abort() for a potentially quicker stop and to discard results
                 recognitionRef.current.abort();
                 // recognitionRef.current.stop(); // stop() waits for result processing
                 log("stopListening: recognition.abort() called.");
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
             if (!isListening) log("stopListening: Not stopping, not listening", 'warn');
             if (!recognitionRef.current) log("stopListening: Not stopping, recognition instance not available", 'error');
        }
    }, [isListening, onError, log]); // log added


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


// --- The Main Component ---
export const SpeechInput = ({
    onSubmit = (text) => console.log('Submitted:', text), // Keep console for demo submit
    onShowHelp = () => alert('Help: ...'), // Provide default help message
    initialText = '',
}) => {
    const [text, setText] = useState(initialText);
    const [isAllCaps, setIsAllCaps] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Initializing...');
    const [micPosition, setMicPosition] = useState<'top' | 'bottom'>('bottom');
    const [logBuffer, setLogBuffer] = useState<string[]>([]); // Store logs

    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const finalProcessedTranscriptRef = useRef(''); // Keep for potential future use/debug
    // --- Refactored Insertion Refs ---
    const interimRangeRef = useRef<{ start: number | null, end: number | null }>({ start: null, end: null });
    const lastCursorPosRef = useRef<number>(0);
    const wasListeningIntentionallyRef = useRef(false); // Track user intent
    const justManuallyStartedRef = useRef(false); // Track recent manual start attempt
    const manualStartTimerRef = useRef<NodeJS.Timeout | null>(null); // Timer for manual start grace period


    // --- Logging Function ---
    const addToLog = useCallback((message: string, level: string = 'info', data: any = undefined) => {
        const timestamp = getTimestamp();
        let logEntry = `${timestamp} [${level.toUpperCase()}] ${message}`;
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
    }, []); // Empty dependency array - this function relies only on getTimestamp and setLogBuffer


    // --- Speech Recognition Hook (Declared Early) ---
    const handleResultRef = useRef(null);
    const handleErrorRef = useRef(null);
    const handleEndRef = useRef(null);

    const {
        isListening,
        isSupported,
        permissionStatus,
        startListening,
        stopListening,
        // setIsListening, // Avoid using the direct setter if possible
    } = useSpeechRecognition({
        onResult: (event) => handleResultRef.current?.(event),
        onError: (event) => handleErrorRef.current?.(event),
        onEnd: () => handleEndRef.current?.(),
        onLog: addToLog, // Pass the logging function to the hook
    });

     // --- Update Status Message based on State ---
     useEffect(() => {
        if (!isSupported) {
            setStatusMessage('Speech recognition not supported.');
        } else if (permissionStatus === 'denied') {
            setStatusMessage('Microphone permission denied.');
        } else if (isListening) {
            setStatusMessage('Listening...');
        } else if (permissionStatus === 'prompt') {
             setStatusMessage('Click the mic icon to grant permission.');
        } else {
            // Not listening, permission granted/prompt
            setStatusMessage('Mic idle. Click to start listening.');
        }
    }, [isListening, isSupported, permissionStatus]);


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
            const punctuation = PUNCTUATION_MAP[word];
            if (punctuation) {
                addToLog(`Command: Punctuation "${word}" -> "${punctuation}"`, 'debug');
                const spacing = PUNCTUATION_SPACING[word];
                let wordToAdd = punctuation;
                let needsSpaceAfter = false;
                if (spacing) {
                    // Remove trailing space from previous word if needed
                    if (processedWords.length > 0 && !spacing.before && /\s$/.test(processedWords[processedWords.length - 1])) {
                        processedWords[processedWords.length - 1] = processedWords[processedWords.length - 1].trimEnd();
                    }
                    // Add space before if needed (uncommon for map but possible)
                    if (spacing.before && processedWords.length > 0 && !/\s$/.test(processedWords[processedWords.length - 1])) {
                        processedWords.push(' ');
                    }
                    needsSpaceAfter = spacing.after;
                }
                processedWords.push(wordToAdd);

                // Determine if next word needs capitalization based on this punctuation
                 requiresCapitalization = ['.', '!', '?'].includes(punctuation);

                if (needsSpaceAfter) {
                     processedWords.push(' ');
                     // If space added, next word doesn't need cap unless punctuation dictates it
                } else {
                     // If no space added after (e.g., closing bracket), next word doesn't automatically need cap
                     requiresCapitalization = false;
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
    }, [isAllCaps, addToLog]); // isAllCaps state, addToLog


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

        // --- Apply Changes ---
        const textBefore = currentText.substring(0, replaceStart);
        const textAfter = currentText.substring(replaceEnd);

        let newText = currentText;
        let newCursorPos = textarea.selectionStart; // Default to current

        if (finalTranscriptSegment) {
            // Process final segment first if available
            const processedFinal = processTranscriptSegment(finalTranscriptSegment, true, textBefore);
            newText = textBefore + processedFinal + textAfter;
            newCursorPos = replaceStart + processedFinal.length;

            addToLog(`handleResult: Applying final text. New length: ${newText.length}, Cursor: ${newCursorPos}`, 'debug');

            // Final result means this utterance is done, reset the range for the next one
            interimRangeRef.current = { start: null, end: null };
            finalProcessedTranscriptRef.current += processedFinal + ' '; // Optional: Accumulate final text

        } else if (interimTranscript) {
            // Process interim segment if no final segment in this event
            const processedInterim = processTranscriptSegment(interimTranscript, interimRangeRef.current.start === textarea.selectionStart, textBefore);
             newText = textBefore + processedInterim + textAfter;
             newCursorPos = replaceStart + processedInterim.length;

             addToLog(`handleResult: Applying interim text. New length: ${newText.length}, Cursor: ${newCursorPos}`, 'debug');

            // Update the end of the interim range for the *next* replacement
            interimRangeRef.current.end = newCursorPos;
        }

        // --- Update State and DOM ---
        if (newText !== currentText) {
            setText(newText); // Update React state

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

    }, [processTranscriptSegment, setText, addToLog]); // Dependencies

    handleErrorRef.current = useCallback((event) => {
        addToLog(`handleError: ${event.error}`, 'error', event.message);
         let userMessage = `Speech error: ${event.error}`;
         // Handle specific errors if needed for user feedback
         if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
             userMessage = 'Microphone permission denied.';
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


    handleEndRef.current = useCallback(() => {
        addToLog(`handleEnd: Recognition service ended. Was intentional: ${wasListeningIntentionallyRef.current}`, 'info');

        // This callback signifies the *actual* end of the service.
        // Now, update our component's view of the listening state.
        // It's crucial *not* to use setIsListening from the hook here,
        // as that might fight with the hook's own state management.
        // Instead, we rely on the fact that the service *has* stopped,
        // and decide whether to *restart* based on intent.

        // The `isListening` state will be checked in the restart effect.
        // We primarily manage the *intent* flag here.

        // If it ended, any manual start grace period is over.
         if (manualStartTimerRef.current) clearTimeout(manualStartTimerRef.current);
         justManuallyStartedRef.current = false;

         // If the service ends, clear the current interim range tracking.
         interimRangeRef.current = { start: null, end: null };


         // No! Don't set wasListeningIntentionallyRef false here unconditionally.
         // The restart effect *needs* this flag to be true if the stop was unintentional (e.g. silence).
         // It should only be set false by manual stop or critical errors.
         // wasListeningIntentionallyRef.current = false; // <-- REMOVE THIS

         // Trigger a state update indirectly via setStatusMessage to ensure effects depending on isListening run
         //setStatusMessage(prev => prev); // Or update based on wasListeningIntentionallyRef

         // We need a way to signal that the hook's internal isListening *should* be false now.
         // This is tricky without the setter. The hook *should* internally set its state false
         // before calling onEnd. Let's assume the hook handles its internal state correctly.


    }, [addToLog]); // Dependencies


    // --- Effect for Initial Setup ---
    useEffect(() => {
        addToLog('Component Mounted', 'info');
        if (isSupported) {
            if (permissionStatus === 'granted') {
                addToLog('Initial Effect: Permission granted.', 'info');
                // Optional: Automatically start listening on mount if desired
                // handleToggleListen(); // Or directly call start sequence
                // setStatusMessage('Click mic to start.'); // If not auto-starting
            } else if (permissionStatus === 'prompt') {
                 setStatusMessage('Click the mic icon to grant permission.');
            } else if (permissionStatus === 'denied') {
                setStatusMessage('Microphone permission denied.');
            }
        } else {
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
    }, [isSupported, permissionStatus, addToLog]); // Run only on support/permission change


    // --- Effect for Restarting Listening ---
    useEffect(() => {
         // This effect now reacts to the hook's `isListening` state.
        if (isSupported && permissionStatus === 'granted' && !isListening) {
            // We are supported, have permission, but are not currently listening.
            // Should we restart? Only if the last stop was *not* manual *and* not during manual start grace period.
             if (wasListeningIntentionallyRef.current && !justManuallyStartedRef.current) {
                addToLog(`Restart Effect: Conditions met. Restarting listen after delay... Intent: ${wasListeningIntentionallyRef.current}, JustStarted: ${justManuallyStartedRef.current}`, 'info');
                 // Use a timer to prevent rapid loops if `onEnd` fires constantly
                const timer = setTimeout(() => {
                    // Re-check conditions inside timer, state might have changed
                    if (isSupported && permissionStatus === 'granted' && !isListening && wasListeningIntentionallyRef.current && !justManuallyStartedRef.current) {
                         addToLog('Restart Effect: Timer fired. Calling startListening()', 'info');
                         startListening();
                         // We don't need to set intent=true here, it was already true
                     } else {
                          addToLog('Restart Effect: Timer fired, but conditions changed. Not restarting.', 'info');
                     }
                }, 500); // 500ms delay
                 return () => clearTimeout(timer);
            } else {
                 addToLog(`Restart Effect: Conditions NOT met for restart. Intent: ${wasListeningIntentionallyRef.current}, JustStarted: ${justManuallyStartedRef.current}`, 'debug');
            }
        }
    }, [isListening, isSupported, permissionStatus, startListening, addToLog]); // React to listening state


    // --- User Interaction Handlers ---
    const handleKeyDown = (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            addToLog(`Submit triggered (Cmd/Ctrl+Enter)`, 'info');
            if (text.trim().toLowerCase() === 'help') {
                onShowHelp();
            } else {
                onSubmit(text);
                // Optional: Clear text after submit?
                // setText('');
            }
        }
    };

    const handleToggleListen = () => {
        if (!isSupported) {
             addToLog('Toggle ignored: Not supported', 'warn');
             return;
        }
        if (permissionStatus === 'denied') {
             addToLog('Toggle ignored: Permission denied', 'warn');
              setStatusMessage('Microphone permission denied.');
             return;
        }
        if (permissionStatus === 'prompt') {
            addToLog('Toggle: Permission is prompt. Requesting via start...', 'info');
            // Starting will trigger the browser's permission prompt
        }

        if (isListening) {
            // --- STOP LISTENING ---
            addToLog('Toggle: User stopping listening.', 'info');
            // CRUCIAL: Set intent to false *before* calling stop
            wasListeningIntentionallyRef.current = false;
            // Clear any pending manual start grace period
            if (manualStartTimerRef.current) clearTimeout(manualStartTimerRef.current);
            justManuallyStartedRef.current = false;

            stopListening();
            // Status message update will happen via useEffect reacting to isListening change

        } else {
            // --- START LISTENING ---
            addToLog('Toggle: User starting listening.', 'info');
            // Reset tracking for new utterance/session
            finalProcessedTranscriptRef.current = '';
            interimRangeRef.current = { start: null, end: null };

            // Set flags for restart logic *before* starting
            wasListeningIntentionallyRef.current = true; // Mark intentional start
            justManuallyStartedRef.current = true;  // Mark we just manually started

            startListening(); // Attempt to start

            // Clear the 'just started' flag after a grace period
            // If startListening fails immediately, onError should clear it
             if (manualStartTimerRef.current) clearTimeout(manualStartTimerRef.current); // Clear previous timer just in case
             manualStartTimerRef.current = setTimeout(() => {
                justManuallyStartedRef.current = false;
                addToLog('Toggle: Manual start grace period ended.', 'debug');
             }, 750); // Grace period (e.g., 750ms) - adjust as needed

             // Status message update will happen via useEffect reacting to isListening change
        }
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
        if (isListening) return `${baseClass} listening`;
        return `${baseClass} idle`;
    }

    return (
        <div className="speech-input-container">
            <textarea
                ref={textAreaRef}
                value={text}
                onChange={(e) => {
                    addToLog('Text changed via keyboard/input event', 'debug');
                    setText(e.target.value);
                     // When user types manually, reset the interim range as it's no longer valid
                     if (interimRangeRef.current.start !== null) {
                        addToLog('Manual typing detected, resetting interim range.', 'debug');
                         interimRangeRef.current = { start: null, end: null };
                     }
                     // Also update selection state immediately
                     handleSelectionChange();
                }}
                onKeyDown={handleKeyDown}
                // Track selection/cursor changes accurately
                onSelect={handleSelectionChange}
                onClick={handleSelectionChange} // Handle clicks as well
                onKeyUp={handleSelectionChange}  // Handle cursor movement via keys
                placeholder="Enter text here, or use the microphone..."
                rows={10}
                cols={50}
                disabled={!isSupported || permissionStatus === 'denied'}
            />
            <button
                type="button"
                onClick={handleToggleListen}
                className={getMicButtonClass()}
                title={isListening ? 'Stop Listening (Mic On)' : 'Start Listening (Mic Off)'}
                disabled={!isSupported || permissionStatus === 'denied'}
                style={{
                    position: 'absolute',
                    right: '10px',
                    ...(micPosition === 'top' ? { top: '10px' } : { bottom: '45px' }), // Adjusted bottom to make space for debug btn
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: 'none',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    fontSize: '20px',
                    padding: '0',
                    zIndex: 1, // Ensure it's above status/debug button potentially
                }}
            >
                {/* SVG Icon */}
                 <svg
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{
                        transition: 'transform 0.2s ease',
                        transform: isListening ? 'scale(1.1)' : 'scale(1)'
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
                    title="Copy Debug Logs & Text"
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
};

// Export the demo parent or the main input component as needed
export default SpeechComponent;
// export { SpeechInput }; // Alternatively export only the input