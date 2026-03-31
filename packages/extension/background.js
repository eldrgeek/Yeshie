// Yeshie Background Worker — Chrome MV3
// Persists chain state across page navigations
// Uses chrome.scripting.executeScript (bypasses page CSP)
// Uses chrome.debugger for trusted Input.insertText

// ── Run state ─────────────────────────────────────────────────────────────────
const runs = new Map(); // runId → RunState

// ── Helpers ───────────────────────────────────────────────────────────────────
function interpolate(str, params) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? '');
}

// ── Pre-bundled functions (self-contained, run in MAIN world) ─────────────────
// These are passed as `func` to chrome.scripting.executeScript — must have
// NO external dependencies, NO closures over module scope.

function PRE_FIND_BY_LABEL(labelText) {
  const lower = labelText.toLowerCase();
  // Strategy A: .v-label inside .v-input
  for (const lb of document.querySelectorAll('.v-label')) {
    if (lb.textContent?.trim().toLowerCase().includes(lower)) {
      const inp = lb.closest('.v-input')?.querySelector('input,textarea');
      if (inp) return { id: inp.id, selector: inp.id ? '#' + inp.id : null, found: true };
    }
  }
  // Strategy B: div.mb-2 or span.text-body-2 sibling above input (YeshID pattern)
  for (const div of document.querySelectorAll('.mb-2,.text-body-2')) {
    if (div.textContent?.trim().toLowerCase().includes(lower) && !div.querySelector('input')) {
      let sib = div.nextElementSibling;
      while (sib) {
        const inp = sib.querySelector('input,textarea');
        if (inp) return { id: inp.id, selector: inp.id ? '#' + inp.id : null, found: true };
        sib = sib.nextElementSibling;
      }
      const inp = div.parentElement?.nextElementSibling?.querySelector('input,textarea');
      if (inp) return { id: inp.id, selector: inp.id ? '#' + inp.id : null, found: true };
    }
  }
  // Strategy C: aria-label or placeholder
  const el = document.querySelector(`input[aria-label*="${labelText}" i],input[placeholder*="${labelText}" i]`);
  if (el) return { id: el.id, selector: el.id ? '#' + el.id : null, found: true };
  return { found: false, selector: null };
}

function PRE_RESOLVE_TARGET(abstractTarget) {
  const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
  // Step 1: cached
  if (abstractTarget.cachedSelector && (abstractTarget.cachedConfidence || 0) >= 0.85 && abstractTarget.resolvedOn) {
    const age = Date.now() - new Date(abstractTarget.resolvedOn).getTime();
    if (age < CACHE_MS) {
      const el = document.querySelector(abstractTarget.cachedSelector);
      if (el) return { selector: abstractTarget.cachedSelector, confidence: abstractTarget.cachedConfidence, resolvedVia: 'cached', found: true };
    }
  }
  // Step 2+3: vuetify label match
  const labels = abstractTarget.match?.vuetify_label || abstractTarget.semanticKeys || [];
  const lower = (t) => t.toLowerCase();
  for (const labelText of labels) {
    const l = lower(labelText);
    for (const lb of document.querySelectorAll('.v-label')) {
      if (lb.textContent?.trim().toLowerCase().includes(l)) {
        const inp = lb.closest('.v-input')?.querySelector('input,textarea');
        if (inp) return { selector: inp.id ? '#' + inp.id : null, confidence: 0.88, resolvedVia: 'vuetify_label_match', found: true, elementId: inp.id };
      }
    }
    for (const div of document.querySelectorAll('.mb-2,.text-body-2')) {
      if (div.textContent?.trim().toLowerCase().includes(l) && !div.querySelector('input')) {
        let sib = div.nextElementSibling;
        while (sib) {
          const inp = sib.querySelector('input,textarea');
          if (inp) return { selector: inp.id ? '#' + inp.id : null, confidence: 0.88, resolvedVia: 'vuetify_label_match', found: true, elementId: inp.id };
          sib = sib.nextElementSibling;
        }
        const inp = div.parentElement?.nextElementSibling?.querySelector('input,textarea');
        if (inp) return { selector: inp.id ? '#' + inp.id : null, confidence: 0.88, resolvedVia: 'vuetify_label_match', found: true, elementId: inp.id };
      }
    }
  }
  // Step 2: aria name_contains (buttons)
  if (abstractTarget.match?.name_contains) {
    for (const nm of abstractTarget.match.name_contains) {
      const btn = Array.from(document.querySelectorAll('button,[role="button"]'))
        .find(b => b.textContent?.trim().toLowerCase().includes(nm.toLowerCase()) ||
                   b.getAttribute('aria-label')?.toLowerCase().includes(nm.toLowerCase()));
      if (btn) return { selector: btn.id ? '#' + btn.id : null, confidence: 0.85, resolvedVia: 'aria', found: true, elementId: btn.id, buttonText: btn.textContent?.trim() };
    }
  }
  // Fallback selectors
  for (const sel of (abstractTarget.fallbackSelectors || [])) {
    const el = document.querySelector(sel);
    if (el) return { selector: sel, confidence: 0.6, resolvedVia: 'css_cascade', found: true };
  }
  return { found: false, selector: null, confidence: 0, resolvedVia: 'escalate' };
}

