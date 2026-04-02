import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test 1: Side panel HTML is valid
describe('Side Panel HTML', () => {
  const htmlPath = resolve(__dirname, '../../packages/extension/src/entrypoints/sidepanel/index.html');

  it('exists and contains required elements', () => {
    expect(existsSync(htmlPath)).toBe(true);
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('id="messages"');
    expect(html).toContain('id="chat-input"');
    expect(html).toContain('id="send-btn"');
    expect(html).toContain('main.ts');
  });
});

// Test 2: Message formatting
describe('Message rendering', () => {
  function renderMessage(msg: { role: 'user' | 'assistant' | 'error'; content: string }): string {
    const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const cls = msg.role === 'user' ? 'user-message' : msg.role === 'error' ? 'message error-message' : 'assistant-message';
    return `<div class="message ${cls}">${escapeHtml(msg.content)}</div>`;
  }

  it('renders user messages correctly', () => {
    const html = renderMessage({ role: 'user', content: 'Hello' });
    expect(html).toContain('user-message');
    expect(html).toContain('Hello');
  });

  it('renders assistant messages correctly', () => {
    const html = renderMessage({ role: 'assistant', content: 'Hi there' });
    expect(html).toContain('assistant-message');
    expect(html).toContain('Hi there');
  });

  it('escapes HTML in messages', () => {
    const html = renderMessage({ role: 'user', content: '<script>alert("xss")</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// Test 3: WXT config has sidePanel
describe('WXT Config', () => {
  it('manifest includes sidePanel permission and config', () => {
    const configPath = resolve(__dirname, '../../packages/extension/wxt.config.ts');
    const config = readFileSync(configPath, 'utf-8');
    expect(config).toContain('sidePanel');
    expect(config).toContain('side_panel');
  });
});
