// Yeshie's logos. The robot is the default; the cursor buddy and the yeti are
// choices, and people can upload their own (Mike, 2026-11-27: start with the
// robot, keep all three, let people customize, make the most popular the
// default). Sources: store/icon.svg (robot) and store/logos/*.svg; keep them
// in step with SHAPES below. Built with createElementNS, never innerHTML, so
// pages with strict CSP or Trusted Types still show it.
const SVG_NS = 'http://www.w3.org/2000/svg';

export type LogoId = 'robot' | 'cursor' | 'yeti';
export type LogoChoice = { choice: LogoId | 'custom'; custom?: string };
export const LOGO_STORAGE_KEY = 'yeshieLogo';
export const DEFAULT_LOGO: LogoId = 'robot';

type Shape = [tag: string, attrs: Record<string, string | number>];
const BG: Shape = ['rect', { x: 4, y: 4, width: 120, height: 120, rx: 28, fill: '#2f5d50' }];

export const LOGOS: Record<LogoId, { label: string; shapes: Shape[] }> = {
  robot: {
    label: 'Robot',
    shapes: [
      BG,
      ['line', { x1: 64, y1: 40, x2: 64, y2: 24, stroke: '#f4efe3', 'stroke-width': 6, 'stroke-linecap': 'round' }],
      ['circle', { cx: 64, cy: 20, r: 9, fill: '#e8a33d' }],
      ['rect', { x: 17, y: 58, width: 12, height: 24, rx: 6, fill: '#e8a33d' }],
      ['rect', { x: 99, y: 58, width: 12, height: 24, rx: 6, fill: '#e8a33d' }],
      ['rect', { x: 25, y: 38, width: 78, height: 66, rx: 22, fill: '#f4efe3' }],
      ['rect', { x: 35, y: 50, width: 58, height: 36, rx: 16, fill: '#1d3b33' }],
      ['circle', { cx: 51, cy: 66, r: 8, fill: '#7fe0c4' }],
      ['circle', { cx: 77, cy: 66, r: 8, fill: '#7fe0c4' }],
      ['circle', { cx: 54, cy: 63, r: 2.6, fill: '#fff' }],
      ['circle', { cx: 80, cy: 63, r: 2.6, fill: '#fff' }],
      ['path', { d: 'M55 78 Q64 84 73 78', fill: 'none', stroke: '#7fe0c4', 'stroke-width': 4, 'stroke-linecap': 'round' }],
      ['circle', { cx: 38, cy: 94, r: 4, fill: '#e8a33d', opacity: 0.9 }],
      ['circle', { cx: 90, cy: 94, r: 4, fill: '#e8a33d', opacity: 0.9 }],
    ],
  },
  cursor: {
    label: 'Cursor buddy',
    shapes: [
      BG,
      ['path', { d: 'M30 22 A14 14 0 0 0 22 36', fill: 'none', stroke: '#e8a33d', 'stroke-width': 6, 'stroke-linecap': 'round' }],
      ['path', { d: 'M34 12 A26 26 0 0 0 12 36', fill: 'none', stroke: '#e8a33d', 'stroke-width': 5, 'stroke-linecap': 'round', opacity: 0.55 }],
      ['path', { d: 'M38 30 L38 104 L56 88 L69 114 L84 107 L71 82 L96 80 Z', fill: '#f4efe3', stroke: '#f4efe3', 'stroke-width': 6, 'stroke-linejoin': 'round' }],
      ['circle', { cx: 50, cy: 64, r: 6, fill: '#1d3b33' }],
      ['circle', { cx: 65, cy: 64, r: 6, fill: '#1d3b33' }],
      ['circle', { cx: 52, cy: 62, r: 2, fill: '#fff' }],
      ['circle', { cx: 67, cy: 62, r: 2, fill: '#fff' }],
      ['path', { d: 'M49 75 Q57.5 82 66 75', fill: 'none', stroke: '#1d3b33', 'stroke-width': 4, 'stroke-linecap': 'round' }],
      ['circle', { cx: 45, cy: 73, r: 3.5, fill: '#e8a33d', opacity: 0.7 }],
      ['circle', { cx: 71, cy: 73, r: 3.5, fill: '#e8a33d', opacity: 0.7 }],
    ],
  },
  yeti: {
    label: 'Yeti',
    shapes: [
      BG,
      ...([[64, 70, 40], [44, 34, 12], [64, 28, 13], [84, 34, 12], [30, 50, 11], [98, 50, 11], [26, 72, 10], [102, 72, 10], [34, 94, 10], [94, 94, 10], [52, 106, 10], [76, 106, 10]]
        .map(([cx, cy, r]) => ['circle', { cx, cy, r, fill: '#f4efe3' }] as Shape)),
      ['path', { d: 'M38 64 Q38 44 64 44 Q90 44 90 64 L90 78 Q90 98 64 98 Q38 98 38 78 Z', fill: '#8ec5d6' }],
      ['circle', { cx: 53, cy: 65, r: 6.5, fill: '#1d3b33' }],
      ['circle', { cx: 75, cy: 65, r: 6.5, fill: '#1d3b33' }],
      ['circle', { cx: 55, cy: 63, r: 2.2, fill: '#fff' }],
      ['circle', { cx: 77, cy: 63, r: 2.2, fill: '#fff' }],
      ['path', { d: 'M52 81 Q64 91 76 81 Z', fill: '#1d3b33' }],
      ['path', { d: 'M58 82.5 L60 87 L62 83.5 Z', fill: '#fff' }],
      ['path', { d: 'M66 83.5 L68 87 L70 82.5 Z', fill: '#fff' }],
    ],
  },
};

