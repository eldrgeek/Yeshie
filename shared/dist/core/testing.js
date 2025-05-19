import { logInfo } from "../utils/logger";
export const TEST_CONVERSATION = [
    {
        from: 'Y',
        text: `Hi! I'm Yeshie, your AI coding assistant. I can help you with:

1. Writing and debugging code
2. Answering programming questions
3. Explaining concepts
4. Running commands

Try typing something, or press Enter to continue the demo.`,
    },
    {
        from: 'U',
        text: 'Can you help me understand what this codebase does?',
    },
    {
        from: 'Y',
        text: `I'll help you understand the codebase. Let me check what files we have.`,
        actions: [
            'message Scanning repository...',
            'ls -R',
        ],
    },
    {
        from: 'U',
        text: 'Can you show me the main components?',
    },
    {
        from: 'Y',
        text: `I'll help you explore the main components. Let me show you the key files.`,
        actions: [
            'find . -name "*.tsx" -o -name "*.ts" | grep -v "node_modules"',
        ],
    }
];
export const DEFAULT_CONTENT = `# Welcome to Yeshie
Type 'test' for an interactive demo or 'testall' to see a complete conversation.

`;
export class TestConversationHandler {
    constructor(editor, messageSender, notifications) {
        this.editor = editor;
        this.messageSender = messageSender;
        this.notifications = notifications;
        this.currentStep = 0;
        this.isTestMode = false;
    }
    handleTestCommand(command, isIframe) {
        const lastLine = this.editor.getCurrentLine().trim();
        if (lastLine !== 'test' && lastLine !== 'testall') {
            return false;
        }
        if (lastLine === 'test') {
            this.startTestMode();
        }
        else {
            this.showFullConversation(isIframe);
        }
        return true;
    }
    startTestMode() {
        logInfo("Starting test mode");
        this.isTestMode = true;
        this.currentStep = 0;
        this.editor.setContent("", "replace");
        // Display first entry
        setTimeout(() => {
            const entry = TEST_CONVERSATION[0];
            this.editor.setContent(this.formatEntry(entry, true), "replace");
        }, 0);
        this.currentStep = 1;
    }
    showFullConversation(isIframe) {
        logInfo("Starting testall mode");
        this.isTestMode = false;
        const allContent = TEST_CONVERSATION
            .map((entry, index) => this.formatEntry(entry, index === 0))
            .join("");
        this.editor.setContent(allContent, "replace");
        if (isIframe) {
            TEST_CONVERSATION.forEach(entry => {
                if (entry.actions?.length) {
                    entry.actions.forEach(action => {
                        this.messageSender.sendCommandMessage(action);
                    });
                }
            });
        }
    }
    handleTestModeEnter() {
        if (!this.isTestMode) {
            return false;
        }
        logInfo("Test mode state:", { currentStep: this.currentStep });
        if (this.currentStep >= TEST_CONVERSATION.length - 1) {
            logInfo("Reached end of conversation");
            this.isTestMode = false;
            return true;
        }
        const currentEntry = TEST_CONVERSATION[this.currentStep];
        const nextStep = this.currentStep + 1;
        const nextEntry = TEST_CONVERSATION[nextStep];
        // If current entry is from user (U), check for input
        if (currentEntry.from === 'U') {
            const hasResponse = this.editor.getCurrentLine().trim() !== "";
            if (!hasResponse) {
                this.editor.addNewLine();
            }
            else {
                this.editor.setContent(this.formatEntry(currentEntry, true), "append");
            }
            // Move to next entry (Yeshie's response) after a delay
            setTimeout(() => {
                this.editor.setContent(this.formatEntry(nextEntry, true), "replace");
                this.currentStep = nextStep + 1;
            }, 300);
        }
        else {
            // For Yeshie's entries, just show the next entry
            this.editor.setContent(this.formatEntry(nextEntry, true), "replace");
            this.currentStep = nextStep;
        }
        return true;
    }
    formatEntry(entry, isFirst = false) {
        // Use blockquote for user messages and regular text for Yeshie
        const formattedText = entry.from === "U"
            ? `> ${entry.text.split('\n').join('\n> ')}` // Prefix each line with > for user messages
            : entry.text;
        return (isFirst ? "" : "\n") + formattedText + "\n\n";
    }
}
