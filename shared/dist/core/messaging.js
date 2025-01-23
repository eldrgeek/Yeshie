export class MessageHandler {
    constructor(modeManager, messageSender, notifications) {
        this.modeManager = modeManager;
        this.messageSender = messageSender;
        this.notifications = notifications;
    }
    async sendMessage(content, sessionId, isIframe) {
        // Check for mode change first
        if (this.handleModeChange(content, isIframe)) {
            return;
        }
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
                await this.sendCommandContent(content, sessionId);
            }
        }
        catch (error) {
            this.notifications.showError(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async sendCommandContent(content, sessionId) {
        content = this.filterCommandString(content);
        const lines = content.split("\n").filter(line => line.trim());
        const sendLine = async (index) => {
            if (index >= lines.length)
                return;
            const line = lines[index].trim();
            if (!line.startsWith("//")) {
                if (line.startsWith('message ')) {
                    this.notifications.showInfo(line.substring(8));
                }
                else {
                    await this.messageSender.sendCommandMessage(line);
                    this.notifications.showInfo(`Command sent: ${line}`);
                }
            }
            // Schedule next line
            setTimeout(() => sendLine(index + 1), 1000);
        };
        await sendLine(0);
    }
    handleModeChange(content, isIframe) {
        const lines = content.split('\n');
        const lastLine = lines[lines.length - 1].trim();
        if (lastLine === 'command') {
            if (!isIframe) {
                this.notifications.showError('Command mode only works in iframe context');
                return true;
            }
            this.modeManager.changeMode('command');
            return true;
        }
        else if (lastLine === 'llm') {
            this.modeManager.changeMode('llm');
            return true;
        }
        return false;
    }
    filterCommandString(input) {
        // Remove special comment blocks
        return input.replace(/\/\*\*[\s\S]*?\*\*\//g, '').trim();
    }
}
