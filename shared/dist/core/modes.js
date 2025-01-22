const MODE_STORAGE_KEY = 'editorMode';
export class ModeManager {
    constructor(storage, notifications, defaultMode = 'llm') {
        this.storage = storage;
        this.notifications = notifications;
        const savedMode = this.storage.getItem(MODE_STORAGE_KEY);
        this.currentMode = savedMode || defaultMode;
    }
    getMode() {
        return this.currentMode;
    }
    changeMode(newMode) {
        if (newMode === this.currentMode)
            return;
        this.currentMode = newMode;
        this.storage.setItem(MODE_STORAGE_KEY, newMode);
        this.notifications.showModeChange(newMode);
    }
    isCommandMode() {
        return this.currentMode === 'command';
    }
    isLLMMode() {
        return this.currentMode === 'llm';
    }
}
