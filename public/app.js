'use strict';

const HISTORY_KEY = 'dns-pc-consultant.history';
const SESSION_KEY = 'dns-pc-consultant.public-session';
const INVITE_KEY = 'dns-pc-consultant.invite-code';
const MAX_HISTORY = 30;

const chat = document.querySelector('#chat');
const form = document.querySelector('#chatForm');
const input = document.querySelector('#messageInput');
const sendButton = document.querySelector('#sendButton');
const newChatButton = document.querySelector('#newChatButton');
const pdfButton = document.querySelector('#pdfButton');
const historyButton = document.querySelector('#historyButton');
const historyDialog = document.querySelector('#historyDialog');
const closeHistory = document.querySelector('#closeHistory');
const historyList = document.querySelector('#historyList');
const examples = document.querySelector('#examples');
const demoNotice = document.querySelector('#demoNotice');
const serviceStatus = document.querySelector('#serviceStatus');

const messages = [];
let isBusy = false;
let currentSessionId = getOrCreateSessionId();
let publicConfig = null;
let welcomeShown = false;

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function getOrCreateSessionId() {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored && /^[a-zA-Z0-9._-]{8,120}$/.test(stored)) return stored;
  const id = randomId();
  sessionStorage.setItem(SESSION_KEY, id);
  return id;
}

function rotateSessionId() {
  currentSessionId = randomId();
  sessionStorage.setItem(SESSION_KEY, currentSessionId);
}

function captureInviteCode() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (code) {
    sessionStorage.setItem(INVITE_KEY, code);
    url.searchParams.delete('code');
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return sessionStorage.getItem(INVITE_KEY) || '';
}

const inviteCode = captureInviteCode();

function requestHeaders(includeJson = false) {
  const headers = { 'X-Session-Id': currentSessionId };
  if (includeJson) headers['Content-Type'] = 'application/json';
  if (inviteCode) headers['X-Demo-Code'] = inviteCode;
  return headers;
}

const History = {
  load() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
  },
  save(list) { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); },
  upsert(id, items) {
    if (!items.length) return;
    const title = items.find((message) => message.role === 'user')?.content?.slice(0, 60) || 'Диалог';
    const list = this.load().filter((session) => session.id !== id);
    list.unshift({ id, title, date: Date.now(), messages: JSON.parse(JSON.stringify(items)) });
    this.save(list.slice(0, MAX_HISTORY));
  },
  delete(id) { this.save(this.load().filter((session) => session.id !== id)); }
};

if (typeof marked !== 'undefined') {
  marked.use({
    gfm: true,
    breaks: true,
    renderer: {
      link(href, title, text) {
        const safeHref = String(href || '');
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<a href="${escapeHtml(safeHref)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text || ''}</a>`;
      },
      table(header, body) {
        return `<div class="table-wrap"><table><thead>${header || ''}</thead><tbody>${body || ''}</tbody></table></div>`;
      }
    }
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseMarkdown(text) {
  if (typeof marked === 'undefined') return null;
  try { return marked.parse(text); }
  catch { return null; }
}

function addMessage(role, content, extraClass = '') {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'assistant' ? '🤖' : '👤';

  const bubble = document.createElement('div');
  bubble.className = `message ${role} ${extraClass}`.trim();
  if (role === 'assistant' && content) {
    const html = parseMarkdown(content);
    if (html) bubble.innerHTML = html;
    else bubble.textContent = content;
  } else {
    bubble.textContent = content;
  }

  row.append(role === 'user' ? bubble : avatar, role === 'user' ? avatar : bubble);
  chat.append(row);
  chat.scrollTop = chat.scrollHeight;
  return row;
}

function setBusy(value) {
  isBusy = value;
  sendButton.disabled = value || !publicConfig?.accessible || !publicConfig?.serviceReady;
  input.disabled = value || !publicConfig?.accessible || !publicConfig?.serviceReady;
}

function showNotice(text, kind = '') {
  demoNotice.hidden = !text;
  demoNotice.textContent = text || '';
  demoNotice.className = `demo-notice ${kind}`.trim();
}

function renderExamples(items = []) {
  examples.innerHTML = '';
  for (const text of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-chip';
    button.textContent = text;
    button.addEventListener('click', () => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      input.focus();
    });
    examples.append(button);
  }
}

function showWelcome() {
  if (welcomeShown) return;
  addMessage('assistant', publicConfig?.welcome || 'Здравствуйте! Опишите задачи и бюджет будущего компьютера.');
  welcomeShown = true;
}

async function loadPublicConfig() {
  try {
    const response = await fetch('/api/public-config', { headers: requestHeaders() });
    publicConfig = await response.json();
    input.maxLength = publicConfig?.limits?.maxInputChars || 4000;
    renderExamples(publicConfig.examples || []);

    if (!publicConfig.accessible) {
      serviceStatus.className = 'service-status warning';
      showNotice(
        publicConfig.publicMode === 'INVITE_ONLY'
          ? 'Демонстрация доступна только по персональной ссылке или коду приглашения.'
          : 'Публичная демонстрация временно отключена.',
        'error'
      );
    } else if (!publicConfig.serviceReady) {
      serviceStatus.className = 'service-status offline';
      showNotice(`Консультант временно не настроен. Контакт: ${publicConfig.contactEmail}`, 'error');
    } else {
      serviceStatus.className = 'service-status ready';
      const remaining = publicConfig?.limits?.remainingSession;
      showNotice(Number.isFinite(remaining) ? `Публичный режим: доступно сообщений в текущем диалоге — ${remaining}.` : '');
    }

    showWelcome();
    setBusy(false);
  } catch {
    publicConfig = { accessible: false, serviceReady: false };
    serviceStatus.className = 'service-status offline';
    showNotice('Не удалось получить состояние демонстрации.', 'error');
    showWelcome();
    setBusy(false);
  }
}

function autoSave() {
  if (currentSessionId && messages.length) History.upsert(currentSessionId, messages);
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  });
}

