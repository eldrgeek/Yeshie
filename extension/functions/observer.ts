// observer.ts
import { logInfo } from "./logger";

type ObserverCallback = (event: ObserverEvent) => void;

type ObserverEventType = 'dom' | 'location' | 'focus' | 'elementFocus' | 'keydown' | 'keyup' | 'click' | 'mousemove';

interface ObserverEvent {
  type: ObserverEventType;
  details: any;
}

class PageObserver {
  private buffer: ObserverEvent[] = [];
  private observer: MutationObserver;
  private lastLocation: string = '';
  private lastFocusedElement: Element | null = null;
  private isCollecting: boolean = false;
  private callback: ((event: ObserverEvent) => void) | null = null;

  constructor() {
    this.observer = new MutationObserver(this.handleMutations.bind(this));
    this.install();
  }
  

  private install(): void {
    // Observe DOM changes
    const config: MutationObserverInit = {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true
    };
    this.observer.observe(document.body, config);

    // Observe location changes
    this.lastLocation = window.location.href;
    window.addEventListener('popstate', this.checkLocationChange.bind(this));
    const originalPushState = history.pushState;
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.checkLocationChange();
    };

    // Observe page focus
    window.addEventListener('focus', () => this.addToBuffer({ type: 'focus', details: true }));
    window.addEventListener('blur', () => this.addToBuffer({ type: 'focus', details: false }));

    // Observe focused element
    document.addEventListener('focus', this.checkFocusedElement.bind(this), true);

    // Observe mouse events - only clicks
    document.addEventListener('click', this.handleMouseEvent.bind(this));

    // Observe keyboard events
    document.addEventListener('keydown', this.handleKeyEvent.bind(this));
  }

  private handleMutations(mutations: MutationRecord[]): void {
    // Only track mutations that are direct results of user interactions
    const significantMutations = mutations.filter(mutation => {
      const target = mutation.target as Element;
      // Only track changes to form elements that are likely user-initiated
      return (
        (target instanceof HTMLInputElement ||
         target instanceof HTMLTextAreaElement ||
         target instanceof HTMLSelectElement) &&
        (mutation.type === 'attributes' && 
         (mutation.attributeName === 'value' || 
          mutation.attributeName === 'checked' ||
          mutation.attributeName === 'selected'))
      );
    });

    if (significantMutations.length > 0) {
      this.addToBuffer({
        type: 'dom',
        details: {
          type: 'significant',
          mutations: significantMutations.map(mutation => ({
            type: mutation.type,
            target: this.getSimpleSelector(mutation.target as Element),
            attributeName: mutation.attributeName,
            newValue: mutation.target instanceof HTMLInputElement ? 
              mutation.target.value : 
              mutation.target.textContent
          }))
        }
      });
    }
  }

  private checkLocationChange(): void {
    const currentLocation = window.location.href;
    if (currentLocation !== this.lastLocation) {
      this.lastLocation = currentLocation;
      this.addToBuffer({ type: 'location', details: currentLocation });
    }
  }

  private checkFocusedElement(event: FocusEvent): void {
    const focusedElement = event.target as Element;
    if (focusedElement !== this.lastFocusedElement) {
      this.lastFocusedElement = focusedElement;
      this.addToBuffer({ type: 'elementFocus', details: focusedElement });
    }
  }

  private handleMouseEvent(event: MouseEvent): void {
    const target = event.target as Element;
    const selector = this.getSimpleSelector(target);
    const label = this.getElementText(target);

    // Track all clicks, but add more details for interactive elements
    const isInteractive = 
      target instanceof HTMLButtonElement ||
      target instanceof HTMLAnchorElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement;

    this.addToBuffer({
      type: 'click',
      details: {
        selector,
        label: label || undefined,
        isInteractive,
        tagName: target.tagName.toLowerCase(),
        id: target.id || undefined,
        className: target.className || undefined,
        attributes: this.getElementAttributes(target)
      }
    });
  }

  private getElementAttributes(element: Element): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }
    return attributes;
  }

  private getSimpleSelector(element: Element | null): string {
    if (!element || element === document.body) {
      return '';
    }

    let selector = element.tagName.toLowerCase();
    
    if (element.id) {
      selector += `#${element.id}`;
    } else if (element.className) {
      // Split class names and join them with dots to create a proper CSS class selector
      const classes = Array.from(element.classList).join('.');
      selector += classes ? '.' + classes : '';
    }

    return selector;
  }

  private getElementText(element: Element): string | null {
    // First, try to get text content directly from the element
    let text = element.textContent?.trim();

    // If no text content, check for 'value' attribute (for inputs, textareas, etc.)
    if (!text && 'value' in element) {
      text = (element as HTMLInputElement).value.trim();
    }

    // If no text content or value, check for 'alt' attribute (for images)
    if (!text && element instanceof HTMLImageElement) {
      text = element.alt.trim();
    }

    // If still no text, check aria-label
    if (!text) {
      text = element.getAttribute('aria-label')?.trim() || null;
    }

    return text || null;
  }

  private handleKeyEvent(event: KeyboardEvent): void {
    // Filter out Ctrl-Shift-L keypress
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'l') {
      return;
    }

    // Only track significant key events
    if (
      event.key === 'Enter' ||
      event.key === 'Escape' ||
      event.key === 'Tab' ||
      (event.ctrlKey && event.key.toLowerCase() === 'c') ||
      (event.ctrlKey && event.key.toLowerCase() === 'v')
    ) {
      this.addToBuffer({
        type: 'keydown',
        details: {
          key: event.key,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          target: this.getSimpleSelector(event.target as Element)
        }
      });
    }
  }

  private addToBuffer(event: ObserverEvent): void {
    logInfo("PageObserver", "Observer event received", { event });
    if (this.isCollecting) {
      logInfo("PageObserver", "Adding event to buffer", { event });
      this.buffer.push(event);
      if (this.callback) {
        this.callback(event);
      }
    } else {
      logInfo("PageObserver", "Event not collected - isCollecting is false");
    }
  }

  public start(): void {
    logInfo("PageObserver", "Observer starting collection");
    this.buffer = [];
    this.isCollecting = true;
  }

  public stop(): void {
    logInfo("PageObserver", "Observer stopping collection");
    this.isCollecting = false;
  }

  public pause(): void {
    this.isCollecting = false;
  }

  public resume(): void {
    this.isCollecting = true;
  }

  public request(): ObserverEvent[] {
    return [...this.buffer];
  }

  public registerCallback(callback: (event: ObserverEvent) => void): void {
    this.callback = callback;
  }

  public unregisterCallback(): void {
    this.callback = null;
  }

  public clear(): void {
    this.buffer = [];
  }
}

// Create and export a singleton instance
export const pageObserver = new PageObserver();

// Export the types for use in other files
export type { ObserverCallback, ObserverEvent, ObserverEventType };