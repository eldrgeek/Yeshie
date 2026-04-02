// Message rendering (exported for testing)
export function renderMessage(msg: { role: 'user' | 'assistant' | 'error'; content: string }): string {
  const cls = msg.role === 'user' ? 'user-message' : msg.role === 'error' ? 'message error-message' : 'assistant-message';
  return `<div class="message ${cls}">${escapeHtml(msg.content)}</div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const messages: Array<{ role: 'user' | 'assistant' | 'error'; content: string }> = [];
const messagesEl = document.getElementById('messages')!;
const statusEl = document.getElementById('status')!;
const inputEl = document.getElementById('chat-input') as HTMLInputElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;

function addMessage(role: 'user' | 'assistant' | 'error', content: string) {
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

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  sendBtn.disabled = true;
  addMessage('user', text);
  showTyping();

  try {
    const resp = await chrome.runtime.sendMessage({ type: 'chat_message', message: text, currentUrl: window.location.href, tabId: null });
    hideTyping();
    if (resp?.error) {
      addMessage('error', resp.error);
    } else if (resp?.response?.content) {
      addMessage('assistant', resp.response.content);
    } else if (resp?.type === 'timeout') {
      addMessage('error', 'No response \u2014 is a Claude listener running?');
    } else {
      addMessage('assistant', JSON.stringify(resp));
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
// Re-check status every 30s
setInterval(checkStatus, 30000);
