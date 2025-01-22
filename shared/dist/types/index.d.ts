export type EditorMode = 'command' | 'llm';
export interface IMessageSender {
    sendLLMMessage: (content: string, sessionId: string) => Promise<void>;
    sendCommandMessage: (content: string) => Promise<void>;
}
export interface INotificationProvider {
    showModeChange: (mode: EditorMode) => void;
    showError: (message: string) => void;
    showInfo: (message: string) => void;
}
export interface IStorageProvider {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}
export interface ConversationEntry {
    from: 'U' | 'Y';
    text: string;
    actions?: string[];
}
export interface IEditorProvider {
    getContent: () => string;
    setContent: (content: string, mode?: 'append' | 'replace') => void;
    getCurrentLine: () => string;
    addNewLine: () => void;
}
