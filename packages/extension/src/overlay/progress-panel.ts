import { overlayStyles } from './styles.js';

export interface StepInfo {
  id: string;
  label: string;
}

export type StepStatus = 'pending' | 'running' | 'ok' | 'error' | 'skipped';

export interface ProgressPanelCallbacks {
  onCancel?: (runId: string) => void;
  onSuggest?: (data: { runId: string; suggestion: string }) => void;
}

const STATUS_ICONS: Record<StepStatus, string> = {
  pending: '○',
  running: '⏳',
  ok: '✅',
  error: '❌',
  skipped: '⏭',
};

export interface ProgressPanel {
  show(runId: string, taskName: string, steps: StepInfo[]): void;
  hide(): void;
  updateStep(stepId: string, status: StepStatus, opts?: { detail?: string; durationMs?: number }): void;
  readonly shadowRoot: ShadowRoot;
}

export function createProgressPanel(
  container: HTMLElement,
  callbacks: ProgressPanelCallbacks = {}
): ProgressPanel {
  const host = document.createElement('div');
  host.id = 'yeshie-overlay-host';
  container.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = overlayStyles;
  shadow.appendChild(style);

  // Build overlay structure
  const overlay = document.createElement('div');
  overlay.id = 'yeshie-overlay';
  shadow.appendChild(overlay);

  overlay.innerHTML = `
    <div class="yeshie-header">
      <span class="yeshie-logo">Y</span>
      <span class="yeshie-title"></span>
      <button class="yeshie-minimize">_</button>
    </div>
    <div class="yeshie-body">
      <div class="yeshie-steps"></div>
      <div class="yeshie-controls">
        <button class="yeshie-suggest-btn">💬 Suggest</button>
        <button class="yeshie-cancel-btn">✖ Cancel</button>
      </div>
      <div class="yeshie-suggest-input">
        <input type="text" placeholder="What should Yeshie do differently?" />
        <button>Send</button>
      </div>
    </div>
  `;

  const titleEl = shadow.querySelector('.yeshie-title') as HTMLElement;
  const stepsEl = shadow.querySelector('.yeshie-steps') as HTMLElement;
  const bodyEl = shadow.querySelector('.yeshie-body') as HTMLElement;
  const minimizeBtn = shadow.querySelector('.yeshie-minimize') as HTMLButtonElement;
  const cancelBtn = shadow.querySelector('.yeshie-cancel-btn') as HTMLButtonElement;
  const suggestBtn = shadow.querySelector('.yeshie-suggest-btn') as HTMLButtonElement;
  const suggestInputArea = shadow.querySelector('.yeshie-suggest-input') as HTMLElement;
  const suggestInput = suggestInputArea.querySelector('input') as HTMLInputElement;
  const suggestSend = suggestInputArea.querySelector('button') as HTMLButtonElement;

  let currentRunId = '';
  let minimized = false;

  // Minimize toggle
  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    minimized = !minimized;
    bodyEl.classList.toggle('minimized', minimized);
    minimizeBtn.textContent = minimized ? '▢' : '_';
  });

  // Cancel
  cancelBtn.addEventListener('click', () => {
    callbacks.onCancel?.(currentRunId);
  });

  // Suggest flow
  suggestBtn.addEventListener('click', () => {
    suggestInputArea.classList.toggle('active');
    if (suggestInputArea.classList.contains('active')) {
      suggestInput.focus();
    }
  });

  suggestSend.addEventListener('click', () => {
    const suggestion = suggestInput.value.trim();
    if (suggestion) {
      callbacks.onSuggest?.({ runId: currentRunId, suggestion });
      suggestInput.value = '';
      suggestInputArea.classList.remove('active');
    }
  });

  return {
    get shadowRoot() { return shadow; },

    show(runId: string, taskName: string, steps: StepInfo[]) {
      currentRunId = runId;
      titleEl.textContent = taskName;
      minimized = false;
      bodyEl.classList.remove('minimized');
      minimizeBtn.textContent = '_';
      suggestInputArea.classList.remove('active');
      suggestInput.value = '';

      stepsEl.innerHTML = '';
      for (const step of steps) {
        const el = document.createElement('div');
        el.className = 'yeshie-step pending';
        el.dataset.stepId = step.id;
        el.textContent = `${STATUS_ICONS.pending} ${step.label}`;
        stepsEl.appendChild(el);
      }

      overlay.classList.add('visible');
    },

    hide() {
      overlay.classList.remove('visible');
    },

    updateStep(stepId: string, status: StepStatus, opts?: { detail?: string; durationMs?: number }) {
      const el = stepsEl.querySelector(`[data-step-id="${stepId}"]`) as HTMLElement | null;
      if (!el) return;

      el.className = `yeshie-step ${status}`;
      const label = el.textContent?.replace(/^[^\s]+\s/, '') || '';
      // Strip old detail span text from label
      const baseLabel = label.replace(/\s*\S+$/, '').trim() || label;

      // Reconstruct: find original label from the text content after icon
      const originalText = el.textContent || '';
      const textAfterIcon = originalText.replace(/^.*?\s/, '');
      // Remove any existing detail text (inside a span)
      const existingDetail = el.querySelector('.detail');
      const baseLabelClean = existingDetail
        ? textAfterIcon.replace(existingDetail.textContent || '', '').trim()
        : textAfterIcon;

      el.textContent = `${STATUS_ICONS[status]} ${baseLabelClean}`;

      if (opts?.detail) {
        const detailSpan = document.createElement('span');
        detailSpan.className = 'detail';
        detailSpan.textContent = opts.detail;
        el.appendChild(detailSpan);
      }
    },
  };
}
