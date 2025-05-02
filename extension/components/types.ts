export interface Command {
  id: string;
  text: string;
  executed: boolean;
}

export interface Message {
  id: string;
  type: 'user' | 'yeshie';
  content: string;
  isEdited?: boolean;
  commands?: Command[];
}

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface WebSocketResponse extends WebSocketMessage {
  type: 'response';
  message: string;
  commands?: string[];
}

export interface WebSocketRequest extends WebSocketMessage {
  type: 'message' | 'init';
  conversation?: Array<{ role: string; content: string; }>;
  sessionId: string;
}

export interface LLMResponse {
  message: string;
  commands?: string[];
} 