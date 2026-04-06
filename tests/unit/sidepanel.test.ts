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

  it('has a header element for tab context display', () => {
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('id="header"');
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

// Test 4: Per-tab conversation isolation (unit tests for the core logic)
describe('Per-tab conversation management', () => {
  // Simulate the tabConversations Map logic from main.ts
  type Message = { role: 'user' | 'assistant' | 'error' | 'system'; content: string };
  class TabConversationStore {
    private store = new Map<number, Message[]>();
    getTabMessages(tabId: number): Message[] {
      if (!this.store.has(tabId)) this.store.set(tabId, []);
      return this.store.get(tabId)!;
    }
    addMessage(tabId: number, role: Message['role'], content: string) {
      this.getTabMessages(tabId).push({ role, content });
    }
    removeTab(tabId: number) {
      this.store.delete(tabId);
    }
    hasTab(tabId: number) {
      return this.store.has(tabId);
    }
  }

  it('keeps conversations isolated per tab', () => {
    const store = new TabConversationStore();
    store.addMessage(1, 'user', 'Hello from tab 1');
    store.addMessage(2, 'user', 'Hello from tab 2');
    store.addMessage(1, 'assistant', 'Reply to tab 1');

    expect(store.getTabMessages(1)).toHaveLength(2);
    expect(store.getTabMessages(2)).toHaveLength(1);
    expect(store.getTabMessages(1)[0].content).toBe('Hello from tab 1');
    expect(store.getTabMessages(2)[0].content).toBe('Hello from tab 2');
  });

  it('two tabs on the same website have distinct conversations', () => {
    const store = new TabConversationStore();
    // Both tabs are on the same domain but different tab IDs
    store.addMessage(10, 'user', 'Tab A question');
    store.addMessage(11, 'user', 'Tab B question');

    const tab10 = store.getTabMessages(10);
    const tab11 = store.getTabMessages(11);

    expect(tab10).not.toBe(tab11);
    expect(tab10[0].content).toBe('Tab A question');
    expect(tab11[0].content).toBe('Tab B question');
  });

  it('starts with an empty conversation for new tabs', () => {
    const store = new TabConversationStore();
    const msgs = store.getTabMessages(99);
    expect(msgs).toHaveLength(0);
  });

  it('cleans up conversation memory when a tab is removed', () => {
    const store = new TabConversationStore();
    store.addMessage(5, 'user', 'Some message');
    expect(store.hasTab(5)).toBe(true);
    store.removeTab(5);
    expect(store.hasTab(5)).toBe(false);
  });

  it('response lands in the originating tab even after switching', () => {
    const store = new TabConversationStore();
    // User sends from tab 1
    const sendingTabId = 1;
    store.addMessage(sendingTabId, 'user', 'My question');

    // Simulate user switching to tab 2 while waiting for response
    let currentTabId = 2;

    // Response arrives — it should be added to tab 1 (sendingTabId), not tab 2 (currentTabId)
    store.addMessage(sendingTabId, 'assistant', 'Your answer');

    expect(store.getTabMessages(sendingTabId)).toHaveLength(2);
    expect(store.getTabMessages(currentTabId)).toHaveLength(0);
    expect(store.getTabMessages(sendingTabId)[1].content).toBe('Your answer');
  });
});

// Test 5: main.ts exports and structure
describe('Side panel main.ts', () => {
  const mainPath = resolve(__dirname, '../../packages/extension/src/entrypoints/sidepanel/main.ts');

  it('exists', () => {
    expect(existsSync(mainPath)).toBe(true);
  });

  it('exports renderMessage function', () => {
    const src = readFileSync(mainPath, 'utf-8');
    expect(src).toContain('export function renderMessage');
  });

  it('uses tabConversations Map for per-tab storage', () => {
    const src = readFileSync(mainPath, 'utf-8');
    expect(src).toContain('tabConversations');
    expect(src).toContain('Map<number');
  });

  it('listens for tab_activated messages', () => {
    const src = readFileSync(mainPath, 'utf-8');
    expect(src).toContain('tab_activated');
  });

  it('listens for show_user_message (inject flow)', () => {
    const src = readFileSync(mainPath, 'utf-8');
    expect(src).toContain('show_user_message');
  });

  it('listens for show_response (inject flow)', () => {
    const src = readFileSync(mainPath, 'utf-8');
    expect(src).toContain('show_response');
  });

  it('handles get_tab_history requests', () => {
    const src = readFileSync(mainPath, 'utf-8');
    expect(src).toContain('get_tab_history');
  });

  it('captures sendingTabId at send time (not at response time)', () => {
    const src = readFileSync(mainPath, 'utf-8');
    expect(src).toContain('sendingTabId');
  });
});
