import React, { useEffect, useState, useRef, useCallback } from 'react';
import { sendToBackground } from "@plasmohq/messaging";
import { Stepper } from "../functions/Stepper";

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

const YeshieEditor: React.FC<YeshieEditorProps> = ({ sessionId, onClose }) => {
  console.log("YeshieEditor rendering with sessionId:", sessionId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
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
        
        // Try to focus on the page's main input
        const pageInput = document.querySelector('textarea[data-id="root"], #prompt-textarea') as HTMLElement;
        if (pageInput) {
          pageInput.focus();
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
      {isRecording && (
        <div style={{
          backgroundColor: '#ff4444',
          color: 'white',
          padding: '4px 8px',
          textAlign: 'center',
          fontSize: '12px'
        }}>
          Recording user actions...
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
            outline: 'none'
          }}
        />
      </div>
    </div>
  );
};

export default YeshieEditor; 