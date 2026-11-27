// "Choose your Yeshie": the header logo opens a picker with the built-in
// logos and an upload. The choice lives in chrome.storage.local, so the
// toolbar icon (toolbar-logo.ts) and the pop-ups (overlay/logo.ts) follow it.
// Nothing leaves this computer.
import { LOGOS, createYeshieLogo, getLogoChoice, loadLogoChoice, mountYeshieLogo, onLogoChoiceChange, saveLogoChoice, type LogoChoice, type LogoId } from '../../overlay/logo';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Draw any image the browser can read onto a 128 px square PNG (centre crop). */
export async function toLogoPng(file: Blob, doc: Document = document): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = doc.createElement('img');
    await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('That file is not a picture Chrome can read.')); img.src = url; });
    const w = img.naturalWidth || 128, h = img.naturalHeight || 128;
    const side = Math.min(w, h);
    const canvas = doc.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    canvas.getContext('2d')!.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 128, 128);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function startLogoPicker(doc: Document = document): void {
  const btn = doc.getElementById('logo-btn');
  const panel = doc.getElementById('logo-picker');
  const choicesEl = panel?.querySelector('.logo-choices');
  const fileEl = doc.getElementById('logo-file') as HTMLInputElement | null;
  const errorEl = doc.getElementById('logo-error');
  const doneEl = doc.getElementById('logo-done');
  if (!btn || !panel || !choicesEl || !fileEl || !errorEl || !doneEl) return;

  mountYeshieLogo(btn, 28, doc);

  const showError = (msg: string) => { errorEl.textContent = msg; errorEl.classList.toggle('visible', !!msg); };

  const render = (current: LogoChoice) => {
    const tiles: HTMLElement[] = [];
    for (const id of Object.keys(LOGOS) as LogoId[]) {
      const tile = doc.createElement('button');
      tile.type = 'button';
      tile.className = 'logo-choice';
      tile.dataset.logo = id;
      tile.setAttribute('aria-pressed', String(current.choice === id));
      tile.append(createYeshieLogo(44, doc, { choice: id }), doc.createTextNode(LOGOS[id].label));
      tile.addEventListener('click', () => { showError(''); void saveLogoChoice({ choice: id }); });
      tiles.push(tile);
    }
    if (current.choice === 'custom') {
      const mine = doc.createElement('button');
      mine.type = 'button';
      mine.className = 'logo-choice';
      mine.dataset.logo = 'custom';
      mine.setAttribute('aria-pressed', 'true');
      mine.append(createYeshieLogo(44, doc, current), doc.createTextNode('Yours'));
      tiles.push(mine);
    }
    const upload = doc.createElement('button');
    upload.type = 'button';
    upload.className = 'logo-choice';
    upload.dataset.logo = 'upload';
    const plus = doc.createElement('span');
    plus.className = 'logo-upload-tile';
    plus.textContent = '+';
    upload.append(plus, doc.createTextNode(current.choice === 'custom' ? 'Replace' : 'Upload yours'));
    upload.addEventListener('click', () => fileEl.click());
    tiles.push(upload);
    choicesEl.replaceChildren(...tiles);
  };

  fileEl.addEventListener('change', async () => {
    const file = fileEl.files?.[0];
    fileEl.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { showError('That picture is over 2 MB. Try a smaller one.'); return; }
    try {
      showError('');
      await saveLogoChoice({ choice: 'custom', custom: await toLogoPng(file, doc) });
    } catch (err: any) {
      showError(err?.message || 'Could not use that picture.');
    }
  });

  const setOpen = (open: boolean) => {
    panel.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  doneEl.addEventListener('click', () => setOpen(false));

  render(getLogoChoice());
  onLogoChoiceChange(render);
  void loadLogoChoice();
}
