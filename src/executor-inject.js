/**
 * Yeshie Injected Executor v1
 * 
 * Drop this entire script into a single javascript_tool call.
 * It installs window.__yeshie on the page, then call:
 * 
 *   window.__yeshie.run(payload, params) -> Promise<ChainResult>
 * 
 * Active inference model:
 *   - Each step: predict expected outcome, act, observe divergence
 *   - MutationObserver armed BEFORE action fires
 *   - ChainResult returned when chain completes or divergence detected
 *   - No round trips during execution
 */

(function installYeshie() {
  if (window.__yeshie) return; // idempotent

  // ─── UTILITIES ────────────────────────────────────────────────────────────

  function interpolate(str, params) {
    if (typeof str !== 'string') return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? '');
  }

  function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Wait for a condition function to return truthy, using MutationObserver
  function waitFor(conditionFn, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (conditionFn()) return resolve(true);
      const timer = setTimeout(() => {
        obs.disconnect();
        reject(new Error(`waitFor timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      const obs = new MutationObserver(() => {
        if (conditionFn()) {
          clearTimeout(timer);
          obs.disconnect();
          resolve(true);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true,
        attributes: true, characterData: true });
    });
  }

  // ─── STATE ASSESSOR ───────────────────────────────────────────────────────

  function assessState(stateGraph) {
    if (!stateGraph?.nodes) return 'unknown';
    for (const [name, node] of Object.entries(stateGraph.nodes)) {
      if (!node.signals?.length) continue;
      const allMatch = node.signals.every(sig => {
        if (sig.type === 'url_matches') {
          return new RegExp(sig.pattern.replace('$','\\$')).test(window.location.pathname);
        }
        if (sig.type === 'element_visible') {
          const el = document.querySelector(sig.selector);
          return el && el.offsetParent !== null;
        }
        if (sig.type === 'element_text') {
          const el = document.querySelector(sig.selector);
          return el?.textContent?.includes(sig.text);
        }
        return false;
      });
      if (allMatch) return name;
    }
    return 'unknown';
  }

  // ─── TARGET RESOLVER ─────────────────────────────────────────────────────

  function resolveTarget(abstractTarget, abstractTargets) {
    const tgt = abstractTargets?.[abstractTarget];
    if (!tgt) return null;

    // Step 1: cached selector with confidence gate
    if (tgt.cachedSelector && tgt.cachedConfidence >= 0.85) {
      const el = document.querySelector(tgt.cachedSelector);
      if (el) return { el, selector: tgt.cachedSelector, confidence: tgt.cachedConfidence,
                       resolvedVia: 'cached' };
    }

    // Step 2: ARIA search via semanticKeys / vuetify_label
    const labels = tgt.match?.vuetify_label || tgt.semanticKeys || [];
    for (const labelText of labels) {
      // Vuetify label match: find label-like text, get nearest input
      const el = findInputByLabelText(labelText);
      if (el) return { el, selector: '#' + el.id, confidence: 0.88,
                       resolvedVia: 'vuetify_label_match' };
    }

    // Step 3: role + name_contains
    if (tgt.match?.role === 'button' && tgt.match?.name_contains) {
      for (const name of tgt.match.name_contains) {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.trim().toLowerCase().includes(name.toLowerCase())
                  && !b.disabled);
        if (btn) return { el: btn, selector: null, confidence: 0.85,
                          resolvedVia: 'aria' };
      }
    }

    // Step 4: fallback selectors
    for (const sel of (tgt.fallbackSelectors || [])) {
      const el = document.querySelector(sel);
      if (el) return { el, selector: sel, confidence: 0.6,
                       resolvedVia: 'css_cascade' };
    }

    // Step 5: candidates array (used in read steps)
    if (tgt.candidates) {
      for (const sel of tgt.candidates) {
        const el = document.querySelector(sel);
        if (el) return { el, selector: sel, confidence: 0.7,
                         resolvedVia: 'css_cascade' };
      }
    }

    return null; // Step 6: escalate — caller handles
  }

  function findInputByLabelText(labelText) {
    const lower = labelText.toLowerCase();

    // Strategy A: .v-label sibling inside .v-input (classic Vuetify)
    for (const label of document.querySelectorAll('.v-label')) {
      if (label.textContent.trim().toLowerCase().includes(lower)) {
        const inp = label.closest('.v-input')?.querySelector('input, textarea');
        if (inp) return inp;
      }
    }

    // Strategy B: div.mb-2 label above next .v-input (Vuetify no-label variant)
    for (const div of document.querySelectorAll('.mb-2, .text-body-2')) {
      if (div.textContent.trim().toLowerCase().includes(lower) &&
          !div.querySelector('input')) {
        // Walk siblings forward
        let sib = div.nextElementSibling;
        while (sib) {
          const inp = sib.querySelector('input, textarea');
          if (inp) return inp;
          sib = sib.nextElementSibling;
        }
        // Walk parent's next sibling
        const inp = div.parentElement?.nextElementSibling?.querySelector('input, textarea');
        if (inp) return inp;
      }
    }

    // Strategy C: aria-label or placeholder contains text
    const byAttr = document.querySelector(
      `input[aria-label*="${labelText}" i], input[placeholder*="${labelText}" i]`);
    if (byAttr) return byAttr;

    return null;
  }

  // ─── VUE 3 COMPATIBLE INPUT SETTER ───────────────────────────────────────

  function setInputValue(el, value) {
    el.focus();
    el.click();

    // Clear first
    el.select();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);

    // Type via execCommand — triggers Vue's beforeinput/input listeners
    // Split into chunks to avoid any per-char limits
    document.execCommand('insertText', false, value);

    // If execCommand didn't stick (some browsers), fall back to native setter
    if (el.value !== value) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(el, value);
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true, cancelable: true,
        inputType: 'insertText', data: value
      }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    el.blur();
    return el.value;
  }

  // ─── RESPONSE SIGNATURE WATCHER ──────────────────────────────────────────

  function watchResponseSignature(signatures, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const startUrl = window.location.href;
      let resolved = false;

      function check() {
        if (resolved) return;
        for (const sig of signatures) {
          const candidates = Array.isArray(sig.any_of) ? sig.any_of : [sig];
          for (const s of candidates) {
            if (s.type === 'url_change') {
              const pattern = s.matches || s.pattern;
              if (window.location.href !== startUrl &&
                  (!pattern || window.location.href.includes(pattern))) {
                done({ type: 'url_change', url: window.location.href });
                return;
              }
            }
            if (s.type === 'element_visible') {
              const el = document.querySelector(s.selector);
              if (el && el.offsetParent !== null) {
                done({ type: 'element_visible', selector: s.selector,
                       text: el.textContent?.trim() });
                return;
              }
            }
          }
        }
      }

      function done(result) {
        resolved = true;
        clearTimeout(timer);
        obs.disconnect();
        resolve({ matched: true, ...result });
      }

      const timer = setTimeout(() => {
        resolved = true;
        obs.disconnect();
        // On timeout, snapshot current state
        const snack = document.querySelector('.v-snackbar__content, [class*="snack__content"]');
        const alert = document.querySelector('.v-alert');
        resolve({
          matched: false,
          timeout: true,
          snackbarText: snack?.textContent?.trim(),
          alertText: alert?.textContent?.trim(),
          urlNow: window.location.href
        });
      }, timeoutMs);

      const obs = new MutationObserver(check);
      obs.observe(document.body, { childList: true, subtree: true,
        attributes: true, characterData: true });

      check(); // check immediately in case already satisfied
    });
  }

  // ─── STEP EXECUTOR ────────────────────────────────────────────────────────

  async function executeStep(step, params, abstractTargets, buffer) {
    const action = step.action;
    const t0 = Date.now();

    // Condition check
    if (step.condition) {
      const val = interpolate(step.condition, params);
      if (!val || val === 'false' || val === '0' || val === 'undefined') {
        return { stepId: step.stepId, action, status: 'skipped',
                 reason: 'condition falsy', durationMs: Date.now() - t0 };
      }
    }

    try {
      if (action === 'assess_state') {
        const state = assessState(step.stateGraph ||
          window.__yeshie._payload?.stateGraph);
        const expectedState = step.expect?.state;
        const matched = !expectedState || state === expectedState;
        return { stepId: step.stepId, action, status: 'ok',
                 state, matched, durationMs: Date.now() - t0 };
      }

      if (action === 'navigate') {
        const url = interpolate(step.url, params);
        window.location.href = url;
        // Wait for URL to change
        await waitFor(() => window.location.href.includes(
          url.replace('https://app.yeshid.com', '')), 8000);
        return { stepId: step.stepId, action, status: 'ok',
                 url: window.location.href, durationMs: Date.now() - t0 };
      }

      if (action === 'type') {
        const value = interpolate(step.value, { ...params, ...buffer });
        const res = resolveTarget(step.target, abstractTargets);
        if (!res) throw new Error(`Could not resolve target: ${step.target}`);
        const actual = setInputValue(res.el, value);
        return { stepId: step.stepId, action, status: 'ok',
                 target: step.target, value: actual,
                 resolvedVia: res.resolvedVia, selector: res.selector,
                 confidence: res.confidence, durationMs: Date.now() - t0 };
      }

      if (action === 'click') {
        const res = resolveTarget(step.target, abstractTargets);
        if (!res) throw new Error(`Could not resolve target: ${step.target}`);

        // Arm response signature watcher BEFORE clicking (active inference)
        const sigPromise = step.responseSignature
          ? watchResponseSignature(step.responseSignature)
          : Promise.resolve({ matched: true, type: 'no_sig' });

        res.el.click();
        const sigResult = await sigPromise;

        return { stepId: step.stepId, action, status: 'ok',
                 target: step.target, responseSignature: sigResult,
                 resolvedVia: res.resolvedVia, confidence: res.confidence,
                 durationMs: Date.now() - t0 };
      }

      if (action === 'wait_for') {
        const sel = interpolate(step.selector || step.target, params);
        const timeout = step.timeout || 8000;
        await waitFor(() => {
          const el = document.querySelector(sel);
          return el && el.offsetParent !== null;
        }, timeout);
        return { stepId: step.stepId, action, status: 'ok',
                 selector: sel, durationMs: Date.now() - t0 };
      }

      if (action === 'read') {
        const candidates = step.candidates ||
          (step.selector ? [step.selector] : []);
        let text = null;
        for (const sel of candidates) {
          const el = document.querySelector(sel);
          if (el) { text = el.textContent?.trim(); break; }
        }
        if (step.store_as) buffer[step.store_as] = text;
        return { stepId: step.stepId, action, status: 'ok',
                 text, storedAs: step.store_as, durationMs: Date.now() - t0 };
      }

      if (action === 'js') {
        const code = interpolate(step.code, { ...params, ...buffer });
        // eslint-disable-next-line no-eval
        const result = eval(code);
        if (step.store_as) buffer[step.store_as] = result;
        return { stepId: step.stepId, action, status: 'ok',
                 result, durationMs: Date.now() - t0 };
      }

      return { stepId: step.stepId, action, status: 'unsupported',
               durationMs: Date.now() - t0 };

    } catch (err) {
      return { stepId: step.stepId, action, status: 'error',
               error: err.message, durationMs: Date.now() - t0 };
    }
  }

  // ─── MAIN RUN ─────────────────────────────────────────────────────────────

  async function run(payload, params = {}) {
    window.__yeshie._payload = payload;
    const t0 = Date.now();

    // preRunChecklist guard
    const checklist = payload.preRunChecklist;
    if (checklist && !params.__skipChecklist) {
      const items = Array.isArray(checklist) ? checklist : (checklist.steps || []);
      return {
        success: false, needsChecklist: true, checklistItems: items,
        payloadName: payload._meta?.task, site: payload.site,
        stepsExecuted: 0, stepResults: [], durationMs: Date.now() - t0,
        modelUpdates: { resolvedTargets: [], statesObserved: [],
                        newTargetsDiscovered: [], signaturesObserved: {} }
      };
    }

    const stepResults = [];
    const resolvedTargets = [];
    const statesObserved = [];
    const buffer = {};
    const abstractTargets = payload.abstractTargets || {};

    for (const step of (payload.chain || [])) {
      const result = await executeStep(step, params, abstractTargets, buffer);
      stepResults.push(result);

      // Collect state observations
      if (step.action === 'assess_state' && result.state) {
        statesObserved.push(result.state);
      }

      // Collect resolved targets for self-improvement
      if (result.selector && result.resolvedVia && result.target) {
        resolvedTargets.push({
          abstractName: result.target,
          selector: result.selector,
          confidence: result.confidence || 0,
          resolvedVia: result.resolvedVia,
          resolvedAt: new Date().toISOString()
        });
        // Update cache in-memory
        if (abstractTargets[result.target]) {
          abstractTargets[result.target].cachedSelector = result.selector;
          abstractTargets[result.target].cachedConfidence = result.confidence;
          abstractTargets[result.target].resolvedOn = new Date().toISOString();
        }
      }

      // Handle assess_state branching
      if (step.action === 'assess_state' && !result.matched &&
          step.onMismatch && payload.branches?.[step.onMismatch.replace('branch:', '')]) {
        const branchName = step.onMismatch.replace('branch:', '');
        const branchSteps = payload.branches[branchName].steps ||
                            payload.branches[branchName];
        for (const bStep of branchSteps) {
          const bResult = await executeStep(bStep, params, abstractTargets, buffer);
          stepResults.push(bResult);
          if (bResult.status === 'error') {
            return {
              success: false, payloadName: payload._meta?.task,
              site: payload.site, stepsExecuted: stepResults.length,
              stepResults, buffer, durationMs: Date.now() - t0,
              modelUpdates: { resolvedTargets, statesObserved,
                              newTargetsDiscovered: [], signaturesObserved: {} }
            };
          }
        }
      }

      // Stop chain on error
      if (result.status === 'error') {
        return {
          success: false, payloadName: payload._meta?.task,
          site: payload.site, stepsExecuted: stepResults.length,
          stepResults, buffer, error: result.error,
          durationMs: Date.now() - t0,
          modelUpdates: { resolvedTargets, statesObserved,
                          newTargetsDiscovered: [], signaturesObserved: {} }
        };
      }
    }

    return {
      success: true, payloadName: payload._meta?.task,
      site: payload.site, stepsExecuted: stepResults.length,
      stepResults, buffer, durationMs: Date.now() - t0,
      modelUpdates: {
        resolvedTargets, statesObserved,
        newTargetsDiscovered: [], signaturesObserved: {}
      }
    };
  }

  window.__yeshie = { run, assessState, resolveTarget, setInputValue,
                      findInputByLabelText, waitFor, version: '1.0.0' };
  console.log('[Yeshie] Executor v1.0.0 installed');
})();

'__yeshie installed: ' + Object.keys(window.__yeshie).join(', ')
