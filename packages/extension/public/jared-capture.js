// Vendored from eldrgeek/soma-jared boot/capture.js. Update with: cp ../../../soma-jared/boot/capture.js public/jared-capture.js (then re-add this line).
// Jared capture: turn the page you are looking at into Jared shapes.
//
// Runs inside any page (a bookmarklet, the Guide extension, or Playwright's page.evaluate). It walks
// what is on screen and copies each part that a person can see or use: panels (anything with a fill
// or a border), words, buttons, links, inputs, checkboxes, menus and pictures. Each becomes a `shape`
// node pinned at the same place, so the mock looks like the page and can be rewired as data.
// Mike, 2026-11-24: "I point at it and Jared abstracts the page."
//
//   window.jaredCapture({ max: 600, skip: '.some-overlay' })
//     -> { url, title, w, h, bg, color, font, nodes: [shape nodes], keys: [diff key per node] }
//   window.__jaredEls holds the element behind each node, so a driver can click node i.
//
// The whole page, not only what is on screen (full: true, the default): positions are page positions.
// Puppet (Mike, 2026-11-28: "as I act on the Jared version, you do the same thing in the live version"):
// once loaded, the page answers Jared. Jared sends { type: 'jared-act', key, prefix }; the page clicks
// the element behind that part, waits for the page to settle, copies it again and sends back
// { type: 'jared-state', ok, capture }. Only Jared's own site (where this script came from) can drive it.
(function () {
  const HOME = (() => { try { return new URL(document.currentScript.src).origin; } catch { return null; } })();
  function capture(opts = {}) {
    const max = opts.max || 2500;
    const full = opts.full !== false;
    const nodes = [], keys = [], els = [], ids = new Set();
    const de = document.documentElement;
    const W = full ? Math.max(innerWidth, de.scrollWidth) : innerWidth;
    const H = full ? Math.max(innerHeight, de.scrollHeight, document.body.scrollHeight) : innerHeight;
    const ox = full ? scrollX : 0, oy = full ? scrollY : 0;
    const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'part';
    const uid = (base) => { let id = `${opts.prefix || ''}${slug(base)}`, n = 2; const b = id; while (ids.has(id)) id = `${b}-${n++}`; ids.add(id); return id; };
    const solid = (c) => (!c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c)) ? null : c;
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const INLINE = new Set(['SPAN', 'B', 'STRONG', 'I', 'EM', 'CODE', 'SMALL', 'MARK', 'ABBR', 'SUP', 'SUB', 'BR', 'KBD', 'TIME']);

    function roleOf(el) {
      const t = el.tagName, r = el.getAttribute('role');
      if (t === 'BUTTON' || t === 'SUMMARY' || ['button', 'tab', 'menuitem', 'menuitemradio', 'option', 'treeitem', 'link'].includes(r) && t !== 'A') return 'button';
      if (r === 'switch' || r === 'checkbox' || r === 'radio' || r === 'menuitemcheckbox') return 'check';
      if (r === 'combobox' || r === 'listbox') return 'select';
      if (r === 'textbox' || r === 'searchbox' || el.isContentEditable && (el.parentElement && !el.parentElement.isContentEditable)) return 'input';
      if (t === 'A' && el.hasAttribute('href')) return 'link';
      if (t === 'SELECT') return 'select';
      if (t === 'TEXTAREA') return 'input';
      if (t === 'INPUT') {
        const ty = (el.type || 'text').toLowerCase();
        if (ty === 'hidden') return 'skip';
        if (ty === 'checkbox' || ty === 'radio') return 'check';
        if (ty === 'button' || ty === 'submit' || ty === 'reset') return 'button';
        return 'input';
      }
      if (t === 'IMG' || t === 'CANVAS' || t === 'VIDEO') return 'image';
      if (t === 'svg' || t === 'SVG') return 'icon';
      // A custom control: something that shows a hand and has no clickable parent copied already.
      if (el.onclick || (getComputedStyle(el).cursor === 'pointer' && !(el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer') && el.getBoundingClientRect().width < 600)) return 'button';
      return null;
    }

    function box(r) { return { x: Math.round(r.left + ox), y: Math.round(r.top + oy), w: Math.round(r.width), h: Math.round(r.height) }; }
    function onScreen(r) { return r.width >= 2 && r.height >= 2 && r.bottom + oy > 0 && r.right + ox > 0 && r.top + oy < H && r.left + ox < W; }
    function look(cs) {
      const p = {};
      const bg = solid(cs.backgroundColor);
      const grad = cs.backgroundImage && cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage) ? cs.backgroundImage : null;
      if (grad) p.bg = grad; else if (bg) p.bg = bg;
      const bw = parseFloat(cs.borderTopWidth) || parseFloat(cs.borderBottomWidth) || 0;
      if (bw >= 1) { const bc = solid(cs.borderTopColor) || solid(cs.borderBottomColor); if (bc) p.border = bc; }
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      if (radius) p.radius = Math.round(radius);
      if (cs.boxShadow && cs.boxShadow !== 'none') p.shadow = true;
      if (cs.transitionDuration && cs.transitionDuration.split(',').some(d => parseFloat(d) > 0)) p.transition = `${cs.transitionProperty} ${cs.transitionDuration}`;
      return p;
    }
    const pageFont = getComputedStyle(document.body).fontFamily;
    function font(cs, p) {
      p.color = cs.color;
      if (cs.fontFamily !== pageFont) p.font = cs.fontFamily;
      p.size = Math.round(parseFloat(cs.fontSize));
      const wt = parseInt(cs.fontWeight, 10);
      if (wt && wt !== 400) p.weight = wt;
      if (cs.textAlign === 'center' || cs.textAlign === 'right') p.align = cs.textAlign;
      return p;
    }
    function emit(el, role, r, props, label) {
      if (nodes.length >= max) return;
      const b = box(r);
      const node = { id: uid(label || `${role}`), type: 'shape', props: { role, ...b, ...props } };
      nodes.push(node);
      els.push(el);
      keys.push(keyOf(node.props));
    }

    function walk(el) {
      if (nodes.length >= max || el.nodeType !== 1) return;
      if (opts.skip && el.matches && el.matches(opts.skip)) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return;
      if (['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META'].includes(el.tagName)) return;
      const r = el.getBoundingClientRect();
      const role = roleOf(el);
      if (role === 'skip') return;
      const shown = onScreen(r);
      if (role && shown) {
        const p = font(cs, look(cs));
        if (role === 'button' || role === 'link') p.text = clean(el.innerText || el.value || el.getAttribute('aria-label') || el.title);
        if (role === 'input') { p.text = clean(el.isContentEditable ? el.innerText : el.value); p.placeholder = clean(el.placeholder || el.getAttribute('aria-placeholder') || el.dataset.placeholder); }
        if (role === 'select') { p.text = clean(el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent : el.value); p.options = [...el.options].map(o => clean(o.textContent)); }
        if (role === 'link') p.href = el.href;
        if (role === 'check') p.checked = Boolean(el.checked);
        if (role === 'image' && el.tagName === 'IMG') { p.src = el.currentSrc || el.src; p.text = clean(el.alt); }
        if (role === 'icon') p.text = '';
        if (el.getAttribute('aria-label') || el.title) p.title = clean(el.getAttribute('aria-label') || el.title);
        emit(el, role, r, p, el.getAttribute('aria-label') || (/[a-z0-9]/i.test(p.text || '') ? p.text : '') || el.title || el.id || (role === 'button' ? 'button' : role));
        return; // a control is copied whole
      }
      if (role === 'image' || role === 'icon') return;
      if (shown && el !== document.body && el !== document.documentElement && r.width >= 20 && r.height >= 12) {
        const p = look(cs);
        if (p.bg || p.border || p.shadow) {
          // A panel as big as the screen is the page background, not a part.
          if (!(r.width >= W - 2 && r.height >= H - 2)) emit(el, 'panel', r, p, el.id || el.className && String(el.className).split(' ')[0] || 'panel');
        }
      }
      const kids = [...el.childNodes];
      const ownText = clean(kids.filter(n => n.nodeType === 3).map(n => n.textContent).join(' '));
      const inlineOnly = kids.every(n => n.nodeType !== 1 || (INLINE.has(n.tagName) && !n.querySelector('button,a,input,select,textarea,img,svg')));
      if (shown && inlineOnly && clean(el.innerText)) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const tr = range.getBoundingClientRect();
        emit(el, 'text', tr.width ? tr : r, font(cs, { text: clean(el.innerText) }), clean(el.innerText).split(' ').slice(0, 3).join(' '));
        return;
      }
      if (shown && ownText) {
        const range = document.createRange();
        const texts = kids.filter(n => n.nodeType === 3 && clean(n.textContent));
        range.setStartBefore(texts[0]);
        range.setEndAfter(texts[texts.length - 1]);
        emit(el, 'text', range.getBoundingClientRect(), font(cs, { text: ownText }), ownText.split(' ').slice(0, 3).join(' '));
      }
      for (const child of el.children) walk(child);
      if (el.shadowRoot) for (const child of el.shadowRoot.children) walk(child);
    }

    walk(document.body);
    const bodyCs = getComputedStyle(document.body), htmlCs = getComputedStyle(document.documentElement);
    const pageBg = [bodyCs, htmlCs].map(cs => (cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage) ? cs.backgroundImage : null) || solid(cs.backgroundColor)).find(Boolean) || '#fff';
    window.__jaredEls = els;
    window.__jaredKeys = keys;
    return { url: location.href, title: document.title, w: W, h: H, bg: pageBg, color: bodyCs.color, font: bodyCs.fontFamily, nodes, keys };
  }
  // The diff key of a part: same formula as keyOf in capture-doc.js, so Jared can name a part to click.
  function keyOf(p) {
    const t = String(p.text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return `${p.role}|${t}|${Math.round(p.x / 8)}|${Math.round(p.y / 8)}|${Math.round(p.w / 8)}|${Math.round(p.h / 8)}`;
  }
  window.jaredCapture = capture;

  // Wait until the page stops changing: 400 ms with no DOM change, or 3 s at most.
  function settle() {
    return new Promise((done) => {
      let quiet; const stop = setTimeout(finish, 3000);
      const mo = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(finish, 400); });
      mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      quiet = setTimeout(finish, 400);
      function finish() { clearTimeout(quiet); clearTimeout(stop); mo.disconnect(); done(); }
    });
  }
  function find(key) {
    const i = (window.__jaredKeys || []).indexOf(key);
    if (i >= 0 && window.__jaredEls[i] && window.__jaredEls[i].isConnected) return window.__jaredEls[i];
    capture({});
    const j = window.__jaredKeys.indexOf(key);
    return j >= 0 ? window.__jaredEls[j] : null;
  }
  function press(el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    const o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, view: window };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    if (el.focus) el.focus({ preventScroll: true });
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerId: 1, isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.click();
  }
  // Click the part with this key, wait for the page to settle, and copy it again.
  async function act(key, prefix = '') {
    const el = find(key);
    if (!el) return { ok: false, why: 'That part is not on the real page now.' };
    const before = location.href;
    press(el);
    await settle();
    scrollTo(0, 0);
    return { ok: true, moved: location.href !== before, capture: capture({ prefix }) };
  }
  window.jaredAct = act;

  // Puppet play (Mike, 2026-11-28: "two play modes ... the other when it acts as puppeteer running the
  // app in another window"). A designed part has no copied key, so the real control is found by its
  // words: the button, link or tappable whose text or label best matches, with emoji and case ignored.
  const words = (t) => String(t || '').normalize('NFKD').replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  function findByText(text) {
    const want = words(text);
    if (!want) return null;
    const seen = new Set(), hits = [];
    const sel = 'button, a[href], [role=button], [role=link], [role=tab], [role=menuitem], [role=option], [role=switch], [role=checkbox], input[type=button], input[type=submit], [onclick], [tabindex]';
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden'; };
    const consider = (el) => {
      if (seen.has(el) || !visible(el)) return; seen.add(el);
      const label = words(el.getAttribute('aria-label') || el.value || el.innerText || el.textContent);
      if (!label) return;
      const score = label === want ? 3 : label.startsWith(want) || want.startsWith(label) ? 2 : label.includes(want) ? 1 : 0;
      if (score) hits.push({ el, score, len: label.length });
    };
    document.querySelectorAll(sel).forEach(consider);
    if (!hits.length) for (const el of document.querySelectorAll('body *')) if (getComputedStyle(el).cursor === 'pointer') consider(el);
    hits.sort((a, b) => b.score - a.score || a.len - b.len);
    return hits[0] || null;
  }
  async function actText(text) {
    const el = findByText(text)?.el;
    if (!el) return { ok: false, found: false, why: `No "${text}" on the real page now.` };
    const before = location.href;
    press(el);
    await settle();
    return { ok: true, found: true, moved: location.href !== before, url: location.href };
  }
  window.jaredActText = actText;
  // How well this page (or frame) matches, without clicking, so the caller can pick one frame to click.
  window.jaredFindText = (text) => { const h = findByText(text); return h ? { score: h.score, len: h.len } : null; };
  // The bookmarklet route: Jared's window sends messages. An extension (Yeshie) calls jaredAct itself,
  // and its injected copy has no home site, so it listens to no messages.
  if (HOME) window.addEventListener('message', async (e) => {
    const m = e.data;
    if (!m || m.type !== 'jared-act' || !e.source || e.origin !== HOME) return;
    e.source.postMessage({ type: 'jared-state', id: m.id, ...(await act(m.key, m.prefix || '')) }, e.origin);
  });
})();
