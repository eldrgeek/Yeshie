const MODE_STORAGE_KEY = 'editorMode';
export class ModeManager {
    constructor(storage, notifications, defaultMode = 'llm') {
        this.storage = storage;
        this.notifications = notifications;
        this.listeners = new Set();
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
        // Notify all listeners
        this.listeners.forEach(listener => listener(newMode));
    }
    onModeChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    isCommandMode() {
        return this.currentMode === 'command';
    }
    isLLMMode() {
        return this.currentMode === 'llm';
    }
}