function loadSavedSession(session) {
  if (isBusy) return;
  messages.length = 0;
  chat.innerHTML = '';
  currentSessionId = session.id;
  sessionStorage.setItem(SESSION_KEY, currentSessionId);
  welcomeShown = true;
  for (const message of session.messages) {
    addMessage(message.role, message.content);
    messages.push(message);
  }
  historyDialog.close();
  input.focus();
}

function renderHistoryList() {
  const list = History.load();
  historyList.innerHTML = '';
  if (!list.length) {
    historyList.innerHTML = '<p class="history-empty">Сохранённых диалогов нет.</p>';
    return;
  }

  for (const session of list) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-item-info">
        <span class="history-item-title">${escapeHtml(session.title)}${session.title.length >= 60 ? '…' : ''}</span>
        <span class="history-item-meta">${formatDate(session.date)} · ${session.messages.length} сообщ.</span>
      </div>
      <div class="history-item-actions">
        <button class="h-btn" data-action="load">▶ Продолжить</button>
        <button class="h-btn" data-action="pdf">📄 PDF</button>
        <button class="h-btn danger" data-action="delete">🗑 Удалить</button>
      </div>`;

    item.querySelector('[data-action="load"]').addEventListener('click', () => loadSavedSession(session));
    item.querySelector('[data-action="pdf"]').addEventListener('click', () => {
      loadSavedSession(session);
      requestAnimationFrame(() => window.print());
    });
    item.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (!confirm(`Удалить диалог «${session.title}»?`)) return;
      History.delete(session.id);
      renderHistoryList();
    });
    historyList.append(item);
  }
}

historyButton.addEventListener('click', () => {
  renderHistoryList();
  historyDialog.showModal();
});
closeHistory.addEventListener('click', () => historyDialog.close());
historyDialog.addEventListener('click', (event) => {
  if (event.target === historyDialog) historyDialog.close();
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isBusy || !publicConfig?.accessible || !publicConfig?.serviceReady) return;
  const text = input.value.trim();
  if (!text) return;

  addMessage('user', text);
  messages.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';
  setBusy(true);
  const pending = addMessage('assistant', 'Подбираю совместимые компоненты…', 'pending');
  pending.querySelector('.message.pending').innerHTML =
    '<span class="spinner" aria-hidden="true"></span>Подбираю совместимые компоненты…';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: requestHeaders(true),
      body: JSON.stringify({ messages })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    pending.remove();
    addMessage('assistant', payload.answer);
    messages.push({ role: 'assistant', content: payload.answer });
    autoSave();
    if (Number.isFinite(payload.remainingSession)) {
      showNotice(`Публичный режим: доступно сообщений в текущем диалоге — ${payload.remainingSession}.`);
    }
  } catch (error) {
    pending.remove();
    addMessage('assistant', `Ошибка: ${error.message}`);
  } finally {
    setBusy(false);
    input.focus();
  }
});

newChatButton.addEventListener('click', () => {
  if (messages.length && !confirm('Начать новый диалог? Текущий сохранён в истории.')) return;
  messages.length = 0;
  chat.innerHTML = '';
  rotateSessionId();
  welcomeShown = false;
  showWelcome();
  loadPublicConfig();
  input.focus();
});

pdfButton.addEventListener('click', () => {
  if (!messages.length) return;
  window.print();
});

setBusy(true);
loadPublicConfig();
