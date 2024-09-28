// observer.ts

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

    // Observe keyboard events
    document.addEventListener('keydown', this.handleKeyEvent.bind(this));
    document.addEventListener('keyup', this.handleKeyEvent.bind(this));

    // Observe mouse events
    document.addEventListener('click', this.handleMouseEvent.bind(this));
    document.addEventListener('mousemove', this.handleMouseEvent.bind(this));
  }

  private handleMutations(mutations: MutationRecord[]): void {
    for (const mutation of mutations) {
      this.addToBuffer({
        type: 'dom',
        details: {
          type: mutation.type,
          target: mutation.target
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

  private handleKeyEvent(event: KeyboardEvent): void {
    this.addToBuffer({
      type: event.type as 'keydown' | 'keyup',
      details: {
        key: event.key,
        code: event.code,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey
      }
    });
  }

  private handleMouseEvent(event: MouseEvent): void {
    // Filter out events with both x and y coordinates at 0
    if (event.type === 'click' && event.clientX === 0 && event.clientY === 0) {
      return; // Skip this event
    }

    const target = event.target as Element;
    const selector = this.getSimpleSelector(target);
    const label = this.getElementText(target);

    this.addToBuffer({
      type: event.type as 'click' | 'mousemove',
      details: {
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        target: target,
        selector: selector,
        label: label || undefined  // Only include if there's text content
      }
    });
  }

  private getSimpleSelector(element: Element | null): string {
    if (!element || element === document.body) {
      return '';
    }

    let selector = element.tagName.toLowerCase();
    
    if (element.className) {
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

  private addToBuffer(event: ObserverEvent): void {
    if (this.isCollecting) {
      this.buffer.push(event);
      if (this.callback) {
        this.callback(event);
      }
    }
  }

  public start(): void {
    this.buffer = [];
    this.isCollecting = true;
  }

  public stop(): void {
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