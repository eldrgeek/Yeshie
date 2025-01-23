import { IMessageSender, INotificationProvider } from '../types';
import { ModeManager } from './modes';
export declare class MessageHandler {
    private modeManager;
    private messageSender;
    private notifications;
    constructor(modeManager: ModeManager, messageSender: IMessageSender, notifications: INotificationProvider);
    sendMessage(content: string, sessionId: string, isIframe: boolean): Promise<void>;
    private handleModeChange;
    private filterCommandString;
}
