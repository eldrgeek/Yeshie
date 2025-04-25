import React, { useEffect, useState, useRef, useCallback } from 'react';
import { sendToBackground } from "@plasmohq/messaging";
import { Stepper } from "../functions/Stepper";

// Import the diagnostic logger
import DiagnosticLogger from '../functions/DiagnosticLogger';

interface Command {
  id: string;
  text: string;
  executed: boolean;
}

interface Message {
  id: string;
  type: "user" | "yeshie" | "system";
  content: string;
  isEdited?: boolean;
  commands?: Command[];
}

interface YeshieEditorProps {
  sessionId: string;
  onClose?: () => void;
}

// Add ChatGPT textarea interface with our custom property
interface ChatGPTTextarea extends HTMLTextAreaElement {
  _yeshieOriginalTabIndex?: number;
}

const YeshieEditor: React.FC<YeshieEditorProps> = ({ sessionId, onClose }) => {
  console.log("YeshieEditor rendering with sessionId:", sessionId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // Add diagnostic logging state
  const [isDiagnosticLoggingEnabled, setIsDiagnosticLoggingEnabled] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);

  // Set default prompt and clipboard on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.innerText = "learn claude";
      
      // Handle clipboard operation directly in content script
      console.log("Attempting to set clipboard");
      navigator.clipboard.writeText("Start test 'learn claude'")
        .then(() => {
          console.log("Successfully wrote to clipboard");
          // Focus the chat input after clipboard operation
          const chatInput = document.querySelector('textarea[data-id="root"]') as HTMLTextAreaElement;
          if (chatInput) {
            chatInput.focus();
            // Optionally paste the content
            chatInput.value = "Start test 'learn claude'";
          }
        })
        .catch(error => {
          console.error("Failed to write to clipboard:", error);
        });
    }
  }, []);

  // Add start diagnostic logging at mount
  useEffect(() => {
    // Initialize diagnostic logging
    DiagnosticLogger.startMonitoring();
    
    // Check for specific key combinations to toggle logging or copy logs
    const handleSpecialKeys = (e: KeyboardEvent) => {
      // Alt+Shift+D = Toggle diagnostic logging
      if (e.altKey && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        setIsDiagnosticLoggingEnabled(prev => {
          const newValue = !prev;
          DiagnosticLogger.setLoggingEnabled(newValue);
          return newValue;
        });
      }
      
      // Alt+Shift+C = Copy logs to clipboard
      if (e.altKey && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        DiagnosticLogger.copyLogsToClipboard();
      }
    };
    
    document.addEventListener('keydown', handleSpecialKeys);
    
    return () => {
      document.removeEventListener('keydown', handleSpecialKeys);
    };
  }, []);

  useEffect(() => {
    // Add message event listener for command results
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "commandResult") {
        const { command, result, error } = event.data;
        const newMessage: Message = {
          id: Math.random().toString(36).substring(7),
          type: "system",
          content: error ? `Error executing command: ${error}` : `Command executed: ${result}`,
        };
        setMessages(prev => [...prev, newMessage]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Log the keydown event
    DiagnosticLogger.log('editor_keydown', {
      key: e.key,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      activeElementBeforeKeyDown: document.activeElement?.tagName
    });
    
    // If we're in the editor input field, we need to stop ALL key events 
    // from bubbling to prevent Claude/ChatGPT from stealing our focus
    const isEditorInput = e.target === inputRef.current;
    
    if (isEditorInput) {
      // Stop ALL key events from reaching the underlying page
      e.stopPropagation();
      
      // Continue handling specific keys
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const target = e.target as HTMLDivElement;
        const message = target.innerText.trim();
        
        if (message) {
          const newMessage: Message = {
            id: Math.random().toString(36).substring(7),
            type: "user",
            content: message,
          };
          
          setMessages(prev => [...prev, newMessage]);
          target.innerText = "";

          // Send message to background script
          sendToBackground({
            name: "message",
            body: { 
              message,
              sessionId,
              conversation: messages.map(m => ({
                role: m.type === "yeshie" ? "assistant" : "user",
                content: m.content
              }))
            }
          }).then(response => {
            const newMessage: Message = {
              id: Math.random().toString(36).substring(7),
              type: "yeshie",
              content: response.message,
              commands: response.commands?.map((cmd, i) => ({
                id: `cmd-${Date.now()}-${i}`,
                text: cmd,
                executed: false
              }))
            };
            setMessages(prev => [...prev, newMessage]);
          });
        }
      } else if (e.key === "Escape") {
        // Handle Escape key to explicitly blur and return focus to page
        inputRef.current.blur();
        e.preventDefault();
        
        // Log the escape action
        DiagnosticLogger.log('escape_from_editor', {
          activeElementBeforeEscape: document.activeElement?.tagName
        });
        
        // Try to focus on the page's main input
        const pageInput = document.querySelector('textarea[data-id="root"], #prompt-textarea') as HTMLElement;
        if (pageInput) {
          pageInput.focus();
          
          // Log the focus attempt
          DiagnosticLogger.log('focus_attempt_on_page_input', {
            targetId: pageInput.id,
            targetTag: pageInput.tagName,
            activeElementAfterFocusAttempt: document.activeElement?.tagName
          });
        }
      }
    } else if (e.currentTarget.closest('.yeshie-editor')) {
      // For clicks elsewhere in the editor (not the input)
      if (e.key === "Escape") {
        // Handle Escape key to explicitly blur and return focus to page
        if (inputRef.current) {
          inputRef.current.blur();
          e.preventDefault();
        }
      }
    }
  }, [sessionId, messages]);

  // Add focus management
  useEffect(() => {
    let isExtensionFocused = false;
    
    // Track if extension is focused
    const handleExtensionFocus = () => {
      isExtensionFocused = true;
    };
    
    const handleExtensionBlur = () => {
      isExtensionFocused = false;
    };
    
    // Handle document clicks to release focus back to the page
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isExtensionClick = target.closest('.yeshie-editor');
      
      // If clicking outside the extension while extension is focused
      if (isExtensionFocused && !isExtensionClick) {
        if (inputRef.current) {
          inputRef.current.blur();
        }
        // Allow event to continue to page elements
        isExtensionFocused = false;
      }
    };
    
    // Add all event listeners
    if (inputRef.current) {
      inputRef.current.addEventListener('focus', handleExtensionFocus);
      inputRef.current.addEventListener('blur', handleExtensionBlur);
    }
    
    document.addEventListener('click', handleDocumentClick);
    
    return () => {
      if (inputRef.current) {
        inputRef.current.removeEventListener('focus', handleExtensionFocus);
        inputRef.current.removeEventListener('blur', handleExtensionBlur);
      }
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  // Add advanced focus management for LLM sites
  useEffect(() => {
    let isExtensionFocused = false;
    
    // Track if extension is focused
    const handleExtensionFocus = () => {
      isExtensionFocused = true;
    };
    
    const handleExtensionBlur = () => {
      isExtensionFocused = false;
    };
    
    // Handle document clicks to release focus back to the page
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isExtensionClick = target.closest('.yeshie-editor');
      
      // If clicking outside the extension while extension is focused
      if (isExtensionFocused && !isExtensionClick) {
        if (inputRef.current) {
          inputRef.current.blur();
        }
        // Allow event to continue to page elements
        isExtensionFocused = false;
      }
    };
    
    // Special handling for mousedown events on our input to prevent focus stealing
    const captureInputMousedown = (e: MouseEvent) => {
      // Stop the mousedown event from propagating to prevent ChatGPT/Claude from 
      // capturing it and redirecting focus back to their input
      e.stopPropagation();
    };
    
    // Special handling for LLM sites that aggressively steal focus
    const preventLLMFocusStealing = () => {
      // For ChatGPT and Claude which aggressively steal focus
      const isLLMSite = 
        window.location.hostname.includes('openai.com') ||
        window.location.hostname.includes('anthropic.com') ||
        window.location.hostname.includes('claude.ai');
        
      if (isLLMSite) {
        // Add more aggressive focus retention for these sites
        const preventFocusStealing = (e: FocusEvent) => {
          const target = e.target as HTMLElement;
          // If focus is moving to the LLM textarea and we have our editor focused
          if (isExtensionFocused && 
              (target.id === 'prompt-textarea' || // ChatGPT
               target.matches('textarea[data-id="root"]'))) { // Claude
            // Prevent the focus change and keep our input focused
            e.preventDefault();
            e.stopPropagation();
            if (inputRef.current) {
              // Move focus back to our input
              setTimeout(() => inputRef.current?.focus(), 0);
            }
            return false;
          }
        };
        
        // Use capture phase to intercept focus events
        document.addEventListener('focusin', preventFocusStealing, true);
        return () => document.removeEventListener('focusin', preventFocusStealing, true);
      }
    };
    
    // Set up all event listeners
    if (inputRef.current) {
      inputRef.current.addEventListener('focus', handleExtensionFocus);
      inputRef.current.addEventListener('blur', handleExtensionBlur);
      inputRef.current.addEventListener('mousedown', captureInputMousedown);
    }
    
    document.addEventListener('click', handleDocumentClick);
    
    // Set up LLM-specific focus stealing prevention
    const cleanup = preventLLMFocusStealing();
    
    return () => {
      if (inputRef.current) {
        inputRef.current.removeEventListener('focus', handleExtensionFocus);
        inputRef.current.removeEventListener('blur', handleExtensionBlur);
        inputRef.current.removeEventListener('mousedown', captureInputMousedown);
      }
      document.removeEventListener('click', handleDocumentClick);
      if (cleanup) cleanup();
    };
  }, []);

  // Add improved LLM site focus handling with MutationObserver
  useEffect(() => {
    let isExtensionFocused = false;
    
    // Track if extension is focused
    const handleExtensionFocus = () => {
      isExtensionFocused = true;
    };
    
    const handleExtensionBlur = () => {
      isExtensionFocused = false;
    };
    
    // Handle document clicks to release focus back to the page
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isExtensionClick = target.closest('.yeshie-editor');
      
      // If clicking outside the extension while extension is focused
      if (isExtensionFocused && !isExtensionClick) {
        if (inputRef.current) {
          inputRef.current.blur();
        }
        // Allow event to continue to page elements
        isExtensionFocused = false;
      }
    };
    
    // Special handling for mousedown events on our input to prevent focus stealing
    const captureInputMousedown = (e: MouseEvent) => {
      // Stop the mousedown event from propagating to prevent ChatGPT/Claude from 
      // capturing it and redirecting focus back to their input
      e.stopPropagation();
    };
    
    // Special handling for LLM sites that aggressively steal focus
    const preventLLMFocusStealing = () => {
      // For ChatGPT and Claude which aggressively steal focus
      const isLLMSite = 
        window.location.hostname.includes('openai.com') ||
        window.location.hostname.includes('anthropic.com') ||
        window.location.hostname.includes('claude.ai');
        
      if (isLLMSite) {
        // Add MutationObserver to detect when Claude/ChatGPT tries to force focus to their input
        const observeDOM = new MutationObserver((mutations) => {
          if (isExtensionFocused) {
            // If we're supposed to be focused, but we've lost focus to the LLM textarea
            const llmTextarea = document.querySelector('#prompt-textarea, textarea[data-id="root"]') as HTMLElement;
            if (llmTextarea && document.activeElement === llmTextarea && inputRef.current) {
              // Force focus back to our input
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          }
        });
        
        // Monitor for any focus change events
        observeDOM.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'data-focused']
        });
        
        // Add more aggressive focus retention for these sites
        const preventFocusStealing = (e: FocusEvent) => {
          const target = e.target as HTMLElement;
          // If focus is moving to the LLM textarea and we have our editor focused
          if (isExtensionFocused && 
              (target.id === 'prompt-textarea' || // ChatGPT
               target.matches('textarea[data-id="root"]'))) { // Claude
            // Prevent the focus change and keep our input focused
            e.preventDefault();
            e.stopPropagation();
            if (inputRef.current) {
              // Move focus back to our input
              setTimeout(() => inputRef.current?.focus(), 0);
            }
            return false;
          }
        };
        
        // Use capture phase to intercept focus events
        document.addEventListener('focusin', preventFocusStealing, true);
        
        // Also intercept keydown events that might be intended for LLM textareas
        const preventKeyCapture = (e: KeyboardEvent) => {
          // If we have focus in our editor
          if (isExtensionFocused) {
            // Check if the key event is intended for the LLM textarea
            const target = e.target as HTMLElement;
            if (target.id === 'prompt-textarea' || target.matches('textarea[data-id="root"]')) {
              // Stop the event and refocus our input
              e.stopPropagation();
              if (inputRef.current) {
                inputRef.current.focus();
              }
            }
          }
        };
        
        document.addEventListener('keydown', preventKeyCapture, true);
        
        return () => {
          observeDOM.disconnect();
          document.removeEventListener('focusin', preventFocusStealing, true);
          document.removeEventListener('keydown', preventKeyCapture, true);
        };
      }
      
      return undefined;
    };
    
    // Set up all event listeners
    if (inputRef.current) {
      inputRef.current.addEventListener('focus', handleExtensionFocus);
      inputRef.current.addEventListener('blur', handleExtensionBlur);
      inputRef.current.addEventListener('mousedown', captureInputMousedown);
    }
    
    document.addEventListener('click', handleDocumentClick);
    
    // Set up LLM-specific focus stealing prevention
    const cleanup = preventLLMFocusStealing();
    
    return () => {
      if (inputRef.current) {
        inputRef.current.removeEventListener('focus', handleExtensionFocus);
        inputRef.current.removeEventListener('blur', handleExtensionBlur);
        inputRef.current.removeEventListener('mousedown', captureInputMousedown);
      }
      document.removeEventListener('click', handleDocumentClick);
      if (cleanup) cleanup();
    };
  }, []);

  // Add ChatGPT-specific focus handling - DIRECT APPROACH
  useEffect(() => {
    // Only apply this on ChatGPT
    if (!window.location.hostname.includes('openai.com')) {
      return;
    }

    // Add a global click handler to the entire document
    const handleGlobalClick = (e: MouseEvent) => {
      // Check if click happened within our extension
      const target = e.target as HTMLElement;
      const isExtensionClick = target.closest("#plasmo-google-sidebar") !== null;
      
      DiagnosticLogger.log('global_click', {
        isExtensionClick,
        targetId: target.id,
        targetTag: target.tagName,
        targetClass: target.className
      });
      
      if (isExtensionClick) {
        // When extension is clicked, force focus to our input
        if (inputRef.current) {
          // Stop event to prevent ChatGPT from handling it
          e.stopPropagation();
          e.preventDefault();
          
          // Hard focus on our input
          inputRef.current.focus();
          
          DiagnosticLogger.log('focused_input', {
            inputRef: !!inputRef.current,
            activeElement: document.activeElement === inputRef.current
          });
        }
      }
    };
    
    // Capture key events at the document level
    const captureKeyEvents = (e: KeyboardEvent) => {
      // Check if active element is our input
      const isOurInputActive = document.activeElement === inputRef.current;
      
      DiagnosticLogger.log('key_event', {
        key: e.key,
        isOurInputActive,
        activeElement: document.activeElement?.tagName,
        activeElementId: document.activeElement?.id,
        eventTargetId: (e.target as HTMLElement)?.id
      });
      
      // If we want to direct all typing to our input
      if (!isOurInputActive) {
        // If this key would type text
        if (e.key.length === 1 || e.key === 'Backspace') {
          e.preventDefault();
          e.stopPropagation();
          
          // Focus our input
          if (inputRef.current) {
            inputRef.current.focus();
            
            // If it's a character key, add it to the input
            if (e.key.length === 1) {
              // Insert at cursor or end
              const selection = window.getSelection();
              if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const textNode = document.createTextNode(e.key);
                range.insertNode(textNode);
                
                // Move cursor after inserted character
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);
              } else {
                // No selection, just append
                inputRef.current.textContent += e.key;
                
                // Move cursor to end
                const range = document.createRange();
                range.selectNodeContents(inputRef.current);
                range.collapse(false);
                selection?.removeAllRanges();
                selection?.addRange(range);
              }
            } else if (e.key === 'Backspace') {
              // Handle backspace
              const selection = window.getSelection();
              if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                if (range.collapsed) {
                  // If cursor is at position, delete previous character
                  range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
                  range.deleteContents();
                } else {
                  // If text is selected, delete selection
                  range.deleteContents();
                }
              }
            }
            
            DiagnosticLogger.log('key_processed', {
              key: e.key,
              newContent: inputRef.current.textContent
            });
          }
        }
      }
    };
    
    // Add the click handler at capture phase to get it first
    document.addEventListener('click', handleGlobalClick, true);
    
    // Add key event handler
    document.addEventListener('keydown', captureKeyEvents, true);
    
    // Set the input ID for easier targeting
    if (inputRef.current) {
      inputRef.current.id = 'yeshie-editor-input';
    }
    
    // Set initial focus
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        DiagnosticLogger.log('initial_focus_set', {
          activeElement: document.activeElement === inputRef.current
        });
      }
    }, 100);
    
    // Cleanup
    return () => {
      document.removeEventListener('click', handleGlobalClick, true);
      document.removeEventListener('keydown', captureKeyEvents, true);
    };
  }, []);

  const executeCommand = useCallback((command: Command) => {
    if (command.executed) return;

    const updatedMessages = messages.map(msg => {
      if (msg.commands?.some(cmd => cmd.id === command.id)) {
        return {
          ...msg,
          commands: msg.commands.map(cmd => 
            cmd.id === command.id ? { ...cmd, executed: true } : cmd
          )
        };
      }
      return msg;
    });

    setMessages(updatedMessages);

    // Send command to parent window for execution
    window.postMessage({ 
      type: "command", 
      command: command.text 
    }, "*");
  }, [messages]);

  // Add a function to run diagnostics on ChatGPT
  const runChatGPTDiagnostics = useCallback(() => {
    if (!window.location.hostname.includes('openai.com')) {
      return; // Only run on ChatGPT
    }
    
    DiagnosticLogger.log('chatgpt_diagnostics', {
      hostname: window.location.hostname,
      pathname: window.location.pathname
    });
    
    // Find ChatGPT's textarea
    const chatGPTTextarea = document.querySelector('#prompt-textarea') as HTMLTextAreaElement;
    
    if (chatGPTTextarea) {
      DiagnosticLogger.log('chatgpt_textarea_found', {
        id: chatGPTTextarea.id,
        className: chatGPTTextarea.className,
        disabled: chatGPTTextarea.disabled,
        readOnly: chatGPTTextarea.readOnly,
        tabIndex: chatGPTTextarea.tabIndex,
        ariaHidden: chatGPTTextarea.getAttribute('aria-hidden'),
        cssVisibility: window.getComputedStyle(chatGPTTextarea).visibility,
        cssDisplay: window.getComputedStyle(chatGPTTextarea).display,
        // Find parent elements that might be capturing events
        parents: collectParentInfo(chatGPTTextarea, 5)
      });
      
      // Test event listeners by simulating a focus
      try {
        // Log before
        DiagnosticLogger.log('before_chatgpt_focus_test', {
          activeElement: document.activeElement?.tagName
        });
        
        // Try to focus it
        chatGPTTextarea.focus();
        
        // Log after
        setTimeout(() => {
          DiagnosticLogger.log('after_chatgpt_focus_test', {
            activeElement: document.activeElement?.tagName,
            focusChanged: document.activeElement === chatGPTTextarea
          });
          
          // Return focus to our input
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, 100);
      } catch (err) {
        DiagnosticLogger.log('chatgpt_focus_test_error', { error: String(err) });
      }
    } else {
      DiagnosticLogger.log('chatgpt_textarea_not_found', {});
    }
  }, []);

  // Helper function to collect parent element info
  const collectParentInfo = (element: Element, depth: number) => {
    const parents = [];
    let current = element.parentElement;
    let level = 0;
    
    while (current && level < depth) {
      parents.push({
        level,
        tagName: current.tagName,
        id: current.id,
        className: current.className,
        cssPosition: window.getComputedStyle(current).position,
        cssZIndex: window.getComputedStyle(current).zIndex
      });
      current = current.parentElement;
      level++;
    }
    
    return parents;
  };

  return (
    <div 
      className="yeshie-editor" 
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: '#ffffff',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 1000 // Reduced from maximum
      }}
      onClick={(e) => {
        // Log clicks on the editor
        DiagnosticLogger.log('editor_container_click', {
          target: e.target instanceof Element ? {
            tagName: e.target.tagName,
            className: e.target.className
          } : 'unknown'
        });
        
        // Only stop propagation for clicks directly on the editor itself
        // This allows clicks outside the editor to reach the page
        const isMessageOrInput = e.target instanceof HTMLElement && 
          (e.target.closest('.messages') || e.target.closest('.input-area'));
        
        // Only capture clicks in the message area and input area
        if (isMessageOrInput) {
          e.stopPropagation();
        }
      }}
    >
      {(isRecording || isDiagnosticLoggingEnabled) && (
        <div style={{
          backgroundColor: isDiagnosticLoggingEnabled ? '#4caf50' : '#ff4444',
          color: 'white',
          padding: '4px 8px',
          textAlign: 'center',
          fontSize: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{isRecording ? 'Recording user actions...' : ''}</span>
          {isDiagnosticLoggingEnabled && <span>Diagnostic Logging Active</span>}
          <div>
            <button
              onClick={() => {
                DiagnosticLogger.copyLogsToClipboard();
              }}
              style={{
                padding: '2px 6px',
                backgroundColor: '#ffffff',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                marginRight: '6px',
                fontSize: '10px'
              }}
            >
              Copy Logs
            </button>
            <button
              onClick={() => {
                // Clear logs
                DiagnosticLogger.clearLogEntries();
                
                // Show notification
                const toast = document.createElement('div');
                toast.style.position = 'fixed';
                toast.style.bottom = '20px';
                toast.style.right = '20px';
                toast.style.backgroundColor = '#4CAF50';
                toast.style.color = 'white';
                toast.style.padding = '10px';
                toast.style.borderRadius = '5px';
                toast.style.zIndex = '10000';
                toast.textContent = 'Diagnostic logs cleared';
                document.body.appendChild(toast);
                
                // Remove toast after 2 seconds
                setTimeout(() => {
                  if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                  }
                }, 2000);
              }}
              style={{
                padding: '2px 6px',
                backgroundColor: '#ffffff',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                marginRight: '6px',
                fontSize: '10px'
              }}
            >
              Clear Logs
            </button>
            <button
              onClick={() => {
                DiagnosticLogger.saveLogsToStorage()
                  .then(key => {
                    if (key) {
                      console.log("Logs saved with key:", key);
                      // Show toast or notification
                      const toast = document.createElement('div');
                      toast.style.position = 'fixed';
                      toast.style.bottom = '20px';
                      toast.style.right = '20px';
                      toast.style.backgroundColor = '#4CAF50';
                      toast.style.color = 'white';
                      toast.style.padding = '10px';
                      toast.style.borderRadius = '5px';
                      toast.style.zIndex = '10000';
                      toast.textContent = 'Diagnostic logs saved successfully';
                      document.body.appendChild(toast);
                      
                      // Remove toast after 3 seconds
                      setTimeout(() => {
                        document.body.removeChild(toast);
                      }, 3000);
                    }
                  });
              }}
              style={{
                padding: '2px 6px',
                backgroundColor: '#ffffff',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                marginRight: '6px',
                fontSize: '10px'
              }}
            >
              Save
            </button>
            {window.location.hostname.includes('openai.com') && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  runChatGPTDiagnostics();
                }}
                style={{
                  padding: '2px 6px',
                  backgroundColor: '#ff9800',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '10px',
                  marginLeft: '4px',
                  cursor: 'pointer'
                }}
                title="Test focus handling on ChatGPT"
              >
                Test GPT
              </button>
            )}
          </div>
        </div>
      )}
      <div 
        className="messages" 
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
        onClick={(e) => {
          // Only stop propagation for clicks on message elements
          // but allow bubbling for clicks on empty space
          if (e.target !== e.currentTarget) {
            e.stopPropagation();
          }
        }}
      >
        {messages.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            color: '#666',
            padding: '20px'
          }}>
            Start a conversation with Yeshie
          </div>
        )}
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`message ${msg.type}`} 
            style={{
              maxWidth: '80%',
              alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: msg.type === 'user' ? '#007AFF' : 
                             msg.type === 'system' ? '#FFB74D' : '#F0F0F0',
              color: msg.type === 'user' ? '#fff' : '#000',
              padding: '12px 16px',
              borderRadius: '12px',
              wordBreak: 'break-word'
            }}
            onClick={(e) => {
              // Only stop propagation for interaction elements inside messages
              const isInteractive = e.target instanceof HTMLElement && 
                (e.target.tagName === 'BUTTON' || e.target.closest('button'));
              
              // Only capture clicks on interactive elements
              if (isInteractive) {
                e.stopPropagation();
              }
            }}
          >
            <div className="content">{msg.content}</div>
            {msg.commands && (
              <div 
                className="commands" 
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
              >
                {msg.commands.map((cmd) => (
                  <button 
                    key={cmd.id} 
                    onClick={(e) => {
                      e.stopPropagation();
                      executeCommand(cmd);
                    }}
                    disabled={cmd.executed}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: cmd.executed ? '#ccc' : '#4CAF50',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: cmd.executed ? 'default' : 'pointer',
                      opacity: cmd.executed ? 0.7 : 1
                    }}
                  >
                    {cmd.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div 
            className="typing-indicator" 
            style={{
              color: '#666',
              fontSize: '14px',
              padding: '8px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            Yeshie is typing...
          </div>
        )}
      </div>
      <div 
        className="input-area" 
        style={{
          borderTop: '1px solid #e0e0e0',
          padding: '16px',
          backgroundColor: '#f8f8f8',
          position: 'relative'
        }}
        onClick={(e) => {
          // Stop propagation to prevent the event from reaching the page's handlers
          e.stopPropagation();
          e.preventDefault();
          
          // Force focus on our input
          if (inputRef.current && document.activeElement !== inputRef.current) {
            inputRef.current.focus();
            
            // Detect if we're on an LLM site
            const isLLMSite = 
              window.location.hostname.includes('openai.com') ||
              window.location.hostname.includes('anthropic.com') ||
              window.location.hostname.includes('claude.ai');
              
            if (isLLMSite) {
              // For ChatGPT/Claude, use setTimeout to ensure our focus remains after their focus stealing
              setTimeout(() => {
                if (document.activeElement !== inputRef.current && inputRef.current) {
                  inputRef.current.focus();
                }
              }, 10);
            }
          }
        }}
      >
        <div
          ref={inputRef}
          className="message-input"
          contentEditable
          onKeyDown={handleKeyDown}
          onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px #007AFF'}
          onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
          role="textbox"
          aria-multiline="true"
          style={{
            minHeight: '40px',
            maxHeight: '120px',
            overflowY: 'auto',
            padding: '8px 12px',
            backgroundColor: '#fff',
            border: '1px solid #ddd',
            borderRadius: '6px',
            outline: 'none',
            marginBottom: '12px'
          }}
        />

        {/* Diagnostic toolbar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #e0e0e0',
          paddingTop: '8px',
          marginTop: '4px'
        }}>
          <div style={{ fontSize: '10px', color: '#888' }}>
            v1.0.3
          </div>
          <div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDiagnosticLoggingEnabled(prev => {
                  const newValue = !prev;
                  DiagnosticLogger.setLoggingEnabled(newValue);
                  
                  // Clear logs when turning logging on
                  if (newValue) {
                    DiagnosticLogger.clearLogEntries();
                    
                    // Show a small notification
                    const toast = document.createElement('div');
                    toast.style.position = 'fixed';
                    toast.style.bottom = '20px';
                    toast.style.right = '20px';
                    toast.style.backgroundColor = '#4CAF50';
                    toast.style.color = 'white';
                    toast.style.padding = '10px';
                    toast.style.borderRadius = '5px';
                    toast.style.zIndex = '10000';
                    toast.textContent = 'Logs cleared, diagnostic logging started';
                    document.body.appendChild(toast);
                    
                    // Remove toast after 2 seconds
                    setTimeout(() => {
                      if (document.body.contains(toast)) {
                        document.body.removeChild(toast);
                      }
                    }, 2000);
                  }
                  
                  return newValue;
                });
              }}
              style={{
                padding: '4px 8px',
                backgroundColor: isDiagnosticLoggingEnabled ? '#4CAF50' : '#f0f0f0',
                color: isDiagnosticLoggingEnabled ? '#fff' : '#333',
                border: 'none',
                borderRadius: '4px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
              title="Toggle diagnostic logging (Alt+Shift+D)"
            >
              {isDiagnosticLoggingEnabled ? 'Logging On' : 'Logging Off'}
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                DiagnosticLogger.copyLogsToClipboard();
              }}
              style={{
                padding: '4px 8px',
                backgroundColor: '#f0f0f0',
                color: '#333',
                border: 'none',
                borderRadius: '4px',
                fontSize: '10px',
                marginLeft: '4px',
                cursor: 'pointer',
                display: isDiagnosticLoggingEnabled ? 'inline-block' : 'none'
              }}
              title="Copy logs to clipboard (Alt+Shift+C)"
            >
              Copy
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                DiagnosticLogger.saveLogsToStorage()
                  .then(key => {
                    if (key) {
                      // Show toast notification
                      const toast = document.createElement('div');
                      toast.style.position = 'fixed';
                      toast.style.bottom = '20px';
                      toast.style.right = '20px';
                      toast.style.backgroundColor = '#4CAF50';
                      toast.style.color = 'white';
                      toast.style.padding = '10px';
                      toast.style.borderRadius = '5px';
                      toast.style.zIndex = '10000';
                      toast.textContent = 'Diagnostic logs saved successfully';
                      document.body.appendChild(toast);
                      
                      setTimeout(() => document.body.removeChild(toast), 3000);
                    }
                  });
              }}
              style={{
                padding: '4px 8px',
                backgroundColor: '#f0f0f0',
                color: '#333',
                border: 'none',
                borderRadius: '4px',
                fontSize: '10px',
                marginLeft: '4px',
                cursor: 'pointer',
                display: isDiagnosticLoggingEnabled ? 'inline-block' : 'none'
              }}
              title="Save logs to persistent storage"
            >
              Save
            </button>
              
            {window.location.hostname.includes('openai.com') && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  runChatGPTDiagnostics();
                }}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#ff9800',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '10px',
                  marginLeft: '4px',
                  cursor: 'pointer'
                }}
                title="Test focus handling on ChatGPT"
              >
                Test GPT
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default YeshieEditor; 