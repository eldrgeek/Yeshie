import { io } from 'socket.io-client';
import { createResolvedTargetUpdate, createSurpriseEvidence } from '../../../../src/runtime-contract.js';

export default defineBackground(() => {
  console.log('[Yeshie] Background worker started');
  const DEFAULT_BASE_URL = 'https://app.yeshid.com';
  const RELAY_URL = import.meta.env.WXT_RELAY_URL || 'http://localhost:3333';
  const WATCHER_URL = import.meta.env.WXT_WATCHER_URL || 'http://localhost:27182';
  const CHAT_URL = `${RELAY_URL}/chat`;
  const CHAT_FEEDBACK_URL = `${RELAY_URL}/chat/feedback`;
  const CHAT_STATUS_URL = `${RELAY_URL}/chat/status`;

  // ── Relay socket connection ──────────────────────────────────────────────────
  // Delay initial connection slightly — after a hot-reload, the relay needs
  // a moment to clean up the previous socket before accepting a new one.
  // Without this, the first connect attempt fails with a WebSocket error
  // (Chrome logs it even though Socket.IO auto-retries and succeeds).
  let socket: ReturnType<typeof io>;
  setTimeout(() => {
    socket = io(RELAY_URL, {
      auth: { role: 'extension' },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('connect', () => {
      console.log('[Yeshie] Connected to relay', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('[Yeshie] Disconnected from relay');
    });

    // Relay sends skill_run commands
    socket.on('skill_run', ({ commandId, payload, params, tabId }: any) => {
      console.log('[Yeshie] skill_run from relay', commandId);
      const runId = crypto.randomUUID();
      chrome.storage.session.set({ __yeshieLastRunId: runId });
      startRun(runId, payload, params || {}, tabId).then(() => {
        const run = runs.get(runId);
        const result = run?.result;
        // Always send full result (includes stepResults for diagnostics)
        socket.emit('chain_result', { commandId, result: result || { success: false, error: 'no result' } });
      }).catch((err: any) => {
        socket.emit('chain_error', { commandId, error: err.message });
      });
    });
  }, 800);



  // ── Hot reload: poll watcher server, reload extension when build changes ──────
  let _lastBuild = -1;
  async function checkForReload() {
    try {
      const r = await fetch(`${WATCHER_URL}/`);
      const { build, ready } = await r.json();
      if (_lastBuild === -1) { _lastBuild = build; return; }
      // Only reload when build number changed AND watcher confirms build is complete
      if (build !== _lastBuild && ready) {
        _lastBuild = build;
        console.log('[Yeshie] New build detected (ready), reloading extension...');
        chrome.runtime.reload();
      }
    } catch (_) {}
  }
  setInterval(checkForReload, 2000);


  // onInstalled: no tab reload (kills sessions). Content scripts inject naturally on next page load.

  // ── Run state ────────────────────────────────────────────────────────────────
  const runs = new Map<string, any>();
  const abortFlags = new Map<string, boolean>();

  function collectSurpriseEvidence(stepResults: any[] = [], topLevelError?: string) {
    const collected = stepResults.flatMap((r: any) => Array.isArray(r?.surpriseEvidence) ? r.surpriseEvidence : []);
    if (topLevelError && collected.length === 0) {
      collected.push(createSurpriseEvidence('unexpected_ui', { details: topLevelError }));
    }
    return collected;
  }

  function normalizeResolvedTargets(resolvedTargets: any[] = []) {
    const normalized: Record<string, any> = {};
    for (const target of resolvedTargets) {
      if (!target?.abstractName) continue;
      normalized[target.abstractName] = createResolvedTargetUpdate(
        target.selector ?? null,
        target.confidence ?? 0,
        target.resolvedVia ?? 'escalate',
        target.resolvedAt || target.resolvedOn || new Date().toISOString()
      );
    }
    return normalized;
  }

  function buildChainResult(run: any, startedAt: number, success: boolean, error?: string) {
    const surpriseEvidence = collectSurpriseEvidence(run.stepResults, error);
    const resolvedTargets = normalizeResolvedTargets(run.resolvedTargets);
    const modelUpdates = {
      resolvedTargets,
      newTargetsDiscovered: [],
      statesObserved: run.stepResults
        .map((r: any) => r?.state)
        .filter(Boolean),
      signaturesObserved: {},
      surpriseEvidence,
    };
    return {
      event: 'chain_complete',
      goalReached: success,
      success,
      error,
      payloadName: run.payload?._meta?.task || run.payload?.runId || 'unknown',
      site: run.payload?.site || run.params?.base_url || 'unknown',
      stepsExecuted: run.stepResults.length,
      stepResults: run.stepResults,
      buffer: run.buffer,
      durationMs: Date.now() - startedAt,
      resolvedTargets: run.resolvedTargets,
      modelUpdates,
      surpriseEvidence,
    };
  }

  // Keep-alive: prevent service worker suspension ALWAYS (relay needs persistent connection)
  // MV3 workers sleep after ~30s idle — the alarm fires every 24s to keep the worker alive
  chrome.alarms.create('yeshie-keepalive', { periodInMinutes: 0.4 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'yeshie-keepalive') {
      // Accessing any chrome API keeps the service worker awake
      chrome.storage.session.get('__yeshiePing');
    }
  });

  // Register side panel behavior
  chrome.sidePanel.setOptions({ enabled: true });
  chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

  function startKeepalive() { /* no-op: always-on keepalive handles this */ }
  function stopKeepalive() { /* no-op: keep alive even when idle for relay connection */ }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function interpolate(str: string, params: Record<string, any>): string {
    if (typeof str !== 'string') return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? '');
  }

  // ── Pre-bundled functions ────────────────────────────────────────────────────
  // Self-contained — passed as func to executeScript (MAIN world, no imports)

  function PRE_FIND_BY_LABEL(labelText: string) {
    const lower = labelText.toLowerCase();
    for (const lb of document.querySelectorAll('.v-label')) {
      if (lb.textContent?.trim().toLowerCase().includes(lower)) {
        const inp = lb.closest('.v-input')?.querySelector('input,textarea') as HTMLInputElement | null;
        if (inp) return { id: inp.id, selector: inp.id ? '#' + inp.id : null, found: true };
      }
    }
    for (const div of document.querySelectorAll('.mb-2,.text-body-2')) {
      if (div.textContent?.trim().toLowerCase().includes(lower) && !div.querySelector('input')) {
        let sib = div.nextElementSibling;
        while (sib) {
          const inp = sib.querySelector('input,textarea') as HTMLInputElement | null;
          if (inp) return { id: inp.id, selector: inp.id ? '#' + inp.id : null, found: true };
          sib = sib.nextElementSibling;
        }
        const inp = div.parentElement?.nextElementSibling?.querySelector('input,textarea') as HTMLInputElement | null;
        if (inp) return { id: inp.id, selector: inp.id ? '#' + inp.id : null, found: true };
      }
    }
    const el = document.querySelector(`input[aria-label*="${labelText}" i],input[placeholder*="${labelText}" i]`) as HTMLInputElement | null;
    if (el) return { id: el.id, selector: el.id ? '#' + el.id : null, found: true };
    return { found: false, selector: null };
  }

  function PRE_RESOLVE_TARGET(abstractTarget: any) {
    const CACHE_MS = 30 * 24 * 60 * 60 * 1000;

    // Produce a reload-stable selector — prefers a11y attributes over generated IDs
    function stableSelector(el: Element): string | null {
      const tag = el.tagName.toLowerCase();
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
      const placeholder = (el as HTMLInputElement).placeholder;
      if (placeholder) return `${tag}[placeholder="${placeholder}"]`;
      const name = el.getAttribute('name');
      if (name) return `${tag}[name="${name}"]`;
      const testid = el.getAttribute('data-testid');
      if (testid) return `[data-testid="${testid}"]`;
      // Only use ID if it looks stable (not a generated Vuetify/React ID)
      if (el.id && !/^(input-v-|_react_|:r)/.test(el.id)) return '#' + el.id;
      return null;
    }

    // Step 1: cached selector (verify still valid in DOM)
    if (abstractTarget.cachedSelector && (abstractTarget.cachedConfidence || 0) >= 0.85 && abstractTarget.resolvedOn) {
      const age = Date.now() - new Date(abstractTarget.resolvedOn).getTime();
      if (age < CACHE_MS) {
        const el = document.querySelector(abstractTarget.cachedSelector);
        if (el) return { selector: abstractTarget.cachedSelector, confidence: abstractTarget.cachedConfidence, resolvedVia: 'cached', found: true };
      }
    }

    const labelKeys: string[] = abstractTarget.match?.vuetify_label || abstractTarget.semanticKeys || [];
    const nameKeys: string[] = abstractTarget.match?.name_contains || [];
    const allKeys = [...new Set([...labelKeys, ...nameKeys])];

    // Step 2: A11y tree resolution — framework-agnostic, stable across page reloads
    // Resolution order mirrors how browsers compute accessible names (ARIA spec)
    for (const key of allKeys) {
      const k = key.toLowerCase();
      // 2a: aria-label attribute
      const byAria = document.querySelector(`[aria-label*="${key}" i]`) as HTMLElement | null;
      if (byAria) {
        const sel = stableSelector(byAria) || `[aria-label*="${key}" i]`;
        return { selector: sel, confidence: 0.92, resolvedVia: 'a11y_aria_label', found: true };
      }
      // 2b: aria-labelledby → follow reference to label text
      for (const el of Array.from(document.querySelectorAll('[aria-labelledby]'))) {
        const labelId = el.getAttribute('aria-labelledby')!;
        const label = document.getElementById(labelId);
        if (label?.textContent?.toLowerCase().includes(k)) {
          const sel = stableSelector(el) || `[aria-labelledby="${labelId}"]`;
          return { selector: sel, confidence: 0.92, resolvedVia: 'a11y_labelledby', found: true };
        }
      }
      // 2c: <label for="X"> text contains key → resolve to target input
      for (const label of Array.from(document.querySelectorAll('label[for]'))) {
        if (label.textContent?.toLowerCase().includes(k)) {
          const target = document.getElementById((label as HTMLLabelElement).htmlFor);
          if (target) {
            const sel = stableSelector(target) || `#${(label as HTMLLabelElement).htmlFor}`;
            return { selector: sel, confidence: 0.90, resolvedVia: 'a11y_label_for', found: true };
          }
        }
      }
      // 2d: placeholder text
      const byPlaceholder = document.querySelector(`[placeholder*="${key}" i]`) as HTMLElement | null;
      if (byPlaceholder) {
        const sel = stableSelector(byPlaceholder) || `[placeholder*="${key}" i]`;
        return { selector: sel, confidence: 0.88, resolvedVia: 'a11y_placeholder', found: true };
      }
    }

    // Step 3: Vuetify-specific patterns (framework fallback — uses stableSelector now)
    for (const labelText of labelKeys) {
      const l = labelText.toLowerCase();
      for (const lb of document.querySelectorAll('.v-label')) {
        if (lb.textContent?.trim().toLowerCase().includes(l)) {
          const inp = lb.closest('.v-input')?.querySelector('input,textarea') as HTMLInputElement | null;
          if (inp) { const sel = stableSelector(inp); if (sel) return { selector: sel, confidence: 0.85, resolvedVia: 'vuetify_label_match', found: true }; }
        }
      }
      for (const div of document.querySelectorAll('.mb-2,.text-body-2')) {
        if (div.textContent?.trim().toLowerCase().includes(l) && !div.querySelector('input')) {
          let sib = div.nextElementSibling;
          while (sib) {
            const inp = sib.querySelector('input,textarea') as HTMLInputElement | null;
            if (inp) { const sel = stableSelector(inp); if (sel) return { selector: sel, confidence: 0.85, resolvedVia: 'vuetify_label_match', found: true }; }
            sib = sib.nextElementSibling;
          }
        }
      }
    }

    // Step 3b: table-row label pattern (YeshID edit form uses <td> labels next to inputs)
    for (const labelText of allKeys) {
      const l = labelText.toLowerCase();
      for (const row of document.querySelectorAll('tr, [role="row"]')) {
        const cells = row.querySelectorAll('td, th, [role="cell"]');
        for (let ci = 0; ci < cells.length; ci++) {
          if (cells[ci].textContent?.trim().toLowerCase().includes(l) && !cells[ci].querySelector('input')) {
            // Check subsequent cells in this row for an input
            for (let cj = ci + 1; cj < cells.length; cj++) {
              const inp = cells[cj].querySelector('input,textarea') as HTMLInputElement | null;
              if (inp) {
                const sel = stableSelector(inp);
                if (sel) return { selector: sel, confidence: 0.82, resolvedVia: 'table_row_label', found: true };
                // If no stable selector, use the generated ID as last resort
                if (inp.id) return { selector: '#' + inp.id, confidence: 0.70, resolvedVia: 'table_row_label_id', found: true };
              }
            }
          }
        }
      }
    }

    // Step 4: clickable targets by text/aria (buttons, links, menu items)
    for (const nm of nameKeys) {
      const btn = Array.from(document.querySelectorAll('a[href],[role="button"],button,[role="menuitem"]')).find((b: any) =>
        b.textContent?.trim().toLowerCase().includes(nm.toLowerCase()) ||
        b.getAttribute('aria-label')?.toLowerCase().includes(nm.toLowerCase())
      ) as HTMLElement | undefined;
      if (btn) {
        const sel = stableSelector(btn) || null;
        return { selector: sel, confidence: 0.85, resolvedVia: 'text_match', found: true, buttonText: btn.textContent?.trim() };
      }
    }

    // Step 5: explicit fallback CSS selectors (last resort)
    for (const sel of (abstractTarget.fallbackSelectors || [])) {
      const el = document.querySelector(sel);
      if (el) return { selector: sel, confidence: 0.6, resolvedVia: 'css_cascade', found: true };
    }

    return { found: false, selector: null, confidence: 0, resolvedVia: 'escalate' };
  }

  function PRE_GUARDED_CLICK(selector: string | null, buttonText: string | null) {
    let el: Element | null = selector ? document.querySelector(selector) : null;
    if (!el && buttonText) {
      el = Array.from(document.querySelectorAll('button,[role="button"],a,[role="menuitem"]'))
        .find((b: any) => b.textContent?.trim().toLowerCase().includes(buttonText.toLowerCase())) || null;
    }
    if (!el) return { ok: false, error: 'Not found: ' + (selector || buttonText) };
    // Dispatch full pointer/mouse event sequence (Vuetify menus need this, not just .click())
    const rect = (el as HTMLElement).getBoundingClientRect();
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const eventInit = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, screenX: cx, screenY: cy };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...eventInit, pointerId: 1, pointerType: 'mouse' }));
    el.dispatchEvent(new MouseEvent('mousedown', eventInit));
    el.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, pointerId: 1, pointerType: 'mouse' }));
    el.dispatchEvent(new MouseEvent('mouseup', eventInit));
    el.dispatchEvent(new MouseEvent('click', eventInit));
    return { ok: true, tag: el.tagName, text: (el as HTMLElement).textContent?.trim() };
  }

  function PRE_GUARDED_READ(candidates: string[]) {
    for (const sel of (candidates || [])) {
      const el = document.querySelector(sel);
      if (el) return { text: el.textContent?.trim() || null, selector: sel, found: true };
    }
    return { text: null, found: false };
  }

  function PRE_PAGE_SNAPSHOT() {
    const pageUrl = window.location.pathname;
    function getLabel(input: Element) {
      const c = input.closest('.v-input, .v-field, .v-text-field');
      if (!c) return null;
      const l = c.querySelector('.v-label, .v-field-label');
      if (l) return l.textContent?.trim() || null;
      const prev = c.previousElementSibling;
      if (prev && prev.classList.contains('mb-2')) return prev.textContent?.trim() || null;
      return null;
    }
    const headings = [...document.querySelectorAll('main h1, main h2, main h3, .v-toolbar-title')]
      .map(h => ({ level: h.tagName, text: h.textContent?.trim() }));
    const inputs = [...document.querySelectorAll('input, textarea, select')]
      .filter(el => (el as HTMLElement).offsetParent !== null)
      .map(el => {
        const inp = el as HTMLInputElement;
        return { tag: el.tagName, type: inp.type, id: inp.id, placeholder: inp.placeholder, label: getLabel(el), ariaLabel: el.getAttribute('aria-label') };
      });
    const buttons = [...document.querySelectorAll('button, [role=button], a.v-btn')]
      .filter(el => (el as HTMLElement).offsetParent !== null)
      .map(el => ({ tag: el.tagName, text: (el.textContent || '').trim().slice(0, 60), ariaLabel: el.getAttribute('aria-label'), href: el.getAttribute('href'), disabled: (el as HTMLButtonElement).disabled, classes: [...el.classList].slice(0, 5).join(' ') }))
      .filter((b, i, arr) => arr.findIndex(x => x.text === b.text && x.href === b.href) === i)
      .slice(0, 50);
    const links = [...document.querySelectorAll('a[href]')]
      .filter(el => (el as HTMLElement).offsetParent !== null && el.textContent?.trim())
      .map(el => ({ text: el.textContent?.trim()?.slice(0, 60), href: el.getAttribute('href') }))
      .filter((l, i, arr) => arr.findIndex(x => x.text === l.text && x.href === l.href) === i)
      .slice(0, 30);
    const tables = [...document.querySelectorAll('table, .v-data-table')].map(table => ({
      headers: [...table.querySelectorAll('thead th')].map(th => th.textContent?.trim()),
      rowCount: table.querySelectorAll('tbody tr').length,
      sampleRows: [...table.querySelectorAll('tbody tr')].slice(0, 3).map(tr =>
        [...tr.querySelectorAll('td')].map(td => td.textContent?.trim()?.slice(0, 50))
      )
    }));
    const navLinks = [...document.querySelectorAll('.v-navigation-drawer a[href]')]
      .map(a => ({ text: a.textContent?.trim(), href: a.getAttribute('href'), active: a.classList.contains('v-list-item--active') }));
    return { pageUrl, headings, inputs, buttons, links, tables, navLinks };
  }

  // ── Auth detection functions ─────────────────────────────────────────────────

  function PRE_CHECK_AUTH() {
    // Quick check: is the user authenticated?
    // YeshID shows /login when unauthenticated, and a navigation drawer when authenticated
    const onLoginPage = /\/login/.test(window.location.pathname);
    const hasNavDrawer = !!document.querySelector('.v-navigation-drawer a[href="/overview"]');
    return {
      authenticated: !onLoginPage && hasNavDrawer,
      onLoginPage,
      hasNavDrawer,
      currentUrl: window.location.href
    };
  }

  async function PRE_WAIT_FOR_AUTH(timeoutMs: number = 120000) {
    // Poll for authentication — waits for the nav drawer to appear
    // Returns when authenticated or when timeout expires
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const onLogin = /\/login/.test(window.location.pathname);
      const hasNav = !!document.querySelector('.v-navigation-drawer a[href="/overview"]');
      if (!onLogin && hasNav) {
        return { authenticated: true, waitMs: Date.now() - t0 };
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    return { authenticated: false, waitMs: Date.now() - t0, timedOut: true };
  }

  function PRE_CLICK_SSO_BUTTON() {
    // Click "Sign in with Google" on the YeshID login page
    const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const googleBtn = btns.find(b =>
      b.textContent?.toLowerCase().includes('sign in with google') ||
      b.textContent?.toLowerCase().includes('google')
    ) as HTMLElement | undefined;
    if (googleBtn) {
      googleBtn.click();
      return { clicked: true, text: googleBtn.textContent?.trim() };
    }
    return { clicked: false, available: btns.map(b => b.textContent?.trim()).filter(Boolean).slice(0, 10) };
  }

  function PRE_CLICK_GOOGLE_ACCOUNT(email: string) {
    // On the Google account chooser (accounts.google.com), click the account matching email
    // Google uses data-identifier attribute on account rows, or we can match by email text
    const byIdentifier = document.querySelector(`[data-identifier="${email}"]`) as HTMLElement | null;
    if (byIdentifier) {
      byIdentifier.click();
      return { clicked: true, method: 'data-identifier', email };
    }
    // Fallback: find by visible email text in list items
    const items = Array.from(document.querySelectorAll('li, div[role="link"], div[data-email]'));
    const match = items.find(el => el.textContent?.includes(email)) as HTMLElement | undefined;
    if (match) {
      match.click();
      return { clicked: true, method: 'text-match', email };
    }
    return { clicked: false, available: items.map(el => el.textContent?.trim()).filter(Boolean).slice(0, 10) };
  }

  function PRE_ASSESS_STATE(stateGraph: any) {
    if (!stateGraph?.nodes) return { state: 'unknown' };
    for (const [name, node] of Object.entries(stateGraph.nodes) as any) {
      if (!node.signals?.length) continue;
      const allMatch = node.signals.every((sig: any) => {
        if (sig.type === 'url_matches') return new RegExp(sig.pattern).test(window.location.pathname);
        if (sig.type === 'element_visible') return !!document.querySelector(sig.selector);
        if (sig.type === 'element_text') return document.querySelector(sig.selector)?.textContent?.includes(sig.text) ?? false;
        return false;
      });
      if (allMatch) return { state: name };
    }
    return { state: 'unknown' };
  }

  function PRE_FIND_ROW_AND_CLICK(identifier: string) {
    const rows = Array.from(document.querySelectorAll('.v-data-table__tr,tbody tr'));
    const match = rows.find(r => r.textContent?.toLowerCase().includes(identifier.toLowerCase()));
    if (!match) return { found: false, rowCount: rows.length };
    // Try link with href first, then any <a> tag (Vue/SPA apps use <a> without href)
    const link = match.querySelector('a[href]') as HTMLAnchorElement | null;
    if (link) { link.click(); return { found: true, href: link.href }; }
    const anyLink = match.querySelector('a') as HTMLAnchorElement | null;
    if (anyLink) { anyLink.click(); return { found: true, clickedLink: true, text: anyLink.textContent?.trim() }; }
    (match as HTMLElement).click();
    return { found: true, clicked: true };
  }

  async function PRE_FIND_AND_CLICK_TEXT(text: string, timeoutMs: number = 1500) {
    const lower = text.toLowerCase();
    const sel = 'a,button,[role="button"],[role="menuitem"],.v-list-item,[role="option"],[role="link"]';
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const els = Array.from(document.querySelectorAll(sel));
      const match = els.find((e: any) => e.offsetParent !== null && e.textContent?.trim().toLowerCase().includes(lower)) as HTMLElement | undefined;
      if (match) {
        const rect = match.getBoundingClientRect();
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const eventInit = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, screenX: cx, screenY: cy };
        match.dispatchEvent(new PointerEvent('pointerdown', { ...eventInit, pointerId: 1, pointerType: 'mouse' }));
        match.dispatchEvent(new MouseEvent('mousedown', eventInit));
        match.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, pointerId: 1, pointerType: 'mouse' }));
        match.dispatchEvent(new MouseEvent('mouseup', eventInit));
        match.dispatchEvent(new MouseEvent('click', eventInit));
        return { found: true, tag: match.tagName, text: match.textContent?.trim(), waitMs: Date.now() - t0 };
      }
      await new Promise(r => setTimeout(r, 100));
    }
    return { found: false, waitMs: Date.now() - t0 };
  }

  function PRE_PAGE_RECON() {
    // Perceive the current page: collect navigation, affordances, inputs, tables, actions
    const seen: Record<string, boolean> = {};

    // Navigation links from sidebar/nav
    const navEls = document.querySelectorAll('nav a[href], [role="navigation"] a[href], .v-navigation-drawer a[href], aside a[href]');
    const navLinks: any[] = [];
    for (let i = 0; i < navEls.length && i < 30; i++) {
      const a = navEls[i] as HTMLAnchorElement;
      const text = a.textContent?.trim().split('\n')[0]?.trim();
      const href = a.getAttribute('href');
      if (text && text.length < 50 && href && !seen[href]) {
        seen[href] = true;
        navLinks.push({ text, href, active: a.classList.contains('v-list-item--active') || a.getAttribute('aria-current') === 'page' });
      }
    }

    // Visible buttons
    const btnEls = document.querySelectorAll('button, [role="button"], [role="menuitem"]');
    const buttons: any[] = [];
    for (let j = 0; j < btnEls.length && buttons.length < 20; j++) {
      const b = btnEls[j] as HTMLElement;
      const text = b.textContent?.trim().split('\n')[0]?.trim();
      if (text && text.length < 50 && b.offsetParent !== null) {
        buttons.push({ text, ariaLabel: b.getAttribute('aria-label'), tag: b.tagName });
      }
    }

    // Input fields
    const inputEls = document.querySelectorAll('input, textarea, select');
    const fields: any[] = [];
    for (let k = 0; k < inputEls.length && fields.length < 15; k++) {
      const inp = inputEls[k] as HTMLInputElement;
      if (inp.offsetParent !== null) {
        fields.push({
          tag: inp.tagName, type: inp.type,
          placeholder: inp.placeholder || null,
          ariaLabel: inp.getAttribute('aria-label') || null,
          name: inp.getAttribute('name') || null
        });
      }
    }

    // Tables
    const tableEls = document.querySelectorAll('table');
    const tables: any[] = [];
    for (let t = 0; t < tableEls.length; t++) {
      const hdrs = tableEls[t].querySelectorAll('thead th');
      const hdrTexts: string[] = [];
      for (let h = 0; h < hdrs.length; h++) hdrTexts.push(hdrs[h].textContent?.trim() || '');
      tables.push({ headers: hdrTexts, rowCount: tableEls[t].querySelectorAll('tbody tr').length });
    }

    // Action links in main content area
    const mainEls = document.querySelectorAll('main a, [role="main"] a');
    const mainActions: any[] = [];
    const seenActions: Record<string, boolean> = {};
    for (let m = 0; m < mainEls.length && mainActions.length < 20; m++) {
      const al = mainEls[m] as HTMLAnchorElement;
      const text = al.textContent?.trim();
      if (text && text.length > 2 && text.length < 60 && al.offsetParent !== null && !seenActions[text]) {
        seenActions[text] = true;
        mainActions.push({ text, href: al.getAttribute('href') });
      }
    }

    // Page headings
    const headingEls = document.querySelectorAll('h1, h2, h3, [role="heading"]');
    const headings: any[] = [];
    for (let p = 0; p < headingEls.length && headings.length < 10; p++) {
      const text = headingEls[p].textContent?.trim();
      if (text) headings.push({ level: headingEls[p].tagName, text: text.slice(0, 80) });
    }

    return {
      url: window.location.href,
      title: document.title,
      headings,
      navLinks,
      buttons,
      fields,
      tables,
      mainActions
    };
  }

  function PRE_RUN_DOMQUERY(code: string, params: Record<string, any>) {
    // This function runs in MAIN world via executeScript (pre-bundled, not eval)
    // It handles common DOM query patterns from payload js steps
    // Pattern: find row containing identifier and click it
    try {
      const identifier = params.user_identifier || params[Object.keys(params)[0]] || '';
      
      // Row find + click pattern
      if (code.includes('find(r =>') || code.includes('find(row') || code.includes('rows.find')) {
        const rows = Array.from(document.querySelectorAll('.v-data-table__tr,tbody tr'));
        const match = rows.find((r: any) => r.textContent?.toLowerCase().includes(identifier.toLowerCase()));
        if (!match) return { found: false, rowCount: rows.length };
        const link = (match as HTMLElement).querySelector('a[href]') as HTMLAnchorElement | null;
        if (link) { link.click(); return { found: true, href: link.href }; }
        const anyLink = (match as HTMLElement).querySelector('a') as HTMLAnchorElement | null;
        if (anyLink) { anyLink.click(); return { found: true, clickedLink: true, text: anyLink.textContent?.trim() }; }
        (match as HTMLElement).click();
        return { found: true, clicked: true };
      }
      
      // Button find + click pattern (Manage, Offboard, Confirm etc)
      if (code.includes('btns') || code.includes('button')) {
        const btns = Array.from(document.querySelectorAll('button,[role="menuitem"],[role="option"]'));
        const keywords = ['offboard', 'deactivate', 'remove', 'confirm', 'yes', 'manage'];
        for (const kw of keywords) {
          if (!code.toLowerCase().includes(kw)) continue;
          const btn = btns.find((b: any) => b.textContent?.trim().toLowerCase().includes(kw)) as HTMLElement | undefined;
          if (btn) { btn.click(); return { clicked: true, text: btn.textContent?.trim(), keyword: kw }; }
        }
        return { found: false, available: btns.map((b: any) => b.textContent?.trim()).filter(Boolean).slice(0, 15) };
      }
      
      // Checkbox select pattern
      if (code.includes('checkbox') || code.includes('input[type')) {
        const rows = Array.from(document.querySelectorAll('.v-data-table__tr,tbody tr,[class*="row"]'));
        const match = rows.find((r: any) => r.textContent?.toLowerCase().includes(identifier.toLowerCase()));
        if (!match) return { found: false };
        const cb = (match as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement | null;
        if (cb) { cb.click(); return { found: true, selectedCheckbox: true }; }
        (match as HTMLElement).click();
        return { found: true, clicked: true };
      }
      
      // Field modification pattern (clearAndType, findVuetifyInput, nativeInputValueSetter)
      if (code.includes('clearAndType') || code.includes('findVuetifyInput') || code.includes('nativeInputValueSetter')) {
        // Inline field modification — can't call external functions from executeScript context
        function _findInput(labelTerms: string[]): HTMLInputElement | null {
          for (const c of Array.from(document.querySelectorAll('.v-input, .v-field'))) {
            const l = c.querySelector('.v-label, .v-field-label');
            const inp = c.querySelector('input, textarea') as HTMLInputElement | null;
            if (!l || !inp) continue;
            const t = l.textContent?.trim().toLowerCase() || '';
            if (labelTerms.some(term => t.includes(term.toLowerCase()))) return inp;
          }
          for (const div of Array.from(document.querySelectorAll('.mb-2, .text-body-2'))) {
            const t = div.textContent?.trim().toLowerCase() || '';
            if (!labelTerms.some(term => t.includes(term.toLowerCase()))) continue;
            let sib = div.nextElementSibling;
            while (sib) {
              const inp = sib.querySelector('input, textarea') as HTMLInputElement | null;
              if (inp) return inp;
              sib = sib.nextElementSibling;
            }
          }
          return null;
        }
        function _setVal(input: HTMLInputElement, value: string) {
          input.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, value); else input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const updates: Record<string, boolean> = {};
        const fieldMap: [string, string[]][] = [
          ['new_first_name', ['first name']],
          ['new_last_name', ['last name']],
          ['new_personal_email', ['personal', 'recovery']],
          ['new_company_email', ['company email']],
          ['new_phone', ['phone']],
          ['new_title', ['title', 'job title']],
          ['new_department', ['department']],
        ];
        for (const [paramKey, labels] of fieldMap) {
          const value = params[paramKey];
          if (!value) continue;
          const input = _findInput(labels);
          if (input) { _setVal(input, value); updates[paramKey] = true; }
          else { updates[paramKey + '_not_found'] = true; }
        }
        return { updated: updates, fieldsModified: Object.keys(updates).filter(k => !k.includes('_not_found')).length };
      }

      return { __error: 'No matching pattern for js step' };
    } catch(e: any) {
      return { __error: e.message };
    }
  }



  // ── Trusted type via chrome.debugger ─────────────────────────────────────────
  async function trustedType(tabId: number, selector: string, text: string) {
    await ensureDebugger(tabId);
    const target = { tabId };
    await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
      expression: `(function(){const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.focus();el.click();el.select&&el.select();return true;})()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 80));
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65 });
    await chrome.debugger.sendCommand(target, 'Input.insertText', { text });
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    return { ok: true };
  }

  // ── Debugger session management ─────────────────────────────────────────────
  // Keep debugger attached for the duration of a chain to avoid viewport resize
  // flicker from attach/detach (the info bar causes layout shifts that can close menus).
  let _debuggerTabId: number | null = null;

  async function ensureDebugger(tabId: number) {
    if (_debuggerTabId === tabId) return; // already attached
    if (_debuggerTabId !== null) {
      try { await chrome.debugger.detach({ tabId: _debuggerTabId }); } catch (_) {}
    }
    try { await chrome.debugger.attach({ tabId }, '1.3'); } catch (e: any) {
      if (!e.message?.includes('already attached')) throw e;
    }
    _debuggerTabId = tabId;
  }

  async function releaseDebugger() {
    if (_debuggerTabId !== null) {
      try { await chrome.debugger.detach({ tabId: _debuggerTabId }); } catch (_) {}
      _debuggerTabId = null;
    }
  }

  // ── Trusted click via chrome.debugger Runtime.evaluate ───────────────────────
  // CDP Runtime.evaluate click events work with Vuetify menus (chrome.scripting.executeScript doesn't).
  // Debugger stays attached across the chain to prevent viewport resize closing menus.
  async function trustedClick(tabId: number, selector: string, buttonText: string | null = null) {
    await ensureDebugger(tabId);
    const expr = `(function(){
      let el = ${JSON.stringify(selector)} ? document.querySelector(${JSON.stringify(selector)}) : null;
      if (!el && ${JSON.stringify(buttonText)}) {
        el = Array.from(document.querySelectorAll('button,[role="button"],a,[role="menuitem"]'))
          .find(b => b.textContent?.trim().toLowerCase().includes(${JSON.stringify(buttonText?.toLowerCase() || '')})) || null;
      }
      if (!el) return { ok: false, error: 'Not found: ' + (${JSON.stringify(selector)} || ${JSON.stringify(buttonText)}) };
      el.click();
      return { ok: true, tag: el.tagName, text: el.textContent?.trim() };
    })()`;
    const result: any = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: expr,
      returnByValue: true
    });
    return result?.result?.value || { ok: false, error: 'No result from Runtime.evaluate' };
  }

  // ── Navigation ────────────────────────────────────────────────────────────────
  function navigateAndWait(tabId: number, url: string): Promise<{ ok: boolean; url: string }> {
    return new Promise((resolve) => {
      chrome.tabs.update(tabId, { url });
      function listener(updatedTabId: number, info: chrome.tabs.TabChangeInfo) {
        if (updatedTabId === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(() => resolve({ ok: true, url }), 600);
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve({ ok: true, url }); }, 15000);
    });
  }

  // ── executeScript helper ──────────────────────────────────────────────────────
  async function execInTab(tabId: number, func: Function, args: any[]) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: func as any,
      args,
      world: 'MAIN'
    });
    return results?.[0]?.result;
  }

  // ── Step executor ─────────────────────────────────────────────────────────────
  async function executeStep(step: any, run: any) {
    const t0 = Date.now();
    const { tabId, params, buffer, abstractTargets } = run;
    const a = step.action;

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
        // Mid-chain auth detection: check if navigate landed on /login
        const currentUrl = await execInTab(tabId, () => window.location.href, []);
        if (currentUrl && isLoginUrl(currentUrl) && !isLoginUrl(url)) {
          // We asked for a real page but got redirected to login — session expired
          return {
            stepId: step.stepId,
            action: a,
            status: 'auth_required',
            url: currentUrl,
            requestedUrl: url,
            surpriseEvidence: [
              createSurpriseEvidence('url_mismatch', {
                stepId: step.stepId,
                expected: url,
                observed: currentUrl,
                details: 'Navigation redirected to login',
              }),
            ],
            durationMs: Date.now() - t0,
          };
        }
        return { stepId: step.stepId, action: a, status: 'ok', url: r.url, durationMs: Date.now() - t0 };
      }

      if (a === 'type') {
        const value = interpolate(step.value || '', { ...params, ...buffer });
        const tgt = step.target ? abstractTargets?.[step.target] : null;
        let resolvedSelector = step.selector || null;
        let resolvedVia = 'direct';
        let confidence = 1.0;
        if (tgt) {
          const res = await execInTab(tabId, PRE_RESOLVE_TARGET, [tgt]);
          if (!res?.found) throw new Error('Cannot resolve: ' + step.target);
          resolvedSelector = res.selector;
          resolvedVia = res.resolvedVia;
          confidence = res.confidence;
          if (resolvedSelector && res.resolvedVia !== 'cached') {
            tgt.cachedSelector = resolvedSelector;
            tgt.cachedConfidence = res.confidence;
            tgt.resolvedOn = new Date().toISOString();
          }
        }
        if (!resolvedSelector) throw new Error('No selector for: ' + (step.target || step.selector));
        await trustedType(tabId, resolvedSelector, value);
        // If step has responseSignature, wait for the expected element to appear (e.g. search results filtering)
        if (step.responseSignature?.length) {
          const sig = step.responseSignature[0];
          const sigSel = sig.selector || sig.any_of?.[0]?.selector;
          const sigTimeout = sig.timeout || 2000;
          if (sigSel) {
            const sigStart = Date.now();
            while (Date.now() - sigStart < sigTimeout) {
              const found = await execInTab(tabId, (s: string) => !!document.querySelector(s), [sigSel]);
              if (found) break;
              await new Promise(r => setTimeout(r, 200));
            }
          }
        }
        return { stepId: step.stepId, action: a, status: 'ok', value, selector: resolvedSelector, resolvedVia, confidence, target: step.target, durationMs: Date.now() - t0 };
      }

      if (a === 'click') {
        const tgt = step.target ? abstractTargets?.[step.target] : null;
        let resolvedSelector = step.selector || null;
        let resolvedVia = 'direct';
        let buttonText = null;
        if (tgt) {
          const res = await execInTab(tabId, PRE_RESOLVE_TARGET, [tgt]);
          if (!res?.found) throw new Error('Cannot resolve: ' + step.target);
          resolvedSelector = res.selector;
          resolvedVia = res.resolvedVia;
          buttonText = res.buttonText || null;
        }
        const r = await execInTab(tabId, PRE_GUARDED_CLICK, [resolvedSelector, buttonText]);
        if (!r?.ok) throw new Error(r?.error || 'Click failed');
        return { stepId: step.stepId, action: a, status: 'ok', selector: resolvedSelector, resolvedVia, target: step.target, clickDiag: r, durationMs: Date.now() - t0 };
      }

      if (a === 'wait_for') {
        const timeout = step.timeout || 8000;
        const start = Date.now();

        // URL pattern mode: poll until window.location matches
        if (step.url_pattern) {
          const pat = interpolate(step.url_pattern, { ...params, ...buffer });
          while (Date.now() - start < timeout) {
            const url = await execInTab(tabId, () => window.location.href, []);
            if (url && new RegExp(pat).test(url)) return { stepId: step.stepId, action: a, status: 'ok', url, durationMs: Date.now() - t0 };
            await new Promise(r => setTimeout(r, 200));
          }
          throw new Error('wait_for url timeout: ' + pat);
        }

        // Element selector mode
        let sel: string | null = step.selector || null;
        if (!sel && step.target && abstractTargets?.[step.target]) {
          const res = await execInTab(tabId, PRE_RESOLVE_TARGET, [abstractTargets[step.target]]);
          sel = res?.selector || null;
          if (!sel) sel = abstractTargets[step.target].fallbackSelectors?.[0] || null;
        }
        if (!sel) sel = interpolate(step.target || '', params); // last resort: literal
        while (Date.now() - start < timeout) {
          const found = await execInTab(tabId, (s: string) => !!document.querySelector(s), [sel as string]);
          if (found) return { stepId: step.stepId, action: a, status: 'ok', selector: sel, durationMs: Date.now() - t0 };
          await new Promise(r => setTimeout(r, 300));
        }
        throw new Error('wait_for timeout: ' + sel);
      }

      if (a === 'read') {
        const candidates = step.candidates || (step.selector ? [step.selector] : []);
        if (candidates.length === 0) {
          // No selectors — do a full page snapshot
          const snapshot = await execInTab(tabId, PRE_PAGE_SNAPSHOT, []);
          if (step.store_as) buffer[step.store_as] = snapshot;
          return { stepId: step.stepId, action: a, status: 'ok', text: JSON.stringify(snapshot), snapshot, durationMs: Date.now() - t0 };
        }
        const r = await execInTab(tabId, PRE_GUARDED_READ, [candidates]);
        if (step.store_as) buffer[step.store_as] = r?.text || null;
        return { stepId: step.stepId, action: a, status: 'ok', text: r?.text || null, selector: r?.selector, durationMs: Date.now() - t0 };
      }

      if (a === 'assess_state') {
        const sg = step.stateGraph || run.payload?.stateGraph || { nodes: {} };
        const r = await execInTab(tabId, PRE_ASSESS_STATE, [sg]);
        const matched = !step.expect?.state || r?.state === step.expect.state;
        const surpriseEvidence = matched ? undefined : [
          createSurpriseEvidence('state_mismatch', {
            stepId: step.stepId,
            expected: step.expect?.state,
            observed: r?.state || 'unknown',
            details: 'assess_state did not match expected state',
          }),
        ];
        return { stepId: step.stepId, action: a, status: 'ok', state: r?.state, matched, surpriseEvidence, durationMs: Date.now() - t0 };
      }

      if (a === 'js') {
        // Execute pre-bundled function directly — avoids CSP unsafe-eval
        // The code is passed as a template; we use PRE_FIND_ROW_AND_CLICK for row ops
        // and PRE_FIND_AND_CLICK_TEXT for text clicks.
        // For arbitrary js steps, detect the pattern and dispatch to the right fn.
        const code = interpolate(step.code || '', { ...params, ...buffer });
        let r: any;
        if (code.includes('querySelector') || code.includes('querySelectorAll')) {
          // Run as a self-contained IIFE via pre-bundled wrapper
          // Pass code as string but execute in ISOLATED world via content script message
          // For now: use PRE_FIND_ROW_AND_CLICK if it looks like a row-find operation
          const identifier = params[Object.keys(params)[0]] || '';
          if (code.includes('find(r =>') || code.includes('find(row')) {
            r = await execInTab(tabId, PRE_FIND_ROW_AND_CLICK, [identifier]);
          } else {
            // Generic DOM query — wrap in a safe pre-bundled executor
            r = await execInTab(tabId, PRE_RUN_DOMQUERY, [code, { ...params, ...buffer }]);
          }
        } else {
          r = await execInTab(tabId, PRE_RUN_DOMQUERY, [code, { ...params, ...buffer }]);
        }
        if (r?.__error) throw new Error(r.__error);
        if (step.store_as) buffer[step.store_as] = r;
        return { stepId: step.stepId, action: a, status: 'ok', result: r, durationMs: Date.now() - t0 };
      }

      if (a === 'delay') {
        const ms = step.ms || step.timeout || 1000;
        await new Promise(r => setTimeout(r, ms));
        return { stepId: step.stepId, action: a, status: 'ok', delayMs: ms, durationMs: Date.now() - t0 };
      }

      if (a === 'perceive') {
        const r = await execInTab(tabId, PRE_PAGE_RECON, []);
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

    } catch (err: any) {
      const message = err.message;
      let surpriseEvidence: any[] | undefined;
      if (message.includes('Cannot resolve') || message.includes('No selector for') || message.includes('Row not found') || message.includes('Text not found') || message.includes('Not found:')) {
        surpriseEvidence = [createSurpriseEvidence('target_not_found', {
          stepId: step.stepId,
          target: step.target || step.selector || step.text || step.identifier,
          details: message,
        })];
      } else if (message.includes('wait_for url timeout')) {
        surpriseEvidence = [createSurpriseEvidence('url_mismatch', {
          stepId: step.stepId,
          expected: interpolate(step.url_pattern || '', { ...params, ...buffer }),
          observed: await execInTab(tabId, () => window.location.href, []),
          details: message,
        })];
      } else if (message.includes('wait_for timeout')) {
        surpriseEvidence = [createSurpriseEvidence('guard_timeout', {
          stepId: step.stepId,
          target: step.selector || step.target,
          details: message,
        })];
      } else {
        surpriseEvidence = [createSurpriseEvidence('unexpected_ui', {
          stepId: step.stepId,
          details: message,
        })];
      }
      return { stepId: step.stepId, action: a, status: 'error', error: message, surpriseEvidence, durationMs: Date.now() - t0 };
    }
  }

  // ── Overlay messaging helper ────────────────────────────────────────────────
  function sendOverlay(tabId: number, msg: any) {
    try { chrome.tabs.sendMessage(tabId, msg); } catch (_) {}
  }

  // Auth types:
  //   'sso_automatable' — Google/GitHub SSO, extension can click through (YeshID, many SaaS apps)
  //   'manual_required' — MFA/phone push, user must complete login (Okta, Azure AD, Duo-protected)
  //   'none'            — no auth needed or auth handled externally
  function getAuthConfig(payload: any, params: Record<string, any>) {
    return {
      baseUrl: params?.base_url || payload?.defaults?.base_url || DEFAULT_BASE_URL,
      // Auth type from site model, payload, or params — defaults to sso_automatable for backward compat
      authType:
        params?.auth_type ||
        payload?._meta?.auth?.type ||
        'sso_automatable',
      googleAccountEmail:
        params?.google_account_email ||
        params?.sso_email ||
        payload?._meta?.auth?.googleAccountEmail ||
        payload?.auth?.googleAccountEmail ||
        null,
    };
  }

  // ── Auth recovery ─────────────────────────────────────────────────────────────
  // Pauses chain execution, clicks SSO, selects Google account, waits for redirect back
  async function waitForAuth(tabId: number, runId: string, authConfig: { baseUrl?: string; googleAccountEmail?: string | null } = {}, authTimeoutMs: number = 120000): Promise<{ authenticated: boolean; waitMs: number }> {
    console.log('[Yeshie] Auth required — entering auth wait flow');
    const baseUrl = authConfig.baseUrl || DEFAULT_BASE_URL;
    const loginUrl = new URL('/login', baseUrl).toString();
    const googleAccountEmail = authConfig.googleAccountEmail || null;

    // Show overlay to user
    sendOverlay(tabId, {
      type: 'overlay_show',
      runId,
      taskName: '🔐 Session expired — logging in…',
      steps: [
        { stepId: 'auth-detect', label: 'Session expired detected', status: 'ok' },
        { stepId: 'auth-sso', label: 'Clicking Sign in with Google…', status: 'running' },
        { stepId: 'auth-account', label: 'Selecting Google account…', status: 'pending' },
        { stepId: 'auth-wait', label: 'Waiting for redirect back…', status: 'pending' }
      ]
    });

    // Step 1: Get to the YeshID login page and click Google SSO
    const authCheck = await execInTab(tabId, PRE_CHECK_AUTH, []);
    if (!authCheck?.onLoginPage) {
      await navigateAndWait(tabId, loginUrl);
      await new Promise(r => setTimeout(r, 1000));
    }
    const ssoResult = await execInTab(tabId, PRE_CLICK_SSO_BUTTON, []);
    console.log('[Yeshie] SSO click result:', ssoResult);
    sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: 'auth-sso', status: 'ok' });

    // Step 2: Wait for Google account chooser page to load, then click the right account
    sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: 'auth-account', status: 'running' });
    const t0 = Date.now();
    let googleAccountClicked = false;

    // Poll for Google OAuth page — SSO button click redirects the tab to accounts.google.com
    while (Date.now() - t0 < 15000 && !googleAccountClicked) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        // Check current tab URL via chrome.tabs API
        const tab = await chrome.tabs.get(tabId);
        const tabUrl = tab?.url || '';
        console.log('[Yeshie] Auth polling, tab URL:', tabUrl);

        if (tabUrl.includes('accounts.google.com')) {
          if (googleAccountEmail) {
            await new Promise(r => setTimeout(r, 1500)); // let the page render
            const clickResult = await execInTab(tabId, PRE_CLICK_GOOGLE_ACCOUNT, [googleAccountEmail]);
            console.log('[Yeshie] Google account click result:', clickResult);
            googleAccountClicked = clickResult?.clicked || false;
            if (googleAccountClicked) {
              sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: 'auth-account', status: 'ok' });
            }
          } else {
            console.log('[Yeshie] No google_account_email configured — waiting for manual account selection');
            sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: 'auth-account', status: 'pending', detail: 'Select your Google account manually' });
          }
        } else if (tabUrl.startsWith(baseUrl) && !isLoginUrl(tabUrl)) {
          // Already redirected back — SSO was auto-completed (cached session)
          googleAccountClicked = true;
          sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: 'auth-account', status: 'ok', detail: 'Auto-login' });
        }
      } catch (e: any) {
        console.log('[Yeshie] Auth poll error:', e.message);
      }
    }

    if (!googleAccountClicked) {
      console.log('[Yeshie] Could not click Google account — waiting for manual login');
    }

    // Step 3: Wait for the tab to return to YeshID authenticated
    sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: 'auth-wait', status: 'running' });
    while (Date.now() - t0 < authTimeoutMs) {
      try {
        const tab = await chrome.tabs.get(tabId);
        const tabUrl = tab?.url || '';
        // Check if we're back on the configured app (not login page)
        if (tabUrl.startsWith(baseUrl) && !isLoginUrl(tabUrl)) {
          // Verify DOM is ready with nav drawer
          const check = await execInTab(tabId, PRE_CHECK_AUTH, []);
          if (check?.authenticated) {
            console.log('[Yeshie] Auth recovered after', Date.now() - t0, 'ms');
            sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: 'auth-wait', status: 'ok' });
            await new Promise(r => setTimeout(r, 1500));
            return { authenticated: true, waitMs: Date.now() - t0 };
          }
        }
      } catch (e: any) {
        console.log('[Yeshie] Auth wait poll error:', e.message);
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log('[Yeshie] Auth timeout after', authTimeoutMs, 'ms');
    sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: 'auth-wait', status: 'error', detail: 'Login timed out' });
    return { authenticated: false, waitMs: Date.now() - t0 };
  }

  // Check if a URL indicates the user has been redirected to a login/auth page.
  // Covers multiple patterns:
  //   - YeshID: /login
  //   - Okta: /oauth2/v1/authorize (OAuth2 PKCE redirect)
  //   - Generic: /signin, /sign-in, /auth/*, /sso/*
  function isLoginUrl(url: string): boolean {
    try {
      const u = new URL(url);
      const p = u.pathname;
      return (
        p === '/login' || p === '/login/' ||
        p === '/signin' || p === '/signin/' ||
        p === '/sign-in' || p === '/sign-in/' ||
        /^\/oauth2\/.*\/authorize\/?$/.test(p) ||  // Okta OAuth2 authorize
        /^\/oauth2\/v[12]\/authorize\/?$/.test(p) || // Okta /oauth2/v1/authorize
        /^\/auth\//.test(p) ||                       // Generic /auth/* paths
        /^\/sso\//.test(p)                           // Generic /sso/* paths
      );
    } catch { return false; }
  }

  // ── Chain runner ──────────────────────────────────────────────────────────────
  async function startRun(runId: string, payload: any, params: Record<string, any>, tabId: number) {
    // Auto-discover active tab if none provided
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs[0]?.id) {
        tabId = tabs[0].id;
        console.log('[Yeshie] Auto-discovered active tab:', tabId, tabs[0].url);
      } else {
        // Fallback: find any tab with the base_url or any http tab
        const baseUrl = params?.base_url;
        const allTabs = await chrome.tabs.query({ url: baseUrl ? `${baseUrl}/*` : 'https://*/*' });
        if (allTabs[0]?.id) {
          tabId = allTabs[0].id;
          console.log('[Yeshie] Found matching tab:', tabId, allTabs[0].url);
        } else {
          throw new Error('No active tab found. Open a browser tab first.');
        }
      }
    }
    const chain = payload.chain || [];
    const abstractTargets = JSON.parse(JSON.stringify(payload.abstractTargets || {}));
    const run = { runId, payload, params, tabId, abstractTargets, buffer: {} as any, stepIndex: 0, status: 'running', result: null as any, stepResults: [] as any[], resolvedTargets: [] as any[] };
    runs.set(runId, run);
    abortFlags.set(runId, false);
    const t0 = Date.now();

    // ── Pre-chain auth check ──────────────────────────────────────────────────
    // Before executing any steps, verify the user is authenticated.
    // Skip this check if:
    //   - the first step is already an assess_state (payload handles it)
    //   - the payload sets _meta.skipAuthCheck
    //   - authType is 'none' or 'manual_required' (no pre-chain auto-auth)
    //   - the current tab URL is on a different domain than the auth baseUrl
    //     (the chain's first navigate step will take us to the right site)
    const firstStepIsAssess = chain[0]?.action === 'assess_state';
    const skipAuthCheck = payload._meta?.skipAuthCheck === true;
    const authConfig = getAuthConfig(payload, params);

    // Site-aware auth: only run automated pre-chain auth for sso_automatable sites
    // where the current tab is on the auth domain
    const canAutoAuth = authConfig.authType === 'sso_automatable';
    let tabOnAuthDomain = true;
    try {
      const tab = await chrome.tabs.get(tabId);
      const tabHost = tab.url ? new URL(tab.url).hostname : '';
      const authHost = new URL(authConfig.baseUrl || DEFAULT_BASE_URL).hostname;
      tabOnAuthDomain = tabHost === authHost;
      if (!tabOnAuthDomain) {
        console.log(`[Yeshie] Tab domain (${tabHost}) differs from auth domain (${authHost}) — skipping pre-chain auth check`);
      }
    } catch (e) {
      console.log('[Yeshie] Could not determine tab URL for auth check, skipping:', e);
      tabOnAuthDomain = false;
    }

    if (!canAutoAuth && !firstStepIsAssess) {
      console.log(`[Yeshie] Auth type is '${authConfig.authType}' — skipping pre-chain automated auth (mid-chain detection still active)`);
    }

    if (!firstStepIsAssess && !skipAuthCheck && canAutoAuth && tabOnAuthDomain) {
      const preAuth = await execInTab(tabId, PRE_CHECK_AUTH, []);
      if (preAuth && !preAuth.authenticated) {
        const authResult = await waitForAuth(tabId, runId, authConfig);
        if (!authResult.authenticated) {
          run.status = 'failed';
          run.result = buildChainResult(run, t0, false, 'Authentication failed — user did not complete login within timeout');
          await chrome.storage.session.set({ [runId]: run.result });
          return;
        }
        // After auth recovery, we may need to navigate back to the right page
        // The first navigate step in the chain will handle this
      }
    }

    // Send overlay_show with step list
    sendOverlay(tabId, {
      type: 'overlay_show',
      runId,
      taskName: payload._meta?.description || 'Running task',
      steps: chain.map((s: any) => ({
        stepId: s.stepId,
        label: s.note || s.action + ' ' + (s.target || s.selector || s.text || ''),
        status: 'pending'
      }))
    });

    try {
      for (let i = 0; i < chain.length; i++) {
        // Abort check
        if (abortFlags.get(runId)) {
          // Mark remaining steps as skipped
          for (let j = i; j < chain.length; j++) {
            sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: chain[j].stepId, status: 'skipped' });
          }
          run.status = 'aborted';
          run.result = buildChainResult(run, t0, false, 'Aborted by user');
          await chrome.storage.session.set({ [runId]: run.result });
          break;
        }

        run.stepIndex = i;
        const step = chain[i];

        // Overlay: step running
        sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: step.stepId, status: 'running' });

        let res = await executeStep(step, run);

        // Mid-chain auth recovery: if a step reports auth_required, pause, recover, and retry
        // Only attempt auth recovery if the tab is on the auth domain (e.g. YeshID).
        // On non-YeshID sites, report the failure and let the caller handle it.
        if (res.status === 'auth_required') {
          let midChainAuthDomainMatch = false;
          try {
            const midTab = await chrome.tabs.get(tabId);
            const midTabHost = midTab.url ? new URL(midTab.url).hostname : '';
            const midAuthHost = new URL(authConfig.baseUrl || DEFAULT_BASE_URL).hostname;
            midChainAuthDomainMatch = midTabHost === midAuthHost;
          } catch { midChainAuthDomainMatch = false; }

          if (!midChainAuthDomainMatch) {
            // Non-YeshID-domain auth required — wait for user to manually authenticate
            // instead of running the YeshID SSO flow
            const requestedUrl = res.requestedUrl || res.url || '';
            let expectedHost = '';
            try { expectedHost = new URL(requestedUrl).hostname; } catch {}
            console.log(`[Yeshie] Mid-chain auth_required on non-auth domain (${expectedHost}) — waiting for manual login`);
            run.stepResults.push({ ...res, note: 'auth_required_manual_wait' });
            sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: step.stepId, status: 'running', detail: 'Session expired — please log in to continue…' });

            // Poll for user to complete login: tab should return to the expected domain
            const manualAuthTimeout = 120000;
            const manualAuthStart = Date.now();
            let manualAuthSuccess = false;
            while (Date.now() - manualAuthStart < manualAuthTimeout) {
              if (abortFlags.get(runId)) break;
              await new Promise(r => setTimeout(r, 2000));
              try {
                const pollTab = await chrome.tabs.get(tabId);
                const pollHost = pollTab.url ? new URL(pollTab.url).hostname : '';
                // User has logged in and returned to the expected domain (not on auth/login page)
                if (expectedHost && pollHost === expectedHost && !isLoginUrl(pollTab.url || '')) {
                  manualAuthSuccess = true;
                  break;
                }
              } catch { /* tab might be navigating */ }
            }

            if (!manualAuthSuccess) {
              run.status = 'failed';
              run.result = buildChainResult(run, t0, false, 'Manual authentication timed out — please log in and retry');
              await chrome.storage.session.set({ [runId]: run.result });
              sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: step.stepId, status: 'error', detail: 'Login timed out' });
              return;
            }

            console.log(`[Yeshie] Manual auth completed — resuming chain`);
            // Re-show the task overlay and retry the step
            sendOverlay(tabId, {
              type: 'overlay_show',
              runId,
              taskName: (payload._meta?.description || 'Running task') + ' (resumed after login)',
              steps: chain.map((s: any, idx: number) => ({
                stepId: s.stepId,
                label: s.note || s.action + ' ' + (s.target || s.selector || s.text || ''),
                status: idx < i ? 'ok' : idx === i ? 'running' : 'pending'
              }))
            });
            res = await executeStep(step, run);
            // Fall through to normal result handling below
          } else {
            // YeshID-domain auth recovery — use automated SSO flow
            run.stepResults.push({ ...res, note: 'auth_recovery_triggered' });
            sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: step.stepId, status: 'running', detail: 'Session expired — waiting for login…' });

            const authResult = await waitForAuth(tabId, runId, authConfig);
            if (!authResult.authenticated) {
              run.status = 'failed';
              run.result = buildChainResult(run, t0, false, 'Authentication failed mid-chain — login timed out');
              await chrome.storage.session.set({ [runId]: run.result });
              sendOverlay(tabId, { type: 'overlay_step_update', runId, stepId: step.stepId, status: 'error', detail: 'Login timed out' });
              return;
            }

            // Re-show the task overlay (auth overlay replaced it)
            sendOverlay(tabId, {
              type: 'overlay_show',
              runId,
              taskName: (payload._meta?.description || 'Running task') + ' (resumed)',
              steps: chain.map((s: any, idx: number) => ({
                stepId: s.stepId,
                label: s.note || s.action + ' ' + (s.target || s.selector || s.text || ''),
                status: idx < i ? 'ok' : idx === i ? 'running' : 'pending'
              }))
            });

            // Retry the step after auth recovery
            res = await executeStep(step, run);
          }
        }

        run.stepResults.push(res);

        // Overlay: step result
        sendOverlay(tabId, {
          type: 'overlay_step_update',
          runId,
          stepId: step.stepId,
          status: res.status === 'ok' || res.status === 'skipped' ? res.status : 'error',
          detail: res.error || null,
          durationMs: res.durationMs
        });

        if (res.selector && res.resolvedVia && step.target) {
          run.resolvedTargets.push({ abstractName: step.target, selector: res.selector, confidence: res.confidence || 0, resolvedVia: res.resolvedVia, resolvedAt: new Date().toISOString() });
        }

        if (step.action === 'assess_state' && !res.matched && step.onMismatch) {
          const branchName = step.onMismatch.replace('branch:', '');
          const branchSteps = payload.branches?.[branchName]?.steps || payload.branches?.[branchName] || [];
          for (const bStep of branchSteps) {
            const bRes = await executeStep(bStep, run);
            run.stepResults.push(bRes);
            if (bRes.status === 'error') {
              run.status = 'failed';
              run.result = buildChainResult(run, t0, false, bRes.error);
              await chrome.storage.session.set({ [runId]: run.result });
              return;
            }
          }
        }

        if (res.status === 'error') {
          run.status = 'failed';
          run.result = buildChainResult(run, t0, false, res.error);
          await chrome.storage.session.set({ [runId]: run.result });
          return;
        }
      }

      if (run.status !== 'aborted') {
        run.status = 'complete';
        run.result = buildChainResult(run, t0, true);
        await chrome.storage.session.set({ [runId]: run.result });
      }

    } catch (err: any) {
      run.status = 'failed';
      run.result = buildChainResult(run, t0, false, err.message);
      await chrome.storage.session.set({ [runId]: run.result });
    } finally {
      // Release debugger at end of chain (info bar disappears)
      await releaseDebugger();
      // Hide overlay after 3s delay
      abortFlags.delete(runId);
      setTimeout(() => sendOverlay(tabId, { type: 'overlay_hide', runId }), 3000);
    }
  }

  // ── Message handler ───────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'skill_run') {
      const runId = crypto.randomUUID();
      const tabId = msg.tabId || sender.tab?.id;
      if (!tabId) { sendResponse({ error: 'No tabId' }); return true; }
      // Store lastRunId so page can recover it after navigation
      chrome.storage.session.set({ __yeshieLastRunId: runId });
      startKeepalive();
      startRun(runId, msg.payload, msg.params || {}, tabId);
      sendResponse({ runId, status: 'started' });
      return true;
    }
    if (msg.type === 'get_active_runs') {
      const active = Array.from(runs.entries()).map(([id, r]) => ({ runId: id, status: r.status, stepIndex: r.stepIndex, totalSteps: r.payload?.chain?.length || 0 }));
      (async () => {
        const data = await chrome.storage.session.get('__yeshieLastRunId');
        sendResponse({ active, lastRunId: data.__yeshieLastRunId || null });
      })();
      return true;  // keep port open for async sendResponse
    }
    if (msg.type === 'get_status') {
      const run = runs.get(msg.runId);
      if (run) {
        sendResponse({ status: run.status, stepIndex: run.stepIndex, totalSteps: run.payload?.chain?.length || 0, result: run.result });
      } else {
        (async () => {
          const data = await chrome.storage.session.get(msg.runId);
          const result = data[msg.runId];
          sendResponse(result ? { status: 'complete', result } : { status: 'not_found' });
        })();
      }
      return true;
    }
    if (msg.type === 'abort') {
      const run = runs.get(msg.runId);
      if (run) { run.status = 'aborted'; runs.delete(msg.runId); }
      sendResponse({ aborted: true });
      return true;
    }
    if (msg.type === 'cancel_run') {
      const runId = msg.runId;
      if (runId && abortFlags.has(runId)) {
        abortFlags.set(runId, true);
      }
      sendResponse({ cancelled: true });
      return true;
    }
    if (msg.type === 'user_suggestion') {
      // Forward suggestion to relay for Claude to see
      if (socket && msg.runId && msg.suggestion) {
        socket.emit('user_suggestion', { runId: msg.runId, suggestion: msg.suggestion });
      }
      sendResponse({ received: true });
      return true;
    }
    if (msg.type === 'chat_message') {
      const { message, currentUrl, tabId } = msg;
      (async () => {
        try {
          const resp = await fetch(CHAT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, currentUrl, tabId, history: [] })
          });
          const data = await resp.json();
          sendResponse(data);
        } catch (e: any) {
          sendResponse({ type: 'error', error: e.message });
        }
      })();
      return true;
    }
    if (msg.type === 'chat_feedback') {
      (async () => {
        try {
          const resp = await fetch(CHAT_FEEDBACK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: msg.chatId, rating: msg.rating, comment: msg.comment })
          });
          sendResponse(await resp.json());
        } catch (e: any) {
          sendResponse({ error: e.message });
        }
      })();
      return true;
    }
    if (msg.type === 'chat_status') {
      (async () => {
        try {
          const resp = await fetch(CHAT_STATUS_URL);
          sendResponse(await resp.json());
        } catch (e: any) {
          sendResponse({ listenerConnected: false, error: e.message });
        }
      })();
      return true;
    }
    if (msg.type === 'teach_start' || msg.type === 'teach_goto' || msg.type === 'teach_end') {
      // Forward teach messages to the best available tab.
      // If the content overlay isn't loaded (common after hot-reload), inject it first.
      (async () => {
        // Find best tab
        let targetTabId: number | undefined;
        const focused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const realTab = focused.find(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
        if (realTab?.id) {
          targetTabId = realTab.id;
        } else {
          const yeshidTabs = await chrome.tabs.query({ url: 'https://app.yeshid.com/*' });
          if (yeshidTabs[0]?.id) targetTabId = yeshidTabs[0].id;
          else {
            const allTabs = await chrome.tabs.query({ url: 'https://*/*' });
            if (allTabs[0]?.id) targetTabId = allTabs[0].id;
          }
        }

        if (!targetTabId) {
          sendResponse({ ok: false, error: 'No suitable tab found. Open the YeshID page first.' });
          return;
        }

        const teachMsg: any = { type: msg.type };
        if (msg.type === 'teach_start') teachMsg.steps = msg.steps;
        if (msg.type === 'teach_goto') teachMsg.stepIndex = msg.stepIndex;

        // Attempt to send; if content script not loaded, inject it and retry once
        const trySend = async (): Promise<{ ok: boolean; error?: string }> => {
          try {
            await chrome.tabs.sendMessage(targetTabId!, teachMsg);
            return { ok: true };
          } catch (_) {
            return { ok: false };
          }
        };

        let result = await trySend();
        if (!result.ok) {
          // Content overlay not injected — inject it now (happens after hot-reload)
          console.log('[Yeshie] Content overlay not loaded in tab', targetTabId, '— injecting');
          try {
            await chrome.scripting.executeScript({
              target: { tabId: targetTabId! },
              files: ['content-overlay.js']
            });
            await new Promise(r => setTimeout(r, 300)); // let it initialise
            result = await trySend();
          } catch (injectErr: any) {
            console.warn('[Yeshie] Failed to inject content overlay:', injectErr.message);
            sendResponse({ ok: false, error: `Could not inject overlay into tab ${targetTabId}: ${injectErr.message}` });
            return;
          }
        }

        if (!result.ok) {
          sendResponse({ ok: false, error: 'Content overlay loaded but message delivery still failed. Try navigating the YeshID tab.' });
        } else {
          sendResponse({ ok: true, tabId: targetTabId });
        }
      })();
      return true;
    }
    if (msg.type === 'content_ready') return false;
  });
});
