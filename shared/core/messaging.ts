import { IMessageSender, INotificationProvider } from '../types';
import { ModeManager } from './modes';

export class MessageHandler {
  constructor(
    private modeManager: ModeManager,
    private messageSender: IMessageSender,
    private notifications: INotificationProvider
  ) {}

  public async sendMessage(content: string, sessionId: string, isIframe: boolean): Promise<void> {
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

  private filterCommandString(input: string): string {
    // Remove special comment blocks
    return input.replace(/\/\*\*[\s\S]*?\*\*\//g, '').trim();
  }
} 