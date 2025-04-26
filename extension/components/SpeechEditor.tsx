import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- Configuration ---
const PUNCTUATION_MAP = {
    period: '.',
    comma: ',',
    'question mark': '?',
    'exclamation point': '!',
    'exclamation mark': '!',
    exclamation: '!',
    colon: ':',
    semicolon: ';',
    hyphen: '-',
    dash: '-',
    ellipsis: '...',
    'open quote': '"',
    'close quote': '"',
    'single quote': "'",
    apostrophe: "'",
    'open paren': '(',
    'close paren': ')',
    'open bracket': '[',
    'close bracket': ']',
    'open brace': '{',
    'close brace': '}',
    // Add alternative spellings
    'question': '?',
    'questionmark': '?',
    'question-mark': '?',
    'question_mark': '?',
};

// Define spacing rules for punctuation
const PUNCTUATION_SPACING = {
    // No space before, space after
    'period': { before: false, after: true },
    'comma': { before: false, after: true },
    'question mark': { before: false, after: true },
    'exclamation point': { before: false, after: true },
    'exclamation mark': { before: false, after: true },
    exclamation: { before: false, after: true },
    colon: { before: false, after: true },
    semicolon: { before: false, after: true },
    // Space before, no space after
    'open quote': { before: true, after: false },
    'open paren': { before: true, after: false },
    'open bracket': { before: true, after: false },
    'open brace': { before: true, after: false },
    // No space before, no space after
    'close quote': { before: false, after: false },
    'close paren': { before: false, after: false },
    'close bracket': { before: false, after: false },
    'close brace': { before: false, after: false },
    apostrophe: { before: false, after: false },
    'single quote': { before: false, after: false },
    // Special cases
    hyphen: { before: false, after: false },
    dash: { before: false, after: false },
    ellipsis: { before: false, after: true },
};

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

