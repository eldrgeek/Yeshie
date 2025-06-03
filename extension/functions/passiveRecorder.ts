// extension/functions/passiveRecorder.ts

export type RecordedEvent =
  | { type: "click"; selector: string; timestamp: number }
  | { type: "input"; selector: string; value: string; timestamp: number }
  | { type: "focus"; selector: string; timestamp: number };

let recordedEvents: RecordedEvent[] = [];
let observer: MutationObserver | null = null;

function getUniqueSelector(el: Element): string {
  // Try ID first
  if (el.id) return `#${el.id}`;
  
  // Try data attributes
  if (el.hasAttribute('data-testid')) {
    return `[data-testid="${el.getAttribute('data-testid')}"]`;
  }
  if (el.hasAttribute('data-id')) {
    return `[data-id="${el.getAttribute('data-id')}"]`;
  }
  
  // Try name attribute for form elements
  if (el.hasAttribute('name')) {
    return `${el.tagName.toLowerCase()}[name="${el.getAttribute('name')}"]`;
  }
  
  // Try class names
  if (el.className && typeof el.className === "string") {
    const classes = el.className.trim().split(/\s+/).filter(cls => cls.length > 0);
    if (classes.length > 0) {
      return `${el.tagName.toLowerCase()}.${classes.join(".")}`;
    }
  }
  
  // Try role attribute
  if (el.hasAttribute('role')) {
    return `${el.tagName.toLowerCase()}[role="${el.getAttribute('role')}"]`;
  }
  
  // Fall back to tag name
  return el.tagName.toLowerCase();
}

export function startRecording() {
  recordedEvents = [];

  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);
  document.addEventListener("change", handleChange, true); // Also capture change events
  document.addEventListener("keyup", handleKeyUp, true); // Capture key events for better text input tracking
  document.addEventListener("focus", handleFocus, true);

  observer = new MutationObserver(() => {});
  observer.observe(document.body, { childList: true, subtree: true });

  console.log("📹 Yeshie Recorder started - events will be captured");
  console.log("📹 Current recorded events count:", recordedEvents.length);
}

export function stopRecording(): RecordedEvent[] {
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("input", handleInput, true);
  document.removeEventListener("change", handleChange, true);
  document.removeEventListener("keyup", handleKeyUp, true);
  document.removeEventListener("focus", handleFocus, true);

  observer?.disconnect();
  observer = null;

  console.log("📹 Yeshie Recorder stopped - returning events");
  console.log("🔍 Final recorded events count:", recordedEvents.length);
  console.log("🔍 Recorded events:", recordedEvents);

  return [...recordedEvents];
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target) return;

  // Skip clicks on Yeshie UI elements
  if (target.closest('.yeshie-ui') || target.closest('[style*="2147483647"]')) {
    console.log("🔍 Skipping click on Yeshie UI element");
    return;
  }

  const selector = getUniqueSelector(target);
  console.log(`🔍 Recording click on: ${selector}`);
  
  recordedEvents.push({
    type: "click",
    selector,
    timestamp: Date.now()
  });
}

function handleInput(e: Event) {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (!target || typeof target.value !== "string") return;

  // Skip input on Yeshie UI elements
  if (target.closest('.yeshie-ui') || target.closest('[style*="2147483647"]')) {
    console.log("🔍 Skipping input on Yeshie UI element");
    return;
  }

  const selector = getUniqueSelector(target);
  console.log(`🔍 Recording input on: ${selector}, value: "${target.value}"`);

  // Update existing input event for the same element or add new one
  const existingIndex = recordedEvents.findIndex(
    event => event.type === "input" && event.selector === selector
  );

  const inputEvent = {
    type: "input" as const,
    selector,
    value: target.value,
    timestamp: Date.now()
  };

  if (existingIndex >= 0) {
    // Update existing input event
    recordedEvents[existingIndex] = inputEvent;
  } else {
    // Add new input event
    recordedEvents.push(inputEvent);
  }
}

function handleChange(e: Event) {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (!target) return;

  // Skip change on Yeshie UI elements
  if (target.closest('.yeshie-ui') || target.closest('[style*="2147483647"]')) {
    return;
  }

  const selector = getUniqueSelector(target);
  console.log(`🔍 Recording change on: ${selector}, value: "${target.value}"`);

  // For change events, always record as input type
  const changeEvent = {
    type: "input" as const,
    selector,
    value: target.value,
    timestamp: Date.now()
  };

  // Update existing input event for the same element or add new one
  const existingIndex = recordedEvents.findIndex(
    event => event.type === "input" && event.selector === selector
  );

  if (existingIndex >= 0) {
    recordedEvents[existingIndex] = changeEvent;
  } else {
    recordedEvents.push(changeEvent);
  }
}

function handleKeyUp(e: KeyboardEvent) {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (!target || typeof target.value !== "string") return;

  // Skip keyup on Yeshie UI elements
  if (target.closest('.yeshie-ui') || target.closest('[style*="2147483647"]')) {
    return;
  }

  // Only record for text-changing keys (ignore arrow keys, function keys, etc.)
  if (e.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(e.key)) {
    const selector = getUniqueSelector(target);
    console.log(`🔍 Recording keyup on: ${selector}, key: "${e.key}", value: "${target.value}"`);

    // Update existing input event for the same element or add new one
    const existingIndex = recordedEvents.findIndex(
      event => event.type === "input" && event.selector === selector
    );

    const inputEvent = {
      type: "input" as const,
      selector,
      value: target.value,
      timestamp: Date.now()
    };

    if (existingIndex >= 0) {
      recordedEvents[existingIndex] = inputEvent;
    } else {
      recordedEvents.push(inputEvent);
    }
  }
}

function handleFocus(e: FocusEvent) {
  const target = e.target as HTMLElement;
  if (!target) return;

  // Skip focus on Yeshie UI elements
  if (target.closest('.yeshie-ui') || target.closest('[style*="2147483647"]')) {
    console.log("🔍 Skipping focus on Yeshie UI element");
    return;
  }

  const selector = getUniqueSelector(target);
  console.log(`🔍 Recording focus on: ${selector}`);

  recordedEvents.push({
    type: "focus",
    selector,
    timestamp: Date.now()
  });
} 