export function isLogoId(v: unknown): v is LogoId {
  return v === 'robot' || v === 'cursor' || v === 'yeti';
}

/** Only an image data URL counts as a custom logo; anything else falls back to the default. */
export function normalizeChoice(raw: unknown): LogoChoice {
  const r = raw as Partial<LogoChoice> | null | undefined;
  if (r?.choice === 'custom' && typeof r.custom === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(r.custom)) {
    return { choice: 'custom', custom: r.custom };
  }
  return { choice: isLogoId(r?.choice) ? r!.choice as LogoId : DEFAULT_LOGO };
}

function buildSvg(id: LogoId, size: number, doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'yeshie-logo-svg');
  svg.setAttribute('data-logo', id);
  for (const [tag, attrs] of LOGOS[id].shapes) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.appendChild(el);
  }
  return svg;
}

/** The logo for a choice. A custom image that a page's CSP refuses falls back to the default. */
export function createYeshieLogo(size = 20, doc: Document = document, choice: LogoChoice = currentChoice): Element {
  if (choice.choice === 'custom' && choice.custom) {
    const img = doc.createElement('img');
    img.width = size; img.height = size;
    img.alt = '';
    img.className = 'yeshie-logo-img';
    img.setAttribute('data-logo', 'custom');
    img.style.borderRadius = Math.round(size * 0.22) + 'px';
    img.style.objectFit = 'cover';
    img.addEventListener('error', () => img.replaceWith(buildSvg(DEFAULT_LOGO, size, doc)), { once: true });
    img.src = choice.custom;
    return img;
  }
  return buildSvg(isLogoId(choice.choice) ? choice.choice : DEFAULT_LOGO, size, doc);
}

// The person's choice, cached so a pop-up can draw its logo without waiting.
let currentChoice: LogoChoice = { choice: DEFAULT_LOGO };
const listeners = new Set<(c: LogoChoice) => void>();

function storage(): any {
  try { return (globalThis as any).chrome?.storage?.local ?? null; } catch { return null; }
}

export async function loadLogoChoice(): Promise<LogoChoice> {
  const s = storage();
  if (!s) return currentChoice;
  try {
    const next = normalizeChoice((await s.get(LOGO_STORAGE_KEY))?.[LOGO_STORAGE_KEY]);
    const changed = JSON.stringify(next) !== JSON.stringify(currentChoice);
    currentChoice = next;
    if (changed) for (const fn of listeners) fn(currentChoice);
  } catch { /* extension context gone: keep the cached choice */ }
  return currentChoice;
}

export async function saveLogoChoice(choice: LogoChoice): Promise<void> {
  currentChoice = normalizeChoice(choice);
  await storage()?.set({ [LOGO_STORAGE_KEY]: currentChoice });
}

export function getLogoChoice(): LogoChoice { return currentChoice; }

export function onLogoChoiceChange(fn: (c: LogoChoice) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

try {
  (globalThis as any).chrome?.storage?.onChanged?.addListener((changes: any, area: string) => {
    if (area !== 'local' || !changes?.[LOGO_STORAGE_KEY]) return;
    currentChoice = normalizeChoice(changes[LOGO_STORAGE_KEY].newValue);
    for (const fn of listeners) fn(currentChoice);
  });
} catch { /* not in an extension context (tests) */ }
void loadLogoChoice();

/** A logo slot that follows the person's choice as it changes. */
export function mountYeshieLogo(slot: Element, size: number, doc: Document = slot.ownerDocument || document): void {
  const draw = (c: LogoChoice) => slot.replaceChildren(createYeshieLogo(size, doc, c));
  draw(currentChoice);
  onLogoChoiceChange((c) => { if (slot.isConnected) draw(c); });
}
