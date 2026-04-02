import { createProgressPanel } from '../overlay/progress-panel.js';
import type { StepStatus } from '../overlay/progress-panel.js';

export default defineContentScript({
  matches: ['https://app.yeshid.com/*'],
  runAt: 'document_idle',
  main() {
    const panel = createProgressPanel(document.body);

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'overlay_show') {
        panel.show(msg.runId, msg.taskName, msg.steps);
        sendResponse({ ok: true });
      } else if (msg.type === 'overlay_step_update') {
        panel.updateStep(msg.stepId, msg.status as StepStatus, {
          detail: msg.detail,
          durationMs: msg.durationMs,
        });
        sendResponse({ ok: true });
      } else if (msg.type === 'overlay_hide') {
        setTimeout(() => panel.hide(), 3000);
        sendResponse({ ok: true });
      }
    });
  }
});
