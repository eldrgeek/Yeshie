import { createProgressPanel } from '../overlay/progress-panel.js';
import type { StepStatus } from '../overlay/progress-panel.js';
import { createTeachTooltip } from '../overlay/teach-tooltip.js';

export default defineContentScript({
  matches: ['https://app.yeshid.com/*'],
  runAt: 'document_idle',
  main() {
    const panel = createProgressPanel(document.body);
    const teach = createTeachTooltip(document.body);

    teach.onStepComplete((stepIndex) => {
      chrome.runtime.sendMessage({ type: 'teach_step_complete', stepIndex });
    });
    teach.onSkip(() => {
      chrome.runtime.sendMessage({ type: 'teach_skip' });
    });
    teach.onExit(() => {
      chrome.runtime.sendMessage({ type: 'teach_exit' });
    });

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
      } else if (msg.type === 'teach_start') {
        teach.startTeach(msg.steps);
        sendResponse({ ok: true });
      } else if (msg.type === 'teach_goto') {
        teach.gotoStep(msg.stepIndex);
        sendResponse({ ok: true });
      } else if (msg.type === 'teach_end') {
        teach.endTeach();
        sendResponse({ ok: true });
      } else if (msg.type === 'teach_query_step') {
        // Background pings this to check if content script is alive after SPA nav
        sendResponse({ ok: true, stepIndex: teach.getCurrentStep() });
      } else if (msg.type === 'teach_restore') {
        // Re-inject overlay after hard navigation; resume at the checkpointed step
        teach.startTeach(msg.steps);
        if (msg.stepIndex > 0) teach.gotoStep(msg.stepIndex);
        sendResponse({ ok: true });
      }
    });
  }
});
