// extension/functions/passiveRecorder.ts

export type RecordedEvent =
  | { type: "click"; selector: string; timestamp: number }
  | { type: "input"; selector: string; value: string; timestamp: number }
  | { type: "focus"; selector: string; timestamp: number };

let recordedEvents: RecordedEvent[] = [];
let observer: MutationObserver | null = null;

function getUniqueSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  if (el.className && typeof el.className === "string") {
    return `${el.tagName.toLowerCase()}.${el.className.trim().split(/\s+/).join(".")}`;
  }
  return el.tagName.toLowerCase();
}

export function startRecording() {
  recordedEvents = [];

  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("focus", handleFocus, true);

  observer = new MutationObserver(() => {});
  observer.observe(document.body, { childList: true, subtree: true });

  console.log("📹 Yeshie Recorder started");
}

export function stopRecording(): RecordedEvent[] {
  document.removeEventListener("click", handleClick);
  document.removeEventListener("input", handleInput);
  document.removeEventListener("focus", handleFocus, true);

  observer?.disconnect();
  observer = null;

  console.log("📹 Yeshie Recorder stopped");
  console.log("🔍 Recorded events:", recordedEvents);

  return [...recordedEvents];
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target) return;

  recordedEvents.push({
    type: "click",
    selector: getUniqueSelector(target),
    timestamp: Date.now()
  });
}

function handleInput(e: Event) {
  const target = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (!target || typeof target.value !== "string") return;

  recordedEvents.push({
    type: "input",
    selector: getUniqueSelector(target),
    value: target.value,
    timestamp: Date.now()
  });
}

function handleFocus(e: FocusEvent) {
  const target = e.target as HTMLElement;
  if (!target) return;

  recordedEvents.push({
    type: "focus",
    selector: getUniqueSelector(target),
    timestamp: Date.now()
  });
} 