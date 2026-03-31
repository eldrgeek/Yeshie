/**
 * Yeshie Injected Executor v2
 * Install: paste entire file into javascript_tool call
 * Use:     window.__yeshie.run(chain, params, abstractTargets, stateGraph) -> Promise<ChainResult>
 */
(function installYeshie() {
  if (window.__yeshie?.version?.startsWith('2')) return;

  // ── Bridge API ────────────────────────────────────────────────────────────
  let _bridgeAvail = false;
  const _pending = new Map(); let _rc = 0;
  window.addEventListener('message', ev => {
    if (ev.source !== window) return;
    const m = ev.data;
    if (m?.__yeshieBridgeReady) { _bridgeAvail = true; return; }
    if (m?.__yeshieBridgeResponse && _pending.has(m.requestId)) {
      const { resolve, reject } = _pending.get(m.requestId);
      _pending.delete(m.requestId);
      if (m.error) reject(new Error(m.error)); else resolve(m.result);
    }
  });
  // Probe bridge (content script fires ready on document_start, may have been missed)
  window.postMessage({ __yeshieBridge: true, requestId: ++_rc, action: 'ping' }, '*');
  _pending.set(_rc, {
    resolve: () => { _bridgeAvail = true; },
    reject: () => {}
  });
  setTimeout(() => _pending.delete(_rc), 2000);

  function _callBridge(action, params) {
    return new Promise((resolve, reject) => {
      const id = ++_rc;
      _pending.set(id, { resolve, reject });
      setTimeout(() => { if (_pending.has(id)) { _pending.delete(id); reject(new Error('bridge timeout')); } }, 6000);
      window.postMessage({ __yeshieBridge: true, requestId: id, action, ...params }, '*');
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  const I = (s, p) => typeof s !== 'string' ? s : s.replace(/\{\{(\w+)\}\}/g, (_, k) => p[k] ?? '');

  function wF(fn, t = 10000) {
    return new Promise((res, rej) => {
      if (fn()) return res(true);
      const tm = setTimeout(() => { ob.disconnect(); rej(new Error('waitFor timeout after ' + t + 'ms')); }, t);
      const ob = new MutationObserver(() => { if (fn()) { clearTimeout(tm); ob.disconnect(); res(true); } });
      ob.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    });
  }

  // ── State assessor ────────────────────────────────────────────────────────
  function aS(sg) {
    if (!sg?.nodes) return 'unknown';
    for (const [name, node] of Object.entries(sg.nodes)) {
      if (!node.signals?.length) continue;
      const ok = node.signals.every(s => {
        if (s.type === 'url_matches') return new RegExp(s.pattern).test(window.location.pathname);
        if (s.type === 'element_visible') { const e = document.querySelector(s.selector); return e && e.offsetParent !== null; }
        if (s.type === 'element_text') { const e = document.querySelector(s.selector); return e?.textContent?.includes(s.text); }
        return false;
      });
      if (ok) return name;
    }
    return 'unknown';
  }

  // ── Target resolver ───────────────────────────────────────────────────────
  const GENID = /^(input-v-\d+|checkbox-v-\d+|_react_|react-\d+)$/;
  const CACHE_TTL = 30 * 86400000;

  function fIL(t) {
    const l = t.toLowerCase();
    for (const lb of document.querySelectorAll('.v-label'))
      if (lb.textContent?.trim().toLowerCase().includes(l)) { const i = lb.closest('.v-input')?.querySelector('input,textarea'); if (i) return i; }
    for (const d of document.querySelectorAll('.mb-2,.text-body-2')) {
      if (d.textContent?.trim().toLowerCase().includes(l) && !d.querySelector('input')) {
        let s = d.nextElementSibling;
        while (s) { const i = s.querySelector('input,textarea'); if (i) return i; s = s.nextElementSibling; }
        const i = d.parentElement?.nextElementSibling?.querySelector('input,textarea'); if (i) return i;
        const i2 = d.parentElement?.parentElement?.nextElementSibling?.querySelector('input,textarea'); if (i2) return i2;
      }
    }
    return document.querySelector(`input[aria-label*="${t}" i],textarea[aria-label*="${t}" i],input[placeholder*="${t}" i]`);
  }

  function rT(n, at) {
    const tgt = at?.[n]; if (!tgt) return null;
    // Step 1: cache
    if (tgt.cachedSelector && (tgt.cachedConfidence ?? 0) >= 0.85 && tgt.resolvedOn &&
        (Date.now() - new Date(tgt.resolvedOn).getTime()) < CACHE_TTL) {
      const e = document.querySelector(tgt.cachedSelector);
      if (e) return { el: e, selector: tgt.cachedSelector, confidence: tgt.cachedConfidence, resolvedVia: 'cached' };
    }
    // Step 2: aria
    if (tgt.match?.name_contains) {
      for (const nm of tgt.match.name_contains) {
        const b = Array.from(document.querySelectorAll('button,[role="button"]'))
          .find(b => b.textContent?.trim().toLowerCase().includes(nm.toLowerCase()) || b.getAttribute('aria-label')?.toLowerCase().includes(nm.toLowerCase()));
        if (b) return { el: b, selector: null, confidence: 0.85, resolvedVia: 'aria' };
      }
    }
    // Step 3: vuetify_label_match
    for (const lbl of (tgt.match?.vuetify_label || tgt.semanticKeys || [])) {
      const e = fIL(lbl);
      if (e) { const sel = e.id && !GENID.test(e.id) ? '#' + e.id : null; return { el: e, selector: sel, confidence: 0.88, resolvedVia: 'vuetify_label_match' }; }
    }
    // Step 4: contenteditable
    const ce = document.querySelector('[contenteditable="true"]');
    if (ce) return { el: ce, selector: ce.id ? '#' + ce.id : null, confidence: 0.6, resolvedVia: 'contenteditable' };
    // Step 5: fallback selectors
    for (const sel of (tgt.fallbackSelectors || [])) {
      if (GENID.test(sel.replace('#', ''))) continue;
      const e = document.querySelector(sel); if (e) return { el: e, selector: sel, confidence: 0.6, resolvedVia: 'css_cascade' };
    }
    return null; // Step 6: escalate
  }

  // ── Vue 3 / bridge-aware input setter ─────────────────────────────────────
  async function sIV(selector, value) {
    if (_bridgeAvail) {
      try { await _callBridge('focusAndType', { selector, text: value }); return value; } catch (_) {}
    }
    const el = document.querySelector(selector); if (!el) return null;
    el.focus(); el.click(); el.select();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, value);
    if (el.value !== value) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    el.blur(); return el.value;
  }

  // ── Response signature watcher ────────────────────────────────────────────
  function wRS(sigs, t = 8000) {
    return new Promise(res => {
      const su = window.location.href; let done = false;
      function chk() {
        if (done) return;
        for (const sig of sigs) {
          for (const s of (Array.isArray(sig.any_of) ? sig.any_of : [sig])) {
            if (s.type === 'url_change' && window.location.href !== su) { fin({ type: 'url_change', url: window.location.href }); return; }
            if (s.type === 'element_visible') { const e = document.querySelector(s.selector); if (e && e.offsetParent !== null) { fin({ type: 'element_visible', selector: s.selector, text: e.textContent?.trim() }); return; } }
          }
        }
      }
      function fin(r) { done = true; clearTimeout(tm); ob.disconnect(); res({ matched: true, ...r }); }
      const tm = setTimeout(() => {
        done = true; ob.disconnect();
        const sn = document.querySelector('.v-snackbar__content'); const al = document.querySelector('.v-alert');
        res({ matched: false, timeout: true, snackbarText: sn?.textContent?.trim(), alertText: al?.textContent?.trim(), urlNow: window.location.href });
      }, t);
      const ob = new MutationObserver(chk);
      ob.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      chk();
    });
  }

  // ── Step executor ─────────────────────────────────────────────────────────
  async function eS(step, params, at, buf) {
    const t0 = Date.now(), a = step.action;
    // Condition gate
    if (step.condition) { const v = I(step.condition, params); if (!v || v === 'false' || v === '0' || v === 'undefined') return { stepId: step.stepId, action: a, status: 'skipped', reason: 'condition falsy', durationMs: 0 }; }

    try {
      // ── assess_state ──────────────────────────────────────────────────────
      if (a === 'assess_state') {
        const state = aS(window.__yeshie._sg);
        const matched = !step.expect?.state || state === step.expect.state;
        return { stepId: step.stepId, action: a, status: 'ok', state, matched, durationMs: Date.now() - t0 };
      }

      // ── navigate ──────────────────────────────────────────────────────────
      if (a === 'navigate') {
        const url = I(step.url, params);
        window.location.href = url;
        const path = url.split('.com')[1] || url;
        await wF(() => window.location.href.includes(path), 10000);
        return { stepId: step.stepId, action: a, status: 'ok', url: window.location.href, durationMs: Date.now() - t0 };
      }

      // ── type ──────────────────────────────────────────────────────────────
      if (a === 'type') {
        const value = I(step.value, { ...params, ...buf });
        const res = rT(step.target, at);
        if (!res) throw new Error('Cannot resolve target: ' + step.target);
        const sel = res.selector || '#' + res.el.id;
        const actual = await sIV(sel, value);
        if (res.selector && at[step.target]) { at[step.target].cachedSelector = res.selector; at[step.target].cachedConfidence = res.confidence; at[step.target].resolvedOn = new Date().toISOString(); }
        return { stepId: step.stepId, action: a, status: 'ok', target: step.target, value: actual, selector: res.selector, confidence: res.confidence, resolvedVia: res.resolvedVia, durationMs: Date.now() - t0 };
      }

      // ── click ─────────────────────────────────────────────────────────────
      if (a === 'click') {
        const res = rT(step.target, at);
        if (!res) throw new Error('Cannot resolve target: ' + step.target);
        const sp = step.responseSignature ? wRS(step.responseSignature) : Promise.resolve({ matched: true, type: 'no_sig' });
        res.el.click();
        const sr = await sp;
        return { stepId: step.stepId, action: a, status: 'ok', target: step.target, responseSignature: sr, selector: res.selector, confidence: res.confidence, resolvedVia: res.resolvedVia, durationMs: Date.now() - t0 };
      }

      // ── click_preset ─────────────────────────────────────────────────────
      // Opens a picker button, then clicks a preset option by text
      if (a === 'click_preset') {
        const res = rT(step.target, at);
        if (!res) throw new Error('Cannot resolve target: ' + step.target);
        res.el.click();
        // Wait for overlay/picker to appear
        await wF(() => !!document.querySelector('.v-overlay--active, [role="menu"], [role="listbox"]'), 3000).catch(() => {});
        const preset = I(step.preset || step.defaultPreset || '', params) || step.defaultPreset || 'Immediately';
        const option = Array.from(document.querySelectorAll('.v-overlay--active *, [role="option"], [role="menuitem"]'))
          .find(el => el.textContent?.trim() === preset);
        if (!option) throw new Error('Preset option not found: ' + preset);
        option.click();
        await wF(() => !document.querySelector('.v-overlay--active'), 3000).catch(() => {});
        return { stepId: step.stepId, action: a, status: 'ok', target: step.target, preset, durationMs: Date.now() - t0 };
      }

      // ── wait_for ──────────────────────────────────────────────────────────
      if (a === 'wait_for') {
        const sel = I(step.selector || step.target, { ...params, ...buf });
        await wF(() => { const e = document.querySelector(sel); return e && e.offsetParent !== null; }, step.timeout || 8000);
        return { stepId: step.stepId, action: a, status: 'ok', selector: sel, durationMs: Date.now() - t0 };
      }

      // ── read ──────────────────────────────────────────────────────────────
      if (a === 'read') {
        const candidates = step.candidates || (step.selector ? [step.selector] : []);
        let text = null;
        for (const sel of candidates) { const e = document.querySelector(sel); if (e) { text = e.textContent?.trim(); break; } }
        if (step.store_as) buf[step.store_as] = text;
        return { stepId: step.stepId, action: a, status: 'ok', text, storedAs: step.store_as, durationMs: Date.now() - t0 };
      }

      // ── hover ─────────────────────────────────────────────────────────────
      if (a === 'hover') {
        const res = rT(step.target, at) || { el: document.querySelector(I(step.selector, params)) };
        if (!res?.el) throw new Error('Cannot resolve hover target');
        res.el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        res.el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        if (step.duration_ms) await new Promise(r => setTimeout(r, step.duration_ms));
        return { stepId: step.stepId, action: a, status: 'ok', durationMs: Date.now() - t0 };
      }

      // ── scroll ────────────────────────────────────────────────────────────
      if (a === 'scroll') {
        const sel = I(step.selector, params);
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { stepId: step.stepId, action: a, status: 'ok', selector: sel, durationMs: Date.now() - t0 };
      }

      // ── select ────────────────────────────────────────────────────────────
      if (a === 'select') {
        const res = rT(step.target, at) || { el: document.querySelector(I(step.selector, params)) };
        if (!res?.el) throw new Error('Cannot resolve select target');
        const el = res.el;
        const value = I(step.value, { ...params, ...buf });
        if (el.tagName === 'SELECT') {
          el.value = value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = value === 'true' || value === true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return { stepId: step.stepId, action: a, status: 'ok', value, durationMs: Date.now() - t0 };
      }

      // ── assert ────────────────────────────────────────────────────────────
      if (a === 'assert') {
        const sel = I(step.selector, params);
        const expected = I(step.value, { ...params, ...buf });
        const el = document.querySelector(sel);
        const actual = el?.textContent?.trim();
        if (!actual?.includes(expected)) throw new Error(`Assert failed: expected "${expected}" in "${actual}" (${sel})`);
        return { stepId: step.stepId, action: a, status: 'ok', selector: sel, value: actual, durationMs: Date.now() - t0 };
      }

      // ── probe_affordances ─────────────────────────────────────────────────
      if (a === 'probe_affordances') {
        const container = document.querySelector(I(step.selector, params)) || document.body;
        const buttons = Array.from(container.querySelectorAll('button,[role="button"],[class*="btn"]'));
        const affordances = buttons.slice(0, 20).map(btn => ({
          text: btn.textContent?.trim(),
          ariaLabel: btn.getAttribute('aria-label'),
          title: btn.getAttribute('title'),
          selector: btn.id ? '#' + btn.id : btn.className.split(' ').filter(c => c && !c.match(/^v-/)).map(c => '.' + c).join('')
        })).filter(a => a.text || a.ariaLabel);
        if (step.store_as) buf[step.store_as] = affordances;
        return { stepId: step.stepId, action: a, status: 'ok', affordances, storedAs: step.store_as, durationMs: Date.now() - t0 };
      }

      // ── js ────────────────────────────────────────────────────────────────
      if (a === 'js') {
        const code = I(step.code, { ...params, ...buf });
        // eslint-disable-next-line no-eval
        const result = eval(code);
        if (step.store_as) buf[step.store_as] = result;
        return { stepId: step.stepId, action: a, status: 'ok', result, storedAs: step.store_as, durationMs: Date.now() - t0 };
      }

      return { stepId: step.stepId, action: a, status: 'unsupported', durationMs: Date.now() - t0 };

    } catch (err) {
      return { stepId: step.stepId, action: a, status: 'error', error: err.message, durationMs: Date.now() - t0 };
    }
  }

  // ── Main run ──────────────────────────────────────────────────────────────
  async function run(chain, params, at, sg) {
    window.__yeshie._sg = sg;
    const t0 = Date.now(), sr = [], rt = [], buf = {};

    for (const step of chain) {
      const res = await eS(step, params, at, buf);
      sr.push(res);

      if (res.action === 'assess_state' && res.state) {
        if (!window.__yeshie._statesObserved) window.__yeshie._statesObserved = [];
        window.__yeshie._statesObserved.push(res.state);
      }

      if (res.selector && res.resolvedVia && res.target) {
        rt.push({ abstractName: res.target, selector: res.selector, confidence: res.confidence || 0, resolvedVia: res.resolvedVia, resolvedAt: new Date().toISOString() });
      }

      // assess_state branching
      if (res.action === 'assess_state' && !res.matched && step.onMismatch) {
        const bn = step.onMismatch.replace('branch:', '');
        const bs = window.__yeshie._payload?.branches?.[bn]?.steps || window.__yeshie._payload?.branches?.[bn] || [];
        for (const bStep of bs) {
          const br = await eS(bStep, params, at, buf);
          sr.push(br);
          if (br.status === 'error') return { success: false, stepsExecuted: sr.length, stepResults: sr, buffer: buf, error: br.error, durationMs: Date.now() - t0, modelUpdates: { resolvedTargets: rt, statesObserved: window.__yeshie._statesObserved || [], newTargetsDiscovered: [], signaturesObserved: {} } };
        }
      }

      if (res.status === 'error') return { success: false, stepsExecuted: sr.length, stepResults: sr, buffer: buf, error: res.error, durationMs: Date.now() - t0, modelUpdates: { resolvedTargets: rt, statesObserved: window.__yeshie._statesObserved || [], newTargetsDiscovered: [], signaturesObserved: {} } };
    }

    return { success: true, stepsExecuted: sr.length, stepResults: sr, buffer: buf, durationMs: Date.now() - t0, modelUpdates: { resolvedTargets: rt, statesObserved: window.__yeshie._statesObserved || [], newTargetsDiscovered: [], signaturesObserved: {} } };
  }

  window.__yeshie = { run, aS, rT, fIL, sIV, wRS, eS, _sg: null, _payload: null, _statesObserved: [], version: '2.0.0' };
  console.log('[Yeshie] Executor v2.0.0 installed');
})();
'__yeshie v' + window.__yeshie.version
