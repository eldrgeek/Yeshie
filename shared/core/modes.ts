import { EditorMode, INotificationProvider, IStorageProvider } from '../types';

const MODE_STORAGE_KEY = 'editorMode';

type ModeChangeListener = (newMode: EditorMode) => void;

export class ModeManager {
  private currentMode: EditorMode;
  private listeners: Set<ModeChangeListener> = new Set();

  constructor(
    private storage: IStorageProvider,
    private notifications: INotificationProvider,
    defaultMode: EditorMode = 'llm'
  ) {
    const savedMode = this.storage.getItem(MODE_STORAGE_KEY) as EditorMode | null;
    this.currentMode = savedMode || defaultMode;
  }

  public getMode(): EditorMode {
    return this.currentMode;
  }

  public changeMode(newMode: EditorMode): void {
    if (newMode === this.currentMode) return;
    
    this.currentMode = newMode;
    this.storage.setItem(MODE_STORAGE_KEY, newMode);
    this.notifications.showModeChange(newMode);
    
    // Notify all listeners
    this.listeners.forEach(listener => listener(newMode));
  }

  public onModeChange(listener: ModeChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public isCommandMode(): boolean {
    return this.currentMode === 'command';
  }

  public isLLMMode(): boolean {
    return this.currentMode === 'llm';
  }
} 