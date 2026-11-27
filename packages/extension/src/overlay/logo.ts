// Yeshie's logo, the "cursor buddy": a pointer with a face, because Yeshie
// points at the next control. Source of truth is store/icon.svg; keep the two
// in step. Built with createElementNS (not innerHTML) so pages with strict
// CSP or Trusted Types still show it.
const SVG_NS = 'http://www.w3.org/2000/svg';

type Shape = [tag: string, attrs: Record<string, string | number>];

const SHAPES: Shape[] = [
  ['rect', { x: 4, y: 4, width: 120, height: 120, rx: 28, fill: '#2f5d50' }],
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
];

export function createYeshieLogo(size = 20, doc: Document = document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'yeshie-logo-svg');
  for (const [tag, attrs] of SHAPES) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.appendChild(el);
  }
  return svg;
}
