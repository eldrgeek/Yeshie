export class MessageHandler {
    constructor(modeManager, messageSender, notifications) {
        this.modeManager = modeManager;
        this.messageSender = messageSender;
        this.notifications = notifications;
    }
    async sendMessage(content, sessionId, isIframe) {
        const mode = this.modeManager.getMode();
        try {
            if (mode === 'llm') {
                if (!sessionId) {
                    this.notifications.showError('Session ID is required for LLM mode');
                    return;
                }
                await this.messageSender.sendLLMMessage(content, sessionId);
                this.notifications.showInfo('Message sent to LLM');
            }
            else if (mode === 'command') {
                if (!isIframe) {
                    this.notifications.showError('Command mode only works in iframe context');
                    return;
                }
                await this.messageSender.sendCommandMessage(content);
                this.notifications.showInfo('Command sent');
            }
        }
        catch (error) {
            this.notifications.showError(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    filterCommandString(input) {
        // Remove special comment blocks
        return input.replace(/\/\*\*[\s\S]*?\*\*\//g, '').trim();
    }
}
