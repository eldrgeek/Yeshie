import { IMessageSender, INotificationProvider } from '../types';
import { ModeManager } from './modes';

export class MessageHandler {
  constructor(
    private modeManager: ModeManager,
    private messageSender: IMessageSender,
    private notifications: INotificationProvider
  ) {}

  public async sendMessage(content: string, sessionId: string, isIframe: boolean): Promise<void> {
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
      } else if (mode === 'command') {
        if (!isIframe) {
          this.notifications.showError('Command mode only works in iframe context');
          return;
        }
        await this.messageSender.sendCommandMessage(content);
        this.notifications.showInfo('Command sent');
      }
    } catch (error) {
      this.notifications.showError(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private handleModeChange(content: string, isIframe: boolean): boolean {
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1].trim();

    if (lastLine === 'command') {
      if (!isIframe) {
        this.notifications.showError('Command mode only works in iframe context');
        return true;
      }
      this.modeManager.changeMode('command');
      return true;
    } else if (lastLine === 'llm') {
      this.modeManager.changeMode('llm');
      return true;
    }

    return false;
  }

  private filterCommandString(input: string): string {
    // Remove special comment blocks
    return input.replace(/\/\*\*[\s\S]*?\*\*\//g, '').trim();
  }
} 