function PRE_GUARDED_CLICK(selector, buttonText) {
  let el = selector ? document.querySelector(selector) : null;
  if (!el && buttonText) {
    el = Array.from(document.querySelectorAll('button,[role="button"],a'))
      .find(b => b.textContent?.trim().toLowerCase().includes(buttonText.toLowerCase()));
  }
  if (!el) return { ok: false, error: 'Element not found: ' + (selector || buttonText) };
  el.click();
  return { ok: true, selector, tag: el.tagName };
}

function PRE_GUARDED_READ(candidates) {
  for (const sel of (candidates || [])) {
    const el = document.querySelector(sel);
    if (el) return { text: el.textContent?.trim() || null, selector: sel, found: true };
  }
  return { text: null, found: false };
}

function PRE_ASSESS_STATE(stateGraph) {
  if (!stateGraph?.nodes) return { state: 'unknown' };
  for (const [name, node] of Object.entries(stateGraph.nodes)) {
    if (!node.signals?.length) continue;
    const allMatch = node.signals.every(sig => {
      if (sig.type === 'url_matches') return new RegExp(sig.pattern).test(window.location.pathname);
      if (sig.type === 'element_visible') return !!document.querySelector(sig.selector);
      if (sig.type === 'element_text') return document.querySelector(sig.selector)?.textContent?.includes(sig.text) ?? false;
      return false;
    });
    if (allMatch) return { state: name };
  }
  return { state: 'unknown' };
}

function PRE_FIND_ROW_AND_CLICK(identifier) {
  const rows = Array.from(document.querySelectorAll('.v-data-table__tr,tbody tr'));
  const match = rows.find(r => r.textContent.toLowerCase().includes(identifier.toLowerCase()));
  if (!match) return { found: false, rowCount: rows.length };
  const link = match.querySelector('a[href]');
  if (link) { link.click(); return { found: true, href: link.href }; }
  match.click();
  return { found: true, clicked: true };
}

function PRE_FIND_AND_CLICK_TEXT(text) {
  // Find any clickable element containing text
  const els = Array.from(document.querySelectorAll('a,button,[role="button"],[role="menuitem"]'));
  const match = els.find(e => e.textContent?.trim().toLowerCase().includes(text.toLowerCase()));
  if (!match) return { found: false, text };
  match.click();
  return { found: true, tag: match.tagName, text: match.textContent?.trim() };
}

