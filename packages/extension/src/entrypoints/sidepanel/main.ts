// Simple markdown-to-HTML renderer for chat messages
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/^[•\-\*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)$/, '<p>$1</p>');
}

export function renderMessage(msg: { role: 'user' | 'assistant' | 'error' | 'system'; content: string }, chatId?: string): string {
  const cls = msg.role === 'user' ? 'user-message'
    : msg.role === 'error' ? 'message error-message'
    : msg.role === 'system' ? 'message system-message'
    : 'assistant-message';
  const html = (msg.role === 'assistant' || msg.role === 'system') ? renderMarkdown(msg.content) : escapeHtml(msg.content);
  // Add feedback buttons to assistant messages
  const feedbackHtml = (msg.role === 'assistant' && chatId)
    ? `<div class="feedback-row" data-chat-id="${chatId}">
        <button class="fb-btn fb-up" title="Helpful">&#x1F44D;</button>
        <button class="fb-btn fb-down" title="Not helpful">&#x1F44E;</button>
       </div>`
    : '';
  return `<div class="message ${cls}">${html}${feedbackHtml}</div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Per-tab conversation storage ────────────────────────────────────────────
type Message = { role: 'user' | 'assistant' | 'error' | 'system'; content: string };

const tabConversations = new Map<number, Message[]>();
let currentTabId: number | null = null;

function getTabMessages(tabId: number): Message[] {
  if (!tabConversations.has(tabId)) {
    tabConversations.set(tabId, []);
  }
  return tabConversations.get(tabId)!;
}

function tryGetDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

// ── DOM elements ─────────────────────────────────────────────────────────────
const messagesEl = document.getElementById('messages')!;
const statusEl = document.getElementById('status')!;
const inputEl = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const headerEl = document.getElementById('header')!;

// Track the current chatId for feedback
let lastChatId: string | null = null;

// ── Render all messages for the active tab ──────────────────────────────────
function renderTabMessages(tabId: number) {
  const msgs = getTabMessages(tabId);
  messagesEl.innerHTML = msgs.map(m => renderMessage(m)).join('');
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Switch to a different tab's conversation ────────────────────────────────
function switchToTab(tabId: number, tabUrl?: string) {
  currentTabId = tabId;
  renderTabMessages(tabId);
  const domain = tabUrl ? tryGetDomain(tabUrl) : null;
  headerEl.textContent = domain ? `Yeshie — ${domain}` : 'Yeshie';
}

// ── Add a message to a specific tab's conversation ──────────────────────────
function addMessageToTab(tabId: number, role: Message['role'], content: string, chatId?: string) {
  const msgs = getTabMessages(tabId);
  msgs.push({ role, content });
  // Only render to DOM if this is the currently viewed tab
  if (currentTabId === tabId) {
    messagesEl.innerHTML += renderMessage({ role, content }, chatId);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

// Handle feedback button clicks (event delegation)
messagesEl.addEventListener('click', async (e) => {
  const btn = (e.target as HTMLElement).closest('.fb-btn') as HTMLElement | null;
  if (!btn) return;
  const row = btn.closest('.feedback-row') as HTMLElement | null;
  if (!row) return;
  const chatId = row.dataset.chatId;
  const rating = btn.classList.contains('fb-up') ? 'positive' : 'negative';

  // Visual feedback
  row.querySelectorAll('.fb-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');

  // If negative, prompt for optional comment
  let comment: string | null = null;
  if (rating === 'negative') {
    comment = prompt('What could be better? (optional)');
  }

  // Send feedback to relay
  try {
    await chrome.runtime.sendMessage({
      type: 'chat_feedback',
      chatId,
      rating,
      comment
    });
  } catch { /* ignore */ }
});

function showTyping() {
  const el = document.createElement('div');
  el.className = 'typing-indicator';
  el.id = 'typing';
  el.textContent = 'Yeshie is thinking...';
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideTyping() {
  document.getElementById('typing')?.remove();
}

async function checkStatus() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'chat_status' });
    if (resp?.listenerConnected) {
      statusEl.textContent = 'Connected';
      statusEl.className = 'connected';
    } else {
      statusEl.textContent = 'Yeshie is offline \u2014 start a Claude listener session';
      statusEl.className = 'offline';
    }
  } catch {
    statusEl.textContent = 'Extension not connected';
    statusEl.className = 'offline';
  }
}

// Extract text content from various response shapes
function extractResponseText(resp: any): string | null {
  if (!resp) return null;
  const r = resp.response || resp;
  if (typeof r.text === 'string') return r.text;
  if (typeof r.content === 'string') return r.content;
  if (typeof r.message === 'string') return r.message;
  if (r.response) {
    if (typeof r.response.text === 'string') return r.response.text;
    if (typeof r.response.content === 'string') return r.response.content;
  }
  return null;
}

// Handle the three response types from the listener, targeted at a specific tab
function handleResponseForTab(tabId: number, resp: any, chatId?: string) {
  const r = resp?.response || resp;
  const rtype = r?.type;

  if (rtype === 'teach_steps' && Array.isArray(r.steps) && r.steps.length > 0) {
    // SHOW MODE: forward teach steps to content script via background
    const intro = r.text || r.content || `Let me walk you through this (${r.steps.length} steps).`;
    addMessageToTab(tabId, 'assistant', intro, chatId);
    addMessageToTab(tabId, 'system', `\u{1F393} Starting guided walkthrough\u2026`);
    // Await delivery confirmation — if it fails, tell the user what to do
    chrome.runtime.sendMessage({ type: 'teach_start', steps: r.steps, targetTabId: tabId }, (result) => {
      if (result?.ok) {
        // Success — tooltip is now showing in the tab
      } else {
        const errMsg = result?.error || 'Could not start walkthrough';
        // Remove the "Starting guided walkthrough" system message and show error
        const sysMessages = messagesEl.querySelectorAll('.system-message');
        sysMessages[sysMessages.length - 1]?.remove();
        // Remove from tab's stored messages too
        const msgs = getTabMessages(tabId);
        msgs.splice(msgs.length - 1, 1);
        addMessageToTab(tabId, 'error', `\u26A0\uFE0F ${errMsg}`);
      }
    });
    return;
  }

  if (rtype === 'do_result') {
    // DO MODE: payload was executed, show result
    const text = r.text || r.content || (r.success ? 'Done!' : `Failed: ${r.error || 'unknown error'}`);
    addMessageToTab(tabId, 'assistant', text, chatId);
    return;
  }

  // EXPLAIN MODE (answer) or any other text response
  const text = extractResponseText(resp);
  if (text) {
    addMessageToTab(tabId, 'assistant', text, chatId);
  } else {
    addMessageToTab(tabId, 'assistant', JSON.stringify(resp, null, 2), chatId);
  }
}

async function getActiveTabInfo(): Promise<{ url: string; tabId: number | null }> {
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    // Filter out chrome:// and extension pages
    const realTab = tabs.find(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
    if (realTab?.url) return { url: realTab.url, tabId: realTab.id ?? null };
    // Fallback: any tab with a real URL
    const allTabs = await chrome.tabs.query({ url: ['https://*/*', 'http://*/*'] });
    if (allTabs[0]?.url) return { url: allTabs[0].url, tabId: allTabs[0].id ?? null };
  } catch { /* ignore */ }
  return { url: '', tabId: null };
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  // Capture the tab context at the moment of send — the user may switch tabs
  // while waiting for a response, and we want it to land in the right conversation.
  const sendingTabId = currentTabId;
  if (sendingTabId === null) return;

  inputEl.value = '';
  autoResize();
  sendBtn.disabled = true;

  addMessageToTab(sendingTabId, 'user', text);
  showTyping();

  try {
    const { url: activeTabUrl } = await getActiveTabInfo();
    // Send the last 10 messages of THIS tab as history
    const tabMsgs = getTabMessages(sendingTabId);
    const history = tabMsgs.slice(-11, -1).map(m => ({ role: m.role, content: m.content }));
    const resp = await chrome.runtime.sendMessage({
      type: 'chat_message',
      message: text,
      currentUrl: activeTabUrl,
      tabId: sendingTabId,
      history
    });
    hideTyping();
    // Extract chatId from response for feedback tracking
    const chatId = resp?.chatId || resp?.id || lastChatId;
    if (chatId) lastChatId = chatId;

    if (resp?.error) {
      addMessageToTab(sendingTabId, 'error', resp.error);
    } else if (resp?.type === 'timeout') {
      addMessageToTab(sendingTabId, 'error', 'No response \u2014 is a Claude listener running?');
    } else {
      handleResponseForTab(sendingTabId, resp, chatId);
    }
  } catch (err: any) {
    hideTyping();
    addMessageToTab(sendingTabId, 'error', err.message || 'Failed to send message');
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

// ── Listen for tab activation and injected messages from background ──────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'tab_activated') {
    // Background detected that the user switched to a different tab
    switchToTab(msg.tabId, msg.url);
    return false;
  }

  if (msg.type === 'tab_removed') {
    // Optionally clear stored conversation for closed tabs to free memory
    tabConversations.delete(msg.tabId);
    return false;
  }

  if (msg.type === 'get_tab_history') {
    // Background is asking for history of a specific tab (used for inject_chat flow)
    const msgs = getTabMessages(msg.tabId);
    const history = msgs.slice(-10).map(m => ({ role: m.role, content: m.content }));
    sendResponse({ history });
    return true; // keep channel open for async sendResponse
  }

  if (msg.type === 'show_user_message') {
    // An injected user message — display it in the target tab's conversation
    addMessageToTab(msg.tabId, 'user', msg.message);
    if (currentTabId === msg.tabId) {
      showTyping();
    }
    return false;
  }

  if (msg.type === 'show_response') {
    // Response for an injected message
    if (currentTabId === msg.tabId) {
      hideTyping();
    }
    const chatId = msg.chatId || null;
    if (chatId) lastChatId = chatId;

    if (msg.response?.type === 'error' || msg.response?.error) {
      const errText = msg.response.text || msg.response.error || 'Error processing message';
      addMessageToTab(msg.tabId, 'error', errText);
    } else {
      handleResponseForTab(msg.tabId, msg.response, chatId);
    }
    return false;
  }

  return false;
});

// ── Initialise: get active tab and render its (empty) conversation ───────────
async function init() {
  const { url, tabId } = await getActiveTabInfo();
  if (tabId !== null) {
    switchToTab(tabId, url);
  }
}

function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.overflowY = 'hidden';
  const maxHeight = window.innerHeight * 0.25;
  if (inputEl.scrollHeight > maxHeight) {
    inputEl.style.height = maxHeight + 'px';
    inputEl.style.overflowY = 'scroll';
  } else {
    inputEl.style.height = inputEl.scrollHeight + 'px';
  }
}

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
inputEl.addEventListener('input', autoResize);
sendBtn.addEventListener('click', sendMessage);
checkStatus();
setInterval(checkStatus, 30000);
init();
