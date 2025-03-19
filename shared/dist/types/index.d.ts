export type EditorMode = 'command' | 'llm' | 'pro' | 'deploy' | 'schema';
export interface IMessageSender {
    sendLLMMessage: (content: string, sessionId: string) => Promise<void>;
    sendCommandMessage: (line: string) => Promise<void>;
    sendDeploymentCommand?: (provider: string, command: string) => Promise<void>;
    sendSchemaOperation?: (operation: string, schema: any) => Promise<void>;
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
    metadata?: {
        type?: 'schema' | 'deployment' | 'file-upload' | 'command';
        provider?: string;
        command?: string;
        schema?: any;
    };
}
export interface IEditorProvider {
    getContent: () => string;
    setContent: (content: string, mode?: 'append' | 'replace') => void;
    getCurrentLine: () => string;
    addNewLine: () => void;
}
