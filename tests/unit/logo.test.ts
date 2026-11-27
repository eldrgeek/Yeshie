/** @jest-environment jsdom */
import { createYeshieLogo, normalizeChoice, LOGOS, DEFAULT_LOGO } from '../../packages/extension/src/overlay/logo.js';
import { iconPaths } from '../../packages/extension/src/toolbar-logo.js';
import { existsSync } from 'fs';
import { join } from 'path';

const EXT = join(process.cwd(), 'packages/extension');

describe('Yeshie logo', () => {
  it('defaults to the robot (Mike, 2026-11-27)', () => {
    expect(DEFAULT_LOGO).toBe('robot');
    expect(normalizeChoice(undefined)).toEqual({ choice: 'robot' });
    expect(createYeshieLogo(20, document).getAttribute('data-logo')).toBe('robot');
  });

  it('offers robot, cursor buddy and yeti', () => {
    expect(Object.keys(LOGOS).sort()).toEqual(['cursor', 'robot', 'yeti']);
    for (const id of Object.keys(LOGOS)) {
      const svg = createYeshieLogo(22, document, { choice: id as any });
      expect(svg.tagName.toLowerCase()).toBe('svg');
      expect(svg.getAttribute('width')).toBe('22');
      expect(svg.childNodes.length).toBeGreaterThan(5);
    }
  });

  it('accepts only image data URLs as a custom logo', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(normalizeChoice({ choice: 'custom', custom: png })).toEqual({ choice: 'custom', custom: png });
    expect(normalizeChoice({ choice: 'custom', custom: 'https://evil.example/x.png' })).toEqual({ choice: 'robot' });
    expect(normalizeChoice({ choice: 'custom', custom: 'data:image/svg+xml;base64,PHN2Zz4=' })).toEqual({ choice: 'robot' });
    expect(normalizeChoice({ choice: 'nonsense' })).toEqual({ choice: 'robot' });
  });

  it('falls back to the robot when a page refuses the custom image', () => {
    const host = document.createElement('div');
    const img = createYeshieLogo(20, document, { choice: 'custom', custom: 'data:image/png;base64,iVBORw0KGgo=' });
    host.appendChild(img);
    expect(img.getAttribute('data-logo')).toBe('custom');
    img.dispatchEvent(new Event('error'));
    expect(host.firstElementChild?.getAttribute('data-logo')).toBe('robot');
  });

  it('ships toolbar PNGs for every built-in logo', () => {
    for (const id of Object.keys(LOGOS)) {
      for (const path of Object.values(iconPaths(id))) {
        expect(existsSync(join(EXT, 'public', path))).toBe(true);
      }
    }
    expect(iconPaths('robot')['16']).toBe('icon/16.png');
    expect(iconPaths('yeti')['16']).toBe('icon/yeti/16.png');
  });
});
