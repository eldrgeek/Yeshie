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
    // Only stop propagation if the event originated from our editor
    if (e.currentTarget.closest('.yeshie-editor')) {
      e.stopPropagation();
      
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
      }
    }
  }, [sessionId, messages]);

  // Add focus management
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.yeshie-editor')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.yeshie-editor')) {
        e.preventDefault();
        e.stopPropagation();
        target.focus();
      }
    };

    document.addEventListener('focusin', handleFocus, true);
    document.addEventListener('focusout', handleBlur, true);

    return () => {
      document.removeEventListener('focusin', handleFocus, true);
      document.removeEventListener('focusout', handleBlur, true);
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
        zIndex: 2147483647 // Maximum z-index
      }}
      onClick={(e) => {
        if (e.currentTarget.closest('.yeshie-editor')) {
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
        onClick={(e) => e.stopPropagation()}
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
            onClick={(e) => e.stopPropagation()}
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
                onClick={(e) => e.stopPropagation()}
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
          position: 'relative',
          zIndex: 2147483647
        }}
        onClick={(e) => {
          if (e.currentTarget.closest('.yeshie-editor')) {
            e.stopPropagation();
          }
        }}
      >
        <div
          ref={inputRef}
          className="message-input"
          contentEditable
          onKeyDown={handleKeyDown}
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
            position: 'relative',
            zIndex: 2147483647
          }}
          onClick={(e) => {
            if (e.currentTarget.closest('.yeshie-editor')) {
              e.stopPropagation();
              e.currentTarget.focus();
            }
          }}
          onFocus={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onBlur={(e) => {
            e.stopPropagation();
            e.preventDefault();
            e.currentTarget.focus();
          }}
        />
      </div>
    </div>
  );
};

export default YeshieEditor; 