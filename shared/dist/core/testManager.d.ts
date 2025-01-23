import { ConversationEntry } from "../types";
export declare class TestManager {
    private testConversation;
    private currentTestStep;
    private isTestMode;
    constructor(testConversation: ConversationEntry[]);
    startTest(clearEditor: () => void, displayNextEntry: () => void): void;
    startTestAll(updateContent: (newContent: string, mode: "append" | "replace") => void, isIframe: boolean, sendPostMessage: (content: string) => void): void;
    handleTestMode(lastLine: string, addBlankLine: () => void, updateContent: (newContent: string, mode: "append" | "replace") => void, isIframe: boolean, sendPostMessage: (content: string) => void): boolean;
    private formatEntry;
}
