import React, { useEffect, useState, useRef, useCallback } from 'react';
import { sendToBackground } from "@plasmohq/messaging";
import { Stepper } from "../functions/Stepper";
import { io, Socket } from "socket.io-client";

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

type WebSocketResponse = {
  type: "response";
  message: string;
  commands?: string[];
};

type WebSocketRequest = 
  | { type: "message"; message: string; sessionId: string }
  | { type: "command"; command: string; sessionId: string };

interface YeshieEditorProps {
  sessionId: string;
  onClose?: () => void;
}

const YeshieEditor: React.FC<YeshieEditorProps> = ({ sessionId, onClose }) => {
  console.log("YeshieEditor rendering with sessionId:", sessionId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionType, setConnectionType] = useState<"websocket" | "extension">("extension");
  const [isTyping, setIsTyping] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const socket = io("http://localhost:3000", {
      transports: ["websocket"],
      reconnectionDelay: 5000,
      reconnectionDelayMax: 10000
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Socket.IO connected");
      setIsConnected(true);
      setConnectionType("websocket");
      
      // Send session initialization message
      socket.emit("init", { sessionId });
    });

    socket.on("response", (data: WebSocketResponse) => {
      if (data.type === "response") {
        const newMessage: Message = {
          id: Math.random().toString(36).substring(7),
          type: "yeshie",
          content: data.message,
          commands: data.commands?.map((cmd, i) => ({
            id: `cmd-${Date.now()}-${i}`,
            text: cmd,
            executed: false
          }))
        };
        setMessages(prev => [...prev, newMessage]);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error);
      setConnectionType("extension");
    });

    socket.on("disconnect", () => {
      console.log("Socket.IO disconnected");
      setIsConnected(false);
    });

    // Add message event listener
    const handleMessage = (event: MessageEvent) => {
      if (event.data) {
        switch (event.data.type) {
          case 'yeshie-message':
            const newMessage: Message = {
              id: Math.random().toString(36).substring(7),
              type: "system",
              content: event.data.text
            };
            setMessages(prev => [...prev, newMessage]);
            break;

          case 'yeshie-record-start':
            setIsRecording(true);
            const startMessage: Message = {
              id: Math.random().toString(36).substring(7),
              type: "system",
              content: "Recording user actions..."
            };
            setMessages(prev => [...prev, startMessage]);
            break;

          case 'yeshie-record-stop':
            setIsRecording(false);
            const stopMessage: Message = {
              id: Math.random().toString(36).substring(7),
              type: "system",
              content: "Recording stopped. Actions saved."
            };
            setMessages(prev => [...prev, stopMessage]);
            break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      socket.disconnect();
      window.removeEventListener('message', handleMessage);
    };
  }, [sessionId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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

        // Send message through appropriate channel
        if (connectionType === "websocket" && socketRef.current) {
          socketRef.current.emit("message", {
            message,
            sessionId
          });
        } else {
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
  }, [connectionType, sessionId, messages]);

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

    // Send command execution to backend
    if (connectionType === "websocket" && socketRef.current) {
      socketRef.current.emit("command", {
        command: command.text,
        sessionId
      });
    } else {
      sendToBackground({
        name: "command",
        body: { command: command.text, sessionId }
      });
    }
  }, [connectionType, sessionId, messages]);

  return (
    <div className="yeshie-editor" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      backgroundColor: '#ffffff',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
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
      <div className="messages" style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
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
          <div key={msg.id} className={`message ${msg.type}`} style={{
            maxWidth: '80%',
            alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start',
            backgroundColor: msg.type === 'user' ? '#007AFF' : 
                           msg.type === 'system' ? '#FFB74D' : '#F0F0F0',
            color: msg.type === 'user' ? '#fff' : '#000',
            padding: '12px 16px',
            borderRadius: '12px',
            wordBreak: 'break-word'
          }}>
            <div className="content">{msg.content}</div>
            {msg.commands && (
              <div className="commands" style={{
                marginTop: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                {msg.commands.map((cmd) => (
                  <button 
                    key={cmd.id} 
                    onClick={() => executeCommand(cmd)}
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
          <div className="typing-indicator" style={{
            color: '#666',
            fontSize: '14px',
            padding: '8px'
          }}>
            Yeshie is typing...
          </div>
        )}
      </div>
      <div className="input-area" style={{
        borderTop: '1px solid #e0e0e0',
        padding: '16px',
        backgroundColor: '#f8f8f8'
      }}>
        <div
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
            outline: 'none'
          }}
        />
      </div>
    </div>
  );
};

export default YeshieEditor; 