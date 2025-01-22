import { EditorMode, INotificationProvider, IStorageProvider } from '../types';
export declare class ModeManager {
    private storage;
    private notifications;
    private currentMode;
    constructor(storage: IStorageProvider, notifications: INotificationProvider, defaultMode?: EditorMode);
    getMode(): EditorMode;
    changeMode(newMode: EditorMode): void;
    isCommandMode(): boolean;
    isLLMMode(): boolean;
}
