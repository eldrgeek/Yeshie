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
  private feedbackStyleInjected: boolean = false; // Flag for CSS injection
  private static readonly CLICK_FEEDBACK_CLASS = 'yeshie-click-feedback'; // Renamed for clarity
  private static readonly FOCUS_FEEDBACK_CLASS = 'yeshie-focus-feedback'; // New class for focus
  private lastClickedElement: HTMLElement | null = null; // Track last clicked element
  private lastClickTimestamp: number = 0; // Track last click time

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

  // --- Inject CSS for Click Feedback ---
  private injectFeedbackStyle(): void {
    if (this.feedbackStyleInjected) return;
    const style = document.createElement('style');
    style.textContent = `
      .${PageObserver.CLICK_FEEDBACK_CLASS} {
          outline: 2px solid #FF4500 !important; /* Bright orange-red */
          box-shadow: 0 0 8px 3px rgba(255, 69, 0, 0.6) !important;
          transition: outline 0.15s ease-out, box-shadow 0.15s ease-out;
          border-radius: 3px; /* Optional: slight rounding */
          z-index: 2147483646 !important; /* Ensure visibility */
          pointer-events: none !important; /* Prevent interference */
      }
      .${PageObserver.FOCUS_FEEDBACK_CLASS} {
          outline: 2px solid #007bff !important; /* Bright blue */
          box-shadow: 0 0 8px 3px rgba(0, 123, 255, 0.6) !important;
          transition: outline 0.15s ease-out, box-shadow 0.15s ease-out;
          border-radius: 3px; /* Optional: slight rounding */
          z-index: 2147483646 !important; /* Ensure visibility */
          pointer-events: none !important; /* Prevent interference */
      }
    `;
    document.head.appendChild(style);
    this.feedbackStyleInjected = true;
    console.log('Injected click feedback style');
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
    const focusedElement = event.target as HTMLElement; // Cast to HTMLElement
    if (focusedElement !== this.lastFocusedElement) {
      this.lastFocusedElement = focusedElement;
      // Pass selector instead of element to buffer if needed later, element is fine for now
      this.addToBuffer({ type: 'elementFocus', details: { selector: this.getSimpleSelector(focusedElement)} });

      // Apply visual feedback if collecting
      if (this.isCollecting && focusedElement && typeof focusedElement.classList !== 'undefined') {
        this.injectFeedbackStyle(); // Ensure styles are injected
        
        const now = Date.now();
        const isRecentClickOnSameElement = 
              focusedElement === this.lastClickedElement && 
              (now - this.lastClickTimestamp < 150); // Increased threshold slightly

        const applyFocusFeedback = () => {
          focusedElement.classList.add(PageObserver.FOCUS_FEEDBACK_CLASS);
          setTimeout(() => {
            if (focusedElement && focusedElement.classList) { 
              focusedElement.classList.remove(PageObserver.FOCUS_FEEDBACK_CLASS);
            }
          }, 300); // Duration of focus flash
        };

        if (isRecentClickOnSameElement) {
          // Delay focus feedback if it was likely triggered by a recent click
          console.log('Delaying focus feedback due to recent click');
          setTimeout(applyFocusFeedback, 100); // Apply blue after 100ms
        } else {
          // Apply focus feedback immediately
          applyFocusFeedback();
        }
      } else if (!this.isCollecting) {
          console.log('Focus occurred, but not collecting - no feedback applied.');
      }
    }
  }

  private handleMouseEvent(event: MouseEvent): void {
    // Ensure feedback style is injected (only runs once)
    this.injectFeedbackStyle(); 
    
    const target = event.target as HTMLElement; // Cast to HTMLElement
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

    // Apply visual feedback if collecting
    if (this.isCollecting && target) {
        // Store click info for focus handler coordination
        this.lastClickedElement = target;
        this.lastClickTimestamp = Date.now();

        // Apply click feedback immediately
        target.classList.add(PageObserver.CLICK_FEEDBACK_CLASS);
        setTimeout(() => {
            if (target && target.classList) { 
              target.classList.remove(PageObserver.CLICK_FEEDBACK_CLASS);
            }
        }, 300); // Duration of the click feedback flash
    } else if (!this.isCollecting) {
        console.log('Click occurred, but not collecting - no feedback applied.');
    }
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
    console.log('Observer event received:', event);
    if (this.isCollecting) {
      console.log('Adding event to buffer:', event);
      this.buffer.push(event);
      if (this.callback) {
        this.callback(event);
      }
    } else {
      console.log('Event not collected - isCollecting is false');
    }
  }

  public start(): void {
    console.log('Observer starting collection');
    this.buffer = [];
    this.isCollecting = true;
  }

  public stop(): void {
    console.log('Observer stopping collection');
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