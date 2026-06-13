/**
 * content-observer.ts — Do-It-Once DOM event capture
 *
 * Injected as a content script in all pages. When recording is active
 * (driven by background.ts), captures DOM interactions as DemoTrace events
 * and sends them to the background for forwarding to the observation bus.
 *
 * Events captured: click, input, navigate (URL change), XHR fingerprints.
 * Targets are always semantic (role + accessible name), never raw coordinates.
 *
 * Recording is toggled via:
 *   - Ctrl+Alt+R (chrome.commands, handled in background.ts → forwarded here)
 *   - relay message 'record_toggle' (programmatic, for headless/test use)
 */

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    // ── State ──────────────────────────────────────────────────────────────────
    let recording = false;
    let episodeId: string | null = null;
    let indicatorEl: HTMLElement | null = null;
    let lastUrl = window.location.href;

    // ── Indicator UI ────────────────────────────────────────────────────────────

    function showIndicator() {
      if (indicatorEl) return;
      indicatorEl = document.createElement('div');
      indicatorEl.id = '__yeshie_rec_indicator';
      indicatorEl.style.cssText = [
        'position:fixed',
        'top:8px',
        'right:8px',
        'z-index:2147483647',
        'background:#e53935',
        'color:#fff',
        'font-family:-apple-system,sans-serif',
        'font-size:12px',
        'font-weight:600',
        'padding:4px 10px',
        'border-radius:12px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
        'pointer-events:none',
        'letter-spacing:0.5px',
        'line-height:1.4',
      ].join(';');
      indicatorEl.textContent = '● REC';
      document.documentElement.appendChild(indicatorEl);
    }

    function hideIndicator() {
      indicatorEl?.remove();
      indicatorEl = null;
    }

    // ── Target resolver (semantic, no raw coordinates) ─────────────────────────

    function getAccessibleName(el: Element): string {
      // Priority: aria-label > aria-labelledby > label[for] > placeholder > text content
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();

      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl?.textContent) return labelEl.textContent.trim();
      }

      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label?.textContent) return label.textContent.trim();
      }

      const placeholder = (el as HTMLInputElement).placeholder;
      if (placeholder) return placeholder.trim();

      const text = el.textContent?.trim();
      if (text && text.length < 80) return text;

      return '';
    }

    function getRole(el: Element): string {
      const explicit = el.getAttribute('role');
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      const typeMap: Record<string, string> = {
        button: 'button', a: 'link', input: 'textbox',
        textarea: 'textbox', select: 'combobox', checkbox: 'checkbox',
        img: 'img', h1: 'heading', h2: 'heading', h3: 'heading',
        nav: 'navigation', main: 'main', form: 'form',
      };
      if (tag === 'input') {
        const t = (el as HTMLInputElement).type;
        if (t === 'checkbox') return 'checkbox';
        if (t === 'radio') return 'radio';
        if (t === 'submit' || t === 'button') return 'button';
      }
      return typeMap[tag] || tag;
    }

    function getStableId(el: Element): string | null {
      return (
        el.getAttribute('data-cy') ||
        el.getAttribute('data-testid') ||
        el.getAttribute('aria-label') ||
        null
      );
    }

    function getStableSelector(el: Element): string | null {
      const dataCy = el.getAttribute('data-cy');
      if (dataCy) return `[data-cy="${dataCy}"]`;
      const testid = el.getAttribute('data-testid');
      if (testid) return `[data-testid="${testid}"]`;
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
      const placeholder = (el as HTMLInputElement).placeholder;
      if (placeholder) return `[placeholder="${placeholder}"]`;
      return null;
    }

    function buildTarget(el: Element) {
      return {
        role: getRole(el),
        name: getAccessibleName(el),
        selector: getStableSelector(el),
        stableId: getStableId(el),
      };
    }

    // ── Event emission ──────────────────────────────────────────────────────────

    function emitEvent(eventType: string, target: object | null, value: { literal: string | null; provenance: string | null } | null, extra: object = {}) {
      if (!recording || !episodeId) return;

      const envelope = {
        type: eventType,
        ts: new Date().toISOString(),
        surface: 'browser',
        app: 'Chrome',
        origin: window.location.origin,
        origin_or_bundle: window.location.hostname,
        event_type: eventType,
        episode_id: episodeId,
        url: window.location.href,
        target: target || undefined,
        value: value || undefined,
        ...extra,
      };

      chrome.runtime.sendMessage({ type: 'record_event', envelope }).catch(() => {});
    }

    // ── Click capture ───────────────────────────────────────────────────────────

    function handleClick(e: MouseEvent) {
      if (!recording) return;
      const el = e.composedPath()[0] as Element | null;
      if (!el) return;
      // Walk up to find meaningful interactive element
      let target: Element | null = el;
      for (let i = 0; i < 5 && target; i++) {
        const tag = target.tagName?.toLowerCase();
        if (['button', 'a', 'input', 'select', 'textarea'].includes(tag) ||
            target.getAttribute('role') === 'button' ||
            target.getAttribute('role') === 'menuitem' ||
            target.getAttribute('role') === 'option') {
          break;
        }
        target = target.parentElement;
      }
      if (!target) target = el;

      emitEvent('click', buildTarget(target), null);
    }

    // ── Input capture ───────────────────────────────────────────────────────────

    function handleInput(e: Event) {
      if (!recording) return;
      const el = e.target as HTMLInputElement | null;
      if (!el) return;
      const tag = el.tagName?.toLowerCase();
      if (!['input', 'textarea', 'select'].includes(tag) &&
          el.getAttribute('contenteditable') == null) return;

      // Detect provenance: InputEvent with inputType gives us typed vs pasted
      let provenance: string | null = 'typed';
      if (e instanceof InputEvent) {
        if (e.inputType === 'insertFromPaste') provenance = 'pasted';
        else if (e.inputType === 'insertFromDrop') provenance = 'pasted';
        else if (e.inputType?.startsWith('insert')) provenance = 'typed';
      }

      // Don't capture password fields
      if ((el as HTMLInputElement).type === 'password') return;

      emitEvent('input', buildTarget(el), {
        literal: (el as HTMLInputElement).value ?? el.textContent ?? '',
        provenance,
      });
    }

    // ── Navigation capture ──────────────────────────────────────────────────────

    function checkNavigation() {
      if (!recording) return;
      const current = window.location.href;
      if (current !== lastUrl) {
        emitEvent('navigate', null, null, { from_url: lastUrl, url: current });
        lastUrl = current;
      }
    }

    // Poll for URL changes (handles SPA navigation without History API events)
    let navInterval: ReturnType<typeof setInterval> | null = null;

    function startNavWatcher() {
      navInterval = setInterval(checkNavigation, 500);
    }

    function stopNavWatcher() {
      if (navInterval) { clearInterval(navInterval); navInterval = null; }
    }

    // ── XHR fingerprint capture ─────────────────────────────────────────────────

    function installXhrHook() {
      const w = window as any;
      if (w.__yeshie_xhr_hooked) return;
      w.__yeshie_xhr_hooked = true;

      // Patch fetch
      const origFetch = window.fetch.bind(window);
      window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
        if (recording) {
          const url = typeof input === 'string' ? input
            : input instanceof URL ? input.toString()
            : (input as Request).url;
          const method = init?.method || (input instanceof Request ? input.method : 'GET');
          // Normalize URL: replace UUIDs and numeric IDs with {param}
          const pattern = url.replace(/\/[0-9a-f-]{8,}(?:[0-9a-f-]{4,})*\//gi, '/{param}/')
                             .replace(/\?.*$/, '');
          emitEvent('xhr', null, null, {
            method: method.toUpperCase(),
            urlPattern: pattern,
          });
        }
        return origFetch(input as any, init);
      };
    }

    // ── Start / stop recording ──────────────────────────────────────────────────

    function startRecording(id: string) {
      if (recording) return;
      recording = true;
      episodeId = id;
      lastUrl = window.location.href;

      showIndicator();
      document.addEventListener('click', handleClick, { capture: true });
      document.addEventListener('input', handleInput, { capture: true });
      startNavWatcher();
      installXhrHook();

      // Emit episode_start
      const startEnvelope = {
        type: 'episode_start',
        ts: new Date().toISOString(),
        surface: 'browser',
        app: 'Chrome',
        origin: window.location.origin,
        origin_or_bundle: window.location.hostname,
        event_type: 'episode_start',
        episode_id: episodeId,
        url: window.location.href,
      };
      chrome.runtime.sendMessage({ type: 'record_event', envelope: startEnvelope }).catch(() => {});
    }

    function stopRecording() {
      if (!recording) return;
      recording = false;

      // Emit episode_end
      const endEnvelope = {
        type: 'episode_end',
        ts: new Date().toISOString(),
        surface: 'browser',
        app: 'Chrome',
        origin: window.location.origin,
        origin_or_bundle: window.location.hostname,
        event_type: 'episode_end',
        episode_id: episodeId,
        url: window.location.href,
      };
      chrome.runtime.sendMessage({ type: 'record_event', envelope: endEnvelope }).catch(() => {});

      episodeId = null;
      hideIndicator();
      document.removeEventListener('click', handleClick, { capture: true });
      document.removeEventListener('input', handleInput, { capture: true });
      stopNavWatcher();
    }

    // ── Message handler (from background) ──────────────────────────────────────

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'record_start') {
        startRecording(msg.episodeId);
      } else if (msg.type === 'record_stop') {
        stopRecording();
      } else if (msg.type === 'record_query') {
        return { recording, episodeId };
      }
    });

    // Announce readiness to background
    chrome.runtime.sendMessage({ type: 'observer_ready', url: window.location.href }).catch(() => {});
  },
});
