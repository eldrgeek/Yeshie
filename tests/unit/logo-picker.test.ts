/** @jest-environment jsdom */
import { startLogoPicker } from '../../packages/extension/src/entrypoints/sidepanel/logo-picker.js';
import { getLogoChoice, saveLogoChoice } from '../../packages/extension/src/overlay/logo.js';

describe('Choose your Yeshie picker', () => {
  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="header"><button id="logo-btn" aria-expanded="false"></button><span id="header-title">Yeshie</span></div>
      <div id="logo-picker"><div class="logo-choices"></div><input id="logo-file" type="file" hidden><div id="logo-error"></div><button id="logo-done">Done</button></div>`;
    await saveLogoChoice({ choice: 'robot' });
    startLogoPicker(document);
  });

  it('shows the robot in the header and opens on click', () => {
    const btn = document.getElementById('logo-btn')!;
    expect(btn.querySelector('[data-logo]')?.getAttribute('data-logo')).toBe('robot');
    btn.click();
    expect(document.getElementById('logo-picker')!.classList.contains('open')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    document.getElementById('logo-done')!.click();
    expect(document.getElementById('logo-picker')!.classList.contains('open')).toBe(false);
  });

  it('lists the three logos plus an upload tile, robot selected', () => {
    const tiles = [...document.querySelectorAll('.logo-choice')].map((t) => (t as HTMLElement).dataset.logo);
    expect(tiles).toEqual(['robot', 'cursor', 'yeti', 'upload']);
    expect(document.querySelector('[data-logo="robot"][aria-pressed]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('picking a tile saves the choice', () => {
    (document.querySelector('.logo-choice[data-logo="yeti"]') as HTMLElement).click();
    expect(getLogoChoice()).toEqual({ choice: 'yeti' });
  });
});
