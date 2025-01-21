import { EditorMode, INotificationProvider, IStorageProvider } from '../types';

const MODE_STORAGE_KEY = 'editorMode';

export class ModeManager {
  private currentMode: EditorMode;

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
  }

  public isCommandMode(): boolean {
    return this.currentMode === 'command';
  }

  public isLLMMode(): boolean {
    return this.currentMode === 'llm';
  }
} 