// ── Chrome debugger — trusted Input.insertText ────────────────────────────────
async function trustedType(tabId, selector, text) {
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, '1.3');
  } catch (e) {
    if (!e.message?.includes('already attached')) throw e;
  }
  try {
    // Focus + select the element
    await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
      expression: `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.focus();el.click();el.select&&el.select();return true;})()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 80));
    // Select all
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
    // Insert text
    await chrome.debugger.sendCommand(target, 'Input.insertText', { text });
    // Tab out
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    return { ok: true };
  } finally {
    try { await chrome.debugger.detach(target); } catch (_) {}
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
function navigateAndWait(tabId, url) {
  return new Promise((resolve) => {
    chrome.tabs.update(tabId, { url });
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(() => resolve({ ok: true, url }), 600);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    // Safety timeout
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve({ ok: true, url, note: 'nav timeout fallback' });
    }, 15000);
  });
}

// ── executeScript helper ──────────────────────────────────────────────────────
async function execInTab(tabId, func, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args: args || [],
    world: 'MAIN'
  });
  return results?.[0]?.result;
}

// ── Step executor ─────────────────────────────────────────────────────────────
async function executeStep(step, run) {
  const t0 = Date.now();
  const { tabId, params, buffer, abstractTargets } = run;
  const a = step.action;

  // Condition gate
  if (step.condition) {
    const val = interpolate(step.condition, { ...params, ...buffer });
    if (!val || val === 'false' || val === '0' || val === 'undefined') {
      return { stepId: step.stepId, action: a, status: 'skipped', durationMs: 0 };
    }
  }

  try {
    if (a === 'navigate') {
      const url = interpolate(step.url, { ...params, ...buffer });
      const r = await navigateAndWait(tabId, url);
      return { stepId: step.stepId, action: a, status: 'ok', url: r.url, durationMs: Date.now() - t0 };
    }

    if (a === 'type') {
      const value = interpolate(step.value || '', { ...params, ...buffer });
      const tgt = step.target ? abstractTargets?.[step.target] : null;
      const sel = step.selector || null;

      let resolvedSelector = sel;
      let resolvedVia = 'direct';
      let confidence = 1.0;

      if (tgt) {
        const res = await execInTab(tabId, PRE_RESOLVE_TARGET, [tgt]);
        if (!res?.found) throw new Error('Cannot resolve target: ' + step.target);
        resolvedSelector = res.selector;
        resolvedVia = res.resolvedVia;
        confidence = res.confidence;
        // Update cache
        if (resolvedSelector && res.resolvedVia !== 'cached') {
          tgt.cachedSelector = resolvedSelector;
          tgt.cachedConfidence = res.confidence;
          tgt.resolvedOn = new Date().toISOString();
        }
      }
      if (!resolvedSelector) throw new Error('No selector for: ' + (step.target || step.selector));
      await trustedType(tabId, resolvedSelector, value);
      return { stepId: step.stepId, action: a, status: 'ok', value, selector: resolvedSelector, resolvedVia, confidence, target: step.target, durationMs: Date.now() - t0 };
    }

    if (a === 'click') {
      const tgt = step.target ? abstractTargets?.[step.target] : null;
      let resolvedSelector = step.selector || null;
      let resolvedVia = 'direct';
      let buttonText = null;

      if (tgt) {
        const res = await execInTab(tabId, PRE_RESOLVE_TARGET, [tgt]);
        if (!res?.found) throw new Error('Cannot resolve target: ' + step.target);
        resolvedSelector = res.selector;
        resolvedVia = res.resolvedVia;
        buttonText = res.buttonText || null;
      }
      const r = await execInTab(tabId, PRE_GUARDED_CLICK, [resolvedSelector, buttonText]);
      if (!r?.ok) throw new Error(r?.error || 'Click failed');
      return { stepId: step.stepId, action: a, status: 'ok', selector: resolvedSelector, resolvedVia, target: step.target, durationMs: Date.now() - t0 };
    }

    if (a === 'wait_for') {
      const sel = interpolate(step.selector || step.target || '', params);
      const timeout = step.timeout || 8000;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const found = await execInTab(tabId, (s) => !!document.querySelector(s), [sel]);
        if (found) return { stepId: step.stepId, action: a, status: 'ok', selector: sel, durationMs: Date.now() - t0 };
        await new Promise(r => setTimeout(r, 300));
      }
      throw new Error('wait_for timeout: ' + sel);
    }

    if (a === 'read') {
      const candidates = step.candidates || (step.selector ? [step.selector] : []);
      const r = await execInTab(tabId, PRE_GUARDED_READ, [candidates]);
      if (step.store_as) buffer[step.store_as] = r?.text || null;
      return { stepId: step.stepId, action: a, status: 'ok', text: r?.text || null, selector: r?.selector, durationMs: Date.now() - t0 };
    }

    if (a === 'assess_state') {
      const sg = step.stateGraph || run.payload?.stateGraph || { nodes: {} };
      const r = await execInTab(tabId, PRE_ASSESS_STATE, [sg]);
      const matched = !step.expect?.state || r?.state === step.expect.state;
      return { stepId: step.stepId, action: a, status: 'ok', state: r?.state, matched, durationMs: Date.now() - t0 };
    }

    if (a === 'js') {
      // Use new Function() — allowed in extension MAIN world, not subject to page CSP
      const code = interpolate(step.code || '', { ...params, ...buffer });
      const r = await execInTab(tabId, (c) => { try { return new Function(c)(); } catch(e) { return { error: e.message }; } }, [code]);
      if (r?.error) throw new Error(r.error);
      if (step.store_as) buffer[step.store_as] = r;
      return { stepId: step.stepId, action: a, status: 'ok', result: r, durationMs: Date.now() - t0 };
    }

    if (a === 'find_row') {
      const identifier = interpolate(step.identifier || step.value || '', { ...params, ...buffer });
      const r = await execInTab(tabId, PRE_FIND_ROW_AND_CLICK, [identifier]);
      if (!r?.found) throw new Error('Row not found: ' + identifier);
      return { stepId: step.stepId, action: a, status: 'ok', result: r, durationMs: Date.now() - t0 };
    }

    if (a === 'click_text') {
      const text = interpolate(step.text || '', { ...params, ...buffer });
      const r = await execInTab(tabId, PRE_FIND_AND_CLICK_TEXT, [text]);
      if (!r?.found) throw new Error('Text not found: ' + text);
      return { stepId: step.stepId, action: a, status: 'ok', result: r, durationMs: Date.now() - t0 };
    }

    return { stepId: step.stepId, action: a, status: 'unsupported', durationMs: Date.now() - t0 };

  } catch (err) {
    return { stepId: step.stepId, action: a, status: 'error', error: err.message, durationMs: Date.now() - t0 };
  }
}

// ── Chain runner ──────────────────────────────────────────────────────────────
async function startRun(runId, payload, params, tabId) {
  const chain = payload.chain || [];
  const abstractTargets = JSON.parse(JSON.stringify(payload.abstractTargets || {}));
  const run = {
    runId, payload, params, tabId,
    abstractTargets,
    buffer: {},
    stepIndex: 0,
    status: 'running',
    result: null,
    stepResults: [],
    resolvedTargets: []
  };
  runs.set(runId, run);

  const t0 = Date.now();
  try {
    for (let i = 0; i < chain.length; i++) {
      run.stepIndex = i;
      const step = chain[i];
      const res = await executeStep(step, run);
      run.stepResults.push(res);

      // Collect resolved targets for self-improvement
      if (res.selector && res.resolvedVia && step.target) {
        run.resolvedTargets.push({
          abstractName: step.target,
          selector: res.selector,
          confidence: res.confidence || 0,
          resolvedVia: res.resolvedVia,
          resolvedAt: new Date().toISOString()
        });
      }

      // assess_state branching
      if (step.action === 'assess_state' && !res.matched && step.onMismatch) {
        const branchName = step.onMismatch.replace('branch:', '');
        const branchSteps = payload.branches?.[branchName]?.steps || payload.branches?.[branchName] || [];
        for (const bStep of branchSteps) {
          const bRes = await executeStep(bStep, run);
          run.stepResults.push(bRes);
          if (bRes.status === 'error') {
            run.status = 'failed';
            run.result = { success: false, error: bRes.error, stepsExecuted: run.stepResults.length, stepResults: run.stepResults, buffer: run.buffer, durationMs: Date.now() - t0, resolvedTargets: run.resolvedTargets };
            await chrome.storage.session.set({ [runId]: run.result });
            return;
          }
        }
      }

      if (res.status === 'error') {
        run.status = 'failed';
        run.result = { success: false, error: res.error, stepsExecuted: run.stepResults.length, stepResults: run.stepResults, buffer: run.buffer, durationMs: Date.now() - t0, resolvedTargets: run.resolvedTargets };
        await chrome.storage.session.set({ [runId]: run.result });
        return;
      }
    }

    run.status = 'complete';
    run.result = { success: true, stepsExecuted: run.stepResults.length, stepResults: run.stepResults, buffer: run.buffer, durationMs: Date.now() - t0, resolvedTargets: run.resolvedTargets };
    await chrome.storage.session.set({ [runId]: run.result });

  } catch (err) {
    run.status = 'failed';
    run.result = { success: false, error: err.message, stepsExecuted: run.stepResults.length, stepResults: run.stepResults, buffer: run.buffer, durationMs: Date.now() - t0, resolvedTargets: run.resolvedTargets };
    await chrome.storage.session.set({ [runId]: run.result });
  }
}

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'skill_run') {
    const runId = crypto.randomUUID();
    const tabId = msg.tabId || sender.tab?.id;
    if (!tabId) { sendResponse({ error: 'No tabId provided' }); return true; }
    startRun(runId, msg.payload, msg.params || {}, tabId);
    sendResponse({ runId, status: 'started' });
    return true;
  }

  if (msg.type === 'get_status') {
    const run = runs.get(msg.runId);
    if (run) {
      sendResponse({ status: run.status, stepIndex: run.stepIndex, totalSteps: run.payload?.chain?.length || 0, result: run.result });
    } else {
      // Check session storage
      chrome.storage.session.get(msg.runId).then(data => {
        const result = data[msg.runId];
        sendResponse(result ? { status: 'complete', result } : { status: 'not_found' });
      });
    }
    return true;
  }

  if (msg.type === 'abort') {
    const run = runs.get(msg.runId);
    if (run) { run.status = 'aborted'; runs.delete(msg.runId); }
    sendResponse({ aborted: true });
    return true;
  }

  if (msg.type === 'content_ready') {
    // Content script loaded — no action needed for now
    return false;
  }
});

console.log('[Yeshie] Background worker started');
