// Keeps the toolbar icon in step with the logo the person chose in the side
// panel. Built-in logos ship as PNGs (public/icon/, public/icon/<id>/); a
// custom logo is a PNG data URL drawn onto an OffscreenCanvas.
import { LOGO_STORAGE_KEY, normalizeChoice, DEFAULT_LOGO, type LogoChoice } from './overlay/logo';

const SIZES = [16, 32, 48, 128] as const;
// Typed loosely so unit tests can import iconPaths without Chrome's types.
const ext = (): any => (globalThis as any).chrome;

export function iconPaths(id: string): Record<string, string> {
  const dir = id === DEFAULT_LOGO ? 'icon' : `icon/${id}`;
  return Object.fromEntries(SIZES.map((s) => [String(s), `${dir}/${s}.png`]));
}

async function customImageData(dataUrl: string): Promise<Record<string, ImageData>> {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const out: Record<string, ImageData> = {};
  for (const s of [16, 32]) {
    const canvas = new OffscreenCanvas(s, s);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, s, s);
    out[String(s)] = ctx.getImageData(0, 0, s, s);
  }
  return out;
}

export async function applyToolbarLogo(choice: LogoChoice): Promise<void> {
  try {
    if (choice.choice === 'custom' && choice.custom) {
      await ext().action.setIcon({ imageData: await customImageData(choice.custom) as any });
    } else {
      await ext().action.setIcon({ path: iconPaths(choice.choice) });
    }
  } catch (err) {
    console.warn('[Yeshie] toolbar logo:', err);
    await ext().action.setIcon({ path: iconPaths(DEFAULT_LOGO) }).catch(() => {});
  }
}

export function startToolbarLogo(): void {
  ext().storage.local.get(LOGO_STORAGE_KEY).then((r: any) => applyToolbarLogo(normalizeChoice(r?.[LOGO_STORAGE_KEY]))).catch(() => {});
  ext().storage.onChanged.addListener((changes: any, area: string) => {
    if (area === 'local' && changes[LOGO_STORAGE_KEY]) applyToolbarLogo(normalizeChoice(changes[LOGO_STORAGE_KEY].newValue));
  });
}
