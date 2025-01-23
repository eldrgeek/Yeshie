import { EditorMode, INotificationProvider, IStorageProvider } from '../types';
type ModeChangeListener = (newMode: EditorMode) => void;
export declare class ModeManager {
    private storage;
    private notifications;
    private currentMode;
    private listeners;
    constructor(storage: IStorageProvider, notifications: INotificationProvider, defaultMode?: EditorMode);
    getMode(): EditorMode;
    changeMode(newMode: EditorMode): void;
    onModeChange(listener: ModeChangeListener): () => void;
    isCommandMode(): boolean;
    isLLMMode(): boolean;
}
export {};
