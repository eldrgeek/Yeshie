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

export function renderMessage(msg: { role: 'user' | 'assistant' | 'error' | 'system'; content: string }): string {
  const cls = msg.role === 'user' ? 'user-message'
    : msg.role === 'error' ? 'message error-message'
    : msg.role === 'system' ? 'message system-message'
    : 'assistant-message';
  const html = (msg.role === 'assistant' || msg.role === 'system') ? renderMarkdown(msg.content) : escapeHtml(msg.content);
  return `<div class="message ${cls}">${html}</div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const messages: Array<{ role: 'user' | 'assistant' | 'error' | 'system'; content: string }> = [];
const messagesEl = document.getElementById('messages')!;
const statusEl = document.getElementById('status')!;
const inputEl = document.getElementById('chat-input') as HTMLInputElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;

function addMessage(role: 'user' | 'assistant' | 'error' | 'system', content: string) {
  messages.push({ role, content });
  messagesEl.innerHTML += renderMessage({ role, content });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

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

// Handle the three response types from the listener
function handleResponse(resp: any) {
  const r = resp?.response || resp;
  const rtype = r?.type;

  if (rtype === 'teach_steps' && Array.isArray(r.steps) && r.steps.length > 0) {
    // SHOW MODE: forward teach steps to content script via background
    const intro = r.text || r.content || `Let me walk you through this (${r.steps.length} steps).`;
    addMessage('assistant', intro);
    addMessage('system', `\u{1F393} Starting guided walkthrough\u2026`);
    // Send teach_start to background, which forwards to the active tab's content script
    chrome.runtime.sendMessage({ type: 'teach_start', steps: r.steps });
    return;
  }

  if (rtype === 'do_result') {
    // DO MODE: payload was executed, show result
    const text = r.text || r.content || (r.success ? 'Done!' : `Failed: ${r.error || 'unknown error'}`);
    addMessage('assistant', text);
    return;
  }

  // EXPLAIN MODE (answer) or any other text response
  const text = extractResponseText(resp);
  if (text) {
    addMessage('assistant', text);
  } else {
    addMessage('assistant', JSON.stringify(resp, null, 2));
  }
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  sendBtn.disabled = true;
  addMessage('user', text);
  showTyping();

  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'chat_message',
      message: text,
      currentUrl: window.location.href,
      tabId: null
    });
    hideTyping();
    if (resp?.error) {
      addMessage('error', resp.error);
    } else if (resp?.type === 'timeout') {
      addMessage('error', 'No response \u2014 is a Claude listener running?');
    } else {
      handleResponse(resp);
    }
  } catch (err: any) {
    hideTyping();
    addMessage('error', err.message || 'Failed to send message');
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
sendBtn.addEventListener('click', sendMessage);
checkStatus();
setInterval(checkStatus, 30000);