function SpeechComponent() {
    const handleTextSubmit = (finalText) => {
      console.log("Text submitted from component:", finalText);
      // Send the text to your backend, update state, etc.
      alert(`Submitting: ${finalText}`);
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
      `);
    }
  
    return (
      <div>
        <h1>My Speech-Enabled Editor</h1>
        <SpeechInput
          onSubmit={handleTextSubmit}
          onShowHelp={displayHelp}
          initialText="Welcome! Try speaking."
        />
      </div>
    );
  }
  

// --- Helper Hook for Speech Recognition ---
const useSpeechRecognition = ({ onResult, onError, onEnd }) => {
    const recognitionRef = useRef(null);
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState('prompt');

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setIsSupported(false);
            if (onError) onError({ error: 'browser-not-supported' });
            return;
        }

        setIsSupported(true);
        recognitionRef.current = new SpeechRecognition();
        const recognition = recognitionRef.current;

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 3; // Get multiple alternatives for better accuracy
        recognition.lang = 'en-US';

        // Configure for better punctuation
        if ('webkitSpeechRecognition' in window) {
            // @ts-ignore - webkit specific properties
            recognition.continuous = true;
            // @ts-ignore
            recognition.interimResults = true;
            // @ts-ignore
            recognition.maxAlternatives = 3;
        }

        recognition.onresult = onResult;
        recognition.onerror = (event) => {
            setIsListening(false);
            if (event.error === 'not-allowed') {
                setPermissionStatus('denied');
            }
            if (onError) onError(event);
        };
        recognition.onend = () => {
            if (onEnd) onEnd();
        };

        // Check initial permission state
        if (navigator.permissions) {
            navigator.permissions.query({ name: 'microphone' as PermissionName }).then((permission) => {
                setPermissionStatus(permission.state);
                permission.onchange = () => setPermissionStatus(permission.state);
            });
        }

        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (e) {
                    // Ignore errors during cleanup stop
                }
                recognitionRef.current = null;
            }
        };
    }, [onResult, onError, onEnd]);

    const startListening = useCallback(() => {
        if (recognitionRef.current && !isListening && isSupported) {
             try {
                 recognitionRef.current.start();
                 setIsListening(true);
                 setPermissionStatus('pending'); // Assume pending until an error or success
             } catch(e) {
                 // Handle cases like starting too soon after stopping
                 if (onError) onError({error: 'start-failed', message: e.message});
                 setIsListening(false); // Ensure state is correct
             }
        }
    }, [isListening, isSupported, onError]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current && isListening) {
             try {
                 recognitionRef.current.stop();
                 setIsListening(false);
             } catch(e) {
                 // Ignore errors during stop
                  if (onError) onError({error: 'stop-failed', message: e.message});
             }
        }
    }, [isListening, onError]);


    return {
        isListening,
        isSupported,
        permissionStatus,
        startListening,
        stopListening,
    };
};


// --- The Main Component ---
export const SpeechInput = ({
    onSubmit = (text) => console.log('Submitted:', text),
    onShowHelp = () => alert('Help: Speak naturally. Say punctuation like "period". Use "new line", "all caps", "end caps". Use "literally" before a command word to type it out.'),
    initialText = '',
}) => {
    const [text, setText] = useState(initialText);
    const [isAllCaps, setIsAllCaps] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Click the microphone to start speaking.');
    const textAreaRef = useRef(null);
    const finalProcessedTranscriptRef = useRef('');
    const lastInterimRef = useRef('');
    const interimTextLengthRef = useRef(0);

    const processTranscriptSegment = useCallback((segment) => {
        const words = segment.toLowerCase().split(' ');
        let processedWords = [];
        let currentIsAllCaps = isAllCaps;
        let literallyMode = false;
        let lastWordEndedWithPeriod = false;

        // Check if this is the first word in the input
        const isFirstWord = !textAreaRef.current?.value.trim();

        for (let i = 0; i < words.length; i++) {
            const word = words[i];

            if (!word) continue;

            if (literallyMode) {
                processedWords.push(currentIsAllCaps ? word.toUpperCase() : word);
                literallyMode = false;
                continue;
            }

            if (word === 'literally') {
                literallyMode = true;
                continue;
            }

            if (word === 'all' && words[i+1] === 'caps') {
                currentIsAllCaps = true;
                setIsAllCaps(true);
                i++;
                continue;
            }

            if (word === 'end' && words[i+1] === 'caps') {
                currentIsAllCaps = false;
                setIsAllCaps(false);
                i++;
                continue;
            }

            const punctuation = PUNCTUATION_MAP[word];
            if (punctuation) {
                const spacing = PUNCTUATION_SPACING[word];
                if (spacing) {
                    // Handle spacing before
                    if (processedWords.length > 0 && !spacing.before) {
                        processedWords[processedWords.length - 1] = processedWords[processedWords.length - 1].trimEnd();
                    }
                    // Add the punctuation
                    processedWords.push(punctuation);
                    // Handle spacing after
                    if (spacing.after) {
                        processedWords.push(' ');
                    }
                    // Track if this was a period
                    if (word === 'period') {
                        lastWordEndedWithPeriod = true;
                    }
                }
                continue;
            }

            const control = CONTROL_WORDS[word];
            if (control) {
                processedWords.push(control);
                continue;
            }

            // Regular word - handle capitalization
            let processedWord = word;
            if (currentIsAllCaps) {
                processedWord = word.toUpperCase();
            } else {
                // Capitalize if it's the first word in empty input
                if (isFirstWord && i === 0) {
                    processedWord = word.charAt(0).toUpperCase() + word.slice(1);
                }
                // Capitalize if previous word ended with a period
                else if (lastWordEndedWithPeriod) {
                    processedWord = word.charAt(0).toUpperCase() + word.slice(1);
                    lastWordEndedWithPeriod = false;
                }
            }
            processedWords.push(processedWord + ' ');
        }

        // Basic cleanup
        let result = processedWords.join('');
        // Ensure newline is on its own line
        result = result.replace(/(\w)\n/g, '$1\n');
        result = result.replace(/\n(\w)/g, '\n$1');
        // Remove any extra spaces before punctuation
        result = result.replace(/\s+([.,!?;:])/g, '$1');
        // Ensure space after punctuation unless followed by newline
        result = result.replace(/([.,!?;:])(?=\S)/g, '$1 ');
        // Trim potential leading/trailing spaces
        result = result.trim() + ' ';

        return result;
    }, [isAllCaps]);

    const handleResult = useCallback((event) => {
        let interimTranscript = '';
        let finalTranscriptSegment = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcript = result[0].transcript;
            
            // Check alternatives for better punctuation
            let bestTranscript = transcript;
            if (result.length > 1) {
                // Look for alternatives with better punctuation
                for (let j = 1; j < result.length; j++) {
                    const alt = result[j].transcript;
                    // Prefer alternatives with more punctuation
                    if (alt.match(/[.,!?;:]/g)?.length > bestTranscript.match(/[.,!?;:]/g)?.length) {
                        bestTranscript = alt;
                    }
                }
            }

            if (result.isFinal) {
                finalTranscriptSegment += bestTranscript;
            } else {
                interimTranscript += bestTranscript;
            }
        }

        if (textAreaRef.current) {
            const { selectionStart, selectionEnd } = textAreaRef.current;
            const currentText = textAreaRef.current.value;
            const textBefore = currentText.substring(0, selectionStart);
            const textAfter = currentText.substring(selectionEnd);

            // Update status with interim results for feedback
            if (interimTranscript) {
                lastInterimRef.current = interimTranscript;
                const processedInterim = processTranscriptSegment(interimTranscript);
                
                // Remove any previous interim text
                const textWithoutInterim = textBefore.substring(0, textBefore.length - interimTextLengthRef.current);
                const newText = textWithoutInterim + processedInterim + textAfter;
                setText(newText);
                
                // Update the interim text length
                interimTextLengthRef.current = processedInterim.length;
                
                // Move cursor to the end of the interim text
                setTimeout(() => {
                    if (textAreaRef.current) {
                        const newCursorPos = textWithoutInterim.length + processedInterim.length;
                        textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                        textAreaRef.current.focus();
                    }
                }, 0);
            }

            // Process and insert final results
            if (finalTranscriptSegment) {
                lastInterimRef.current = '';
                const processedSegment = processTranscriptSegment(finalTranscriptSegment);
                finalProcessedTranscriptRef.current += processedSegment;
                setStatusMessage(`Processing final: "${finalTranscriptSegment}"`);

                const textWithoutInterim = textBefore.substring(0, textBefore.length - interimTextLengthRef.current);
                const newText = textWithoutInterim + processedSegment + textAfter;
                setText(newText);

                interimTextLengthRef.current = 0;

                setTimeout(() => {
                    if (textAreaRef.current) {
                        const newCursorPos = textWithoutInterim.length + processedSegment.length;
                        textAreaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                        textAreaRef.current.focus();
                        textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight;
                    }
                    setStatusMessage('Listening...');
                }, 0);
            }
        }
    }, [processTranscriptSegment]);

    const handleError = useCallback((event) => {
        console.error('Speech recognition error:', event.error);
        let message = `Speech error: ${event.error}`;
         if (event.error === 'not-allowed') {
             message = 'Microphone permission denied. Please enable it in browser settings.';
         } else if (event.error === 'no-speech') {
             message = 'No speech detected. Try speaking louder or clearer.';
         } else if (event.error === 'network') {
             message = 'Network error during speech recognition.';
         } else if (event.error === 'browser-not-supported') {
             message = 'Speech recognition is not supported by this browser.';
         } else if (event.error === 'audio-capture') {
              message = 'Microphone not found or not working.';
         }
        setStatusMessage(message);
    }, []);

    const handleEnd = useCallback(() => {
        // This might be called automatically if continuous mode falters,
        // or when stopListening() is called.
        // We manage isListening state via start/stop calls mostly.
        setStatusMessage(prev => prev.startsWith('Heard:') ? 'Stopped listening.' : prev); // Update status if needed
        finalProcessedTranscriptRef.current = ''; // Reset accumulated transcript for next session
        lastInterimRef.current = '';
    }, []);

    const {
        isListening,
        isSupported,
        permissionStatus,
        startListening,
        stopListening,
    } = useSpeechRecognition({
        onResult: handleResult,
        onError: handleError,
        onEnd: handleEnd
    });

    // Start listening when component mounts
    useEffect(() => {
        if (isSupported && permissionStatus === 'granted') {
            startListening();
        }
    }, [isSupported, permissionStatus, startListening]);

    // Restart listening if it stops unexpectedly
    useEffect(() => {
        if (isSupported && permissionStatus === 'granted' && !isListening) {
            startListening();
        }
    }, [isListening, isSupported, permissionStatus, startListening]);

    const handleKeyDown = (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            if (text.trim().toLowerCase() === 'help') {
                onShowHelp();
            } else {
                onSubmit(text);
                // Clear the input area after dispatch
                setText('');
                // Don't stop listening after submit
                // if (isListening) {
                //     stopListening();
                // }
            }
        }
    };

    const handleToggleListen = () => {
        if (!isSupported) return;
        if (isListening) {
            stopListening();
            setStatusMessage('Stopped listening.');
        } else {
            if (permissionStatus === 'denied') {
                setStatusMessage('Microphone permission denied. Please enable it.');
                return;
            }
             finalProcessedTranscriptRef.current = ''; // Reset transcript history
             lastInterimRef.current = '';
             startListening();
             setStatusMessage('Listening...');
        }
    };

    const getMicButtonClass = () => {
        if (!isSupported) return 'mic-button disabled';
        if (permissionStatus === 'denied') return 'mic-button denied';
        if (isListening) return 'mic-button listening';
        return 'mic-button idle';
    }

    return (
        <div className="speech-input-container">
            <textarea
                ref={textAreaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter text here, or use the microphone..."
                rows={10}
                cols={50}
                disabled={!isSupported && permissionStatus !== 'granted'}
            />
            <button
                type="button"
                onClick={handleToggleListen}
                className={getMicButtonClass()}
                title={isListening ? 'Stop Listening' : 'Start Listening'}
                disabled={!isSupported || permissionStatus === 'denied'}
                style={{
                    position: 'absolute',
                    right: '10px',
                    top: '10px',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: isListening ? '#ff4444' : '#007AFF',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    fontSize: '20px',
                    padding: '0'
                }}
            >
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
            <p className="status-message">{statusMessage}</p>

            <style>{`
                .speech-input-container {
                    position: relative;
                    display: inline-block;
                    width: 100%;
                }
                .speech-input-container textarea {
                    width: 100%;
                    padding: 10px;
                    padding-right: 60px;
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
                    margin-top: 5px;
                    min-height: 1.2em;
                }
                .mic-button:hover {
                    transform: scale(1.05);
                    box-shadow: 0 3px 6px rgba(0,0,0,0.3);
                }
                .mic-button:active {
                    transform: scale(0.95);
                }
                .mic-button.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    background-color: #ccc !important;
                }
                .mic-button.denied {
                    background-color: #ff4444 !important;
                }
                .mic-button.listening {
                    background-color: #ff4444 !important;
                }
            `}</style>
        </div>
    );
};

// Keep the default export for backward compatibility
export default SpeechComponent;