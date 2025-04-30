import React, { useState, useRef } from 'react';
import { SpeechInput } from './SpeechEditor';

// --- Interface Definitions (assuming these are correct as provided) ---
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
  interpretation: any;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionError extends Event {
  error: string;
  message: string;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionError) => void;
  onaudiostart: () => void;
  onaudioend: () => void;
  onend: () => void;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}
interface Message {
  id: string;
  type: "user" | "yeshie";
  content: string;
}
interface YeshieEditorProps {
  sessionId?: string;
  onClose?: () => void;
}

// --- Punctuation Map ---
const punctuationMap: { [key: string]: string } = {
  'period': '.',
  'comma': ',',
  'exclamation mark': '!', // Changed from 'exclamation' for clarity
  'exclamation point': '!', // Added alternative
  'question mark': '?',
  'semicolon': ';',
  'colon': ':',
  'open paren': '(',
  'close paren': ')',
  'open bracket': '[',
  'close bracket': ']',
  'open brace': '{',
  'close brace': '}',
  'open quote': '"',
  'close quote': '"',
  'single quote': "'",
  'apostrophe': "'",
  'hyphen': '-',
  'dash': '—', // Em dash
  'ellipsis': '...'
};

const YeshieEditor: React.FC<YeshieEditorProps> = ({ sessionId, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  const handleTextSubmit = (text: string) => {
    if (text.trim()) {
      // Add user message
      const userMessage: Message = {
        id: Math.random().toString(36).substring(7),
        type: "user",
        content: text,
      };
      setMessages(prev => [...prev, userMessage]);

      // Simulate response after 500ms
      setTimeout(() => {
        const responseMessage: Message = {
          id: Math.random().toString(36).substring(7),
          type: "yeshie",
          content: "response here",
        };
        setMessages(prev => [...prev, responseMessage]);
      }, 500);
    }
  };

  const displayHelp = () => {
    setShowHelp(true);
    const helpMessage: Message = {
              id: Math.random().toString(36).substring(7),
              type: "yeshie",
      content: `Available commands:
- Punctuation: period, comma, exclamation, question mark, semicolon, colon
- Brackets: open paren, close paren, open bracket, close bracket
- Quotes: open quote, close quote, single quote
- Other: hyphen, dash, ellipsis
- Say "literally" before any command to use the word instead of the symbol
- Say "all caps" to start capitalizing, "end caps" to stop`
    };
    setMessages(prev => [...prev, helpMessage]);
  };

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
      <div className="messages-area" style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
      }}>
        {messages.map(message => (
          <div key={message.id} className={`message ${message.type}`} style={{
              maxWidth: '80%',
            alignSelf: message.type === 'user' ? 'flex-end' : 'flex-start',
            backgroundColor: message.type === 'user' ? '#007AFF' : '#F0F0F0',
            color: message.type === 'user' ? '#fff' : '#000',
              padding: '12px 16px',
              borderRadius: '12px',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap'
          }}>
            {message.content}
          </div>
        ))}
      </div>
      <div style={{
          borderTop: '1px solid #e0e0e0',
          padding: '16px',
        backgroundColor: '#f8f8f8'
      }}>
        <SpeechInput
          onSubmit={handleTextSubmit}
          onShowHelp={displayHelp}
          initialText=""
        />
      </div>
    </div>
  );
};

export default YeshieEditor; 