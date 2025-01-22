import { ConversationEntry, IEditorProvider, IMessageSender, INotificationProvider } from '../types';
export declare const TEST_CONVERSATION: ConversationEntry[];
export declare const DEFAULT_CONTENT = "# Welcome to Yeshie\nType 'test' for an interactive demo or 'testall' to see a complete conversation.\n\n";
export declare class TestConversationHandler {
    private editor;
    private messageSender;
    private notifications;
    private currentStep;
    private isTestMode;
    constructor(editor: IEditorProvider, messageSender: IMessageSender, notifications: INotificationProvider);
    handleTestCommand(command: string, isIframe: boolean): boolean;
    private startTestMode;
    private showFullConversation;
    handleTestModeEnter(): boolean;
    private formatEntry;
}
