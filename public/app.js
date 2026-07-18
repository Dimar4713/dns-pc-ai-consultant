'use strict';

const STORAGE_KEY  = 'dns-pc-consultant.settings.v2';
const HISTORY_KEY  = 'dns-pc-consultant.history';
const MAX_HISTORY  = 30;
const DEFAULT_MODEL       = 'deepseek/deepseek-v4-pro';
const DEFAULT_MAX_TOKENS  = 4000;
const DEFAULT_TEMPERATURE = 0.25;
const WELCOME = `Здравствуйте! Я помогу подобрать совместимую сборку компьютера по пилотной базе товаров DNS.ru.\n\nОтветьте, пожалуйста, сразу на 3 вопроса:\n1. Какой бюджет и входят ли в него монитор, Windows и периферия?\n2. Для каких задач нужен ПК: игры, работа, учёба? Для игр укажите разрешение и желаемую частоту кадров; для работы — программы.\n3. Есть ли уже купленные детали и важны ли тишина, компактность, внешний вид или будущий апгрейд?`;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const chat            = document.querySelector('#chat');
const form            = document.querySelector('#chatForm');
const input           = document.querySelector('#messageInput');
const sendButton      = document.querySelector('#sendButton');
const settingsDialog  = document.querySelector('#settingsDialog');
const settingsButton  = document.querySelector('#settingsButton');
const closeSettings   = document.querySelector('#closeSettings');
const settingsForm    = document.querySelector('#settingsForm');
const apiKeyInput     = document.querySelector('#apiKeyInput');
const modelSelect     = document.querySelector('#modelSelect');
const customModelLabel= document.querySelector('#customModelLabel');
const customModelInput= document.querySelector('#customModelInput');
const maxTokensRange  = document.querySelector('#maxTokensRange');
const maxTokensNumber = document.querySelector('#maxTokensNumber');
const temperatureRange= document.querySelector('#temperatureRange');
const temperatureNumber=document.querySelector('#temperatureNumber');
const newChatButton   = document.querySelector('#newChatButton');
const pdfButton       = document.querySelector('#pdfButton');
const historyButton   = document.querySelector('#historyButton');
const historyDialog   = document.querySelector('#historyDialog');
const closeHistory    = document.querySelector('#closeHistory');
const historyList     = document.querySelector('#historyList');

// ── State ─────────────────────────────────────────────────────────────────────
const messages = [];
let isBusy = false;
let currentSessionId = null;

// ── Settings ──────────────────────────────────────────────────────────────────
function loadSettings() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      apiKey:      typeof p.apiKey === 'string' ? p.apiKey : '',
      model:       typeof p.model  === 'string' && p.model ? p.model : DEFAULT_MODEL,
      maxTokens:   Number.isFinite(p.maxTokens)   ? p.maxTokens   : DEFAULT_MAX_TOKENS,
      temperature: Number.isFinite(p.temperature) ? p.temperature : DEFAULT_TEMPERATURE,
    };
  } catch { return { apiKey: '', model: DEFAULT_MODEL, maxTokens: DEFAULT_MAX_TOKENS, temperature: DEFAULT_TEMPERATURE }; }
}
function saveSettings(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

function syncPair(range, number) {
  range.addEventListener('input',  () => { number.value = range.value; });
  number.addEventListener('input', () => { range.value  = number.value; });
}

// ── History manager ───────────────────────────────────────────────────────────
const History = {
  load() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch { return []; }
  },
  save(list) { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); },

  upsert(id, messages) {
    if (!messages.length) return;
    const title = messages.find(m => m.role === 'user')?.content?.slice(0, 60) || 'Диалог';
    const list  = this.load().filter(s => s.id !== id);
    list.unshift({ id, title, date: Date.now(), messages: JSON.parse(JSON.stringify(messages)) });
    this.save(list.slice(0, MAX_HISTORY));
  },

  delete(id) { this.save(this.load().filter(s => s.id !== id)); },

  get(id) { return this.load().find(s => s.id === id) || null; },
};

function newSessionId() {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function autoSave() {
  if (currentSessionId && messages.length) History.upsert(currentSessionId, messages);
}

// ── marked.js setup (links open in new tab, tables enabled) ──────────────────
if (typeof marked !== 'undefined') {
  marked.use({
    gfm: true,
    breaks: true,
    renderer: {
      // In marked v12 token.text is the raw source text; the rendered
      // inner HTML lives in token.tokens and must go through parseInline.
      link(token) {
        const text = (this.parser && token.tokens?.length)
          ? this.parser.parseInline(token.tokens)
          : (token.text ?? '');
        const href      = token.href  ?? '';
        const titleAttr = token.title ? ` title="${token.title}"` : '';
        return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
      // Render table manually and wrap in scrollable div.
      // Calling Renderer.prototype.table() from within marked.use() breaks
      // in v12 because this.parser isn't wired up on the prototype call path.
      table(token) {
        const cellText = (cell) => {
          if (!cell) return '';
          if (cell.tokens?.length && this.parser) return this.parser.parseInline(cell.tokens);
          return cell.text ?? '';
        };

        const header = (token.header ?? []).map(cell => {
          const align = cell?.align ? ` style="text-align:${cell.align}"` : '';
          return `<th${align}>${cellText(cell)}</th>`;
        }).join('');

        const rows = (token.rows ?? []).map(row =>
          `<tr>${(row ?? []).map(cell => {
            const align = cell?.align ? ` style="text-align:${cell.align}"` : '';
            return `<td${align}>${cellText(cell)}</td>`;
          }).join('')}</tr>`
        ).join('');

        return `<div class="table-wrap"><table>`
             + `<thead><tr>${header}</tr></thead>`
             + `<tbody>${rows}</tbody>`
             + `</table></div>`;
      },
    },
  });
}

function parseMarkdown(text) {
  if (typeof marked === 'undefined') return null;
  return marked.parse(text);
}

// ── Product popups ────────────────────────────────────────────────────────────
let activePopup = null;

function closeActivePopup() {
  if (activePopup) { activePopup.remove(); activePopup = null; }
}

function positionPopup(popup, li) {
  // position: fixed → viewport coordinates only (no scroll offset)
  const rect = li.getBoundingClientRect();
  const pw   = popup.offsetWidth  || 300;
  const ph   = popup.offsetHeight || 0;
  const vw   = window.innerWidth;
  const vh   = window.innerHeight;
  const GAP  = 10;

  let left = rect.right + GAP;
  if (left + pw > vw - GAP) left = rect.left - pw - GAP;
  if (left < GAP) left = GAP;

  let top = rect.top;
  if (top + ph > vh - GAP) top = Math.max(GAP, vh - ph - GAP);

  popup.style.left = `${left}px`;
  popup.style.top  = `${top}px`;
}

function buildPopup(li) {
  const popup = document.createElement('div');
  popup.className = 'product-popup';

  const clone = li.cloneNode(true);
  clone.querySelectorAll('ul, ol').forEach(el => el.remove());
  popup.innerHTML = clone.innerHTML;

  const link = li.querySelector('a[href]');
  if (link) {
    const btn = document.createElement('a');
    btn.href      = link.href;
    btn.target    = '_blank';
    btn.rel       = 'noopener noreferrer';
    btn.className = 'product-popup-btn';
    btn.textContent = 'Открыть на DNS →';
    popup.appendChild(btn);
  }
  return popup;
}

function attachPopups(bubble) {
  bubble.querySelectorAll('li').forEach(li => {
    if (!/\d[\d\s]*(?:руб|₽)/i.test(li.textContent)) return;
    li.classList.add('has-popup');

    function show(e) {
      e.stopPropagation();
      closeActivePopup();
      const popup = buildPopup(li);
      popup.style.visibility = 'hidden';
      document.body.appendChild(popup);
      activePopup = popup;

      // measure after paint so offsetHeight is real
      requestAnimationFrame(() => {
        positionPopup(popup, li);
        popup.style.visibility = '';
      });

      popup.addEventListener('mouseleave', closeActivePopup);
      popup.addEventListener('touchstart', ev => ev.stopPropagation(), { passive: true });
    }

    li.addEventListener('mouseenter', show);
    li.addEventListener('touchstart',  show, { passive: true });
  });
}

document.addEventListener('click',      closeActivePopup);
document.addEventListener('touchstart', closeActivePopup, { passive: true });

// ── Chat rendering ────────────────────────────────────────────────────────────
function addMessage(role, content, extraClass = '') {
  const row    = document.createElement('div');
  row.className = `message-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className  = 'avatar';
  avatar.textContent = role === 'assistant' ? '🤖' : '👤';

  const bubble = document.createElement('div');
  bubble.className = `message ${role} ${extraClass}`.trim();

  if (role === 'assistant' && content) {
    const html = parseMarkdown(content);
    if (html) { bubble.innerHTML = html; attachPopups(bubble); }
    else       { bubble.textContent = content; }
  } else {
    bubble.textContent = content;
  }

  row.append(role === 'user' ? bubble : avatar,
             role === 'user' ? avatar  : bubble);
  chat.append(row);
  chat.scrollTop = chat.scrollHeight;
  return row;
}

function showWelcome() { addMessage('assistant', WELCOME); }

// ── Load a saved session into the chat ───────────────────────────────────────
function loadSession(session) {
  if (isBusy) return;
  messages.length = 0;
  chat.innerHTML  = '';
  currentSessionId = session.id;
  for (const m of session.messages) {
    addMessage(m.role, m.content);
    messages.push(m);
  }
  historyDialog.close();
  input.focus();
}

// ── History panel UI ─────────────────────────────────────────────────────────
function formatDate(ts) {
  return new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

function renderHistoryList() {
  const list = History.load();
  if (!list.length) {
    historyList.innerHTML = '<p class="history-empty">Сохранённых диалогов нет.</p>';
    return;
  }
  historyList.innerHTML = '';
  for (const s of list) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="history-item-info">
        <span class="history-item-title">${escHtml(s.title)}${s.title.length >= 60 ? '…' : ''}</span>
        <span class="history-item-meta">${formatDate(s.date)} · ${s.messages.length} сообщ.</span>
      </div>
      <div class="history-item-actions">
        <button class="h-btn" data-action="load">▶ Продолжить</button>
        <button class="h-btn" data-action="pdf">📄 PDF</button>
        <button class="h-btn danger" data-action="delete">🗑 Удалить</button>
      </div>`;

    item.querySelector('[data-action="load"]').addEventListener('click', () => loadSession(s));

    item.querySelector('[data-action="pdf"]').addEventListener('click', () => {
      // Temporarily render the session in a hidden div, then print
      const saved = { id: currentSessionId, messages: [...messages], html: chat.innerHTML };
      loadSession(s);
      requestAnimationFrame(() => {
        injectPrintHeader();
        window.print();
        // restore
        setTimeout(() => {
          messages.length = 0;
          messages.push(...saved.messages);
          chat.innerHTML = saved.html;
          currentSessionId = saved.id;
        }, 500);
      });
    });

    item.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (!confirm(`Удалить диалог «${s.title}»?`)) return;
      History.delete(s.id);
      if (s.id === currentSessionId) currentSessionId = null;
      renderHistoryList();
    });

    historyList.appendChild(item);
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

historyButton.addEventListener('click', () => { renderHistoryList(); historyDialog.showModal(); });
closeHistory.addEventListener('click',  () => historyDialog.close());
historyDialog.addEventListener('click', e => { if (e.target === historyDialog) historyDialog.close(); });

// ── Settings panel ────────────────────────────────────────────────────────────
function openSettings() {
  const s = loadSettings();
  apiKeyInput.value   = s.apiKey;
  const known = [...modelSelect.options].some(o => o.value === s.model && o.value !== 'custom');
  modelSelect.value       = known ? s.model : 'custom';
  customModelInput.value  = known ? '' : s.model;
  customModelLabel.hidden = known;
  maxTokensRange.value  = s.maxTokens;
  maxTokensNumber.value = s.maxTokens;
  temperatureRange.value  = s.temperature;
  temperatureNumber.value = s.temperature;
  settingsDialog.showModal();
}

function setBusy(v) {
  isBusy = v;
  sendButton.disabled = v;
  input.disabled = v;
}

syncPair(maxTokensRange,  maxTokensNumber);
syncPair(temperatureRange, temperatureNumber);

settingsButton.addEventListener('click', openSettings);
closeSettings.addEventListener('click',  () => settingsDialog.close());
settingsDialog.addEventListener('click', e => { if (e.target === settingsDialog) settingsDialog.close(); });
modelSelect.addEventListener('change', () => { customModelLabel.hidden = modelSelect.value !== 'custom'; });
settingsForm.addEventListener('submit', e => {
  e.preventDefault();
  const model = modelSelect.value === 'custom' ? customModelInput.value.trim() : modelSelect.value;
  if (!model) { customModelInput.focus(); return; }
  saveSettings({
    apiKey:      apiKeyInput.value.trim(),
    model,
    maxTokens:   Math.max(500, Math.min(8000, Number(maxTokensNumber.value)   || DEFAULT_MAX_TOKENS)),
    temperature: Math.max(0,   Math.min(1,    Number(temperatureNumber.value) ?? DEFAULT_TEMPERATURE)),
  });
  settingsDialog.close();
});

// ── Composer ──────────────────────────────────────────────────────────────────
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (isBusy) return;
  const text = input.value.trim();
  if (!text) return;

  const settings = loadSettings();
  if (!settings.apiKey) { openSettings(); apiKeyInput.focus(); return; }

  // Start a session if this is the first message
  if (!currentSessionId) currentSessionId = newSessionId();

  addMessage('user', text);
  messages.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';
  setBusy(true);
  const pending = addMessage('assistant', 'Подбираю совместимые компоненты…', 'pending');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: settings.apiKey, model: settings.model, messages, maxTokens: settings.maxTokens, temperature: settings.temperature }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);

    pending.remove();
    addMessage('assistant', payload.answer);
    messages.push({ role: 'assistant', content: payload.answer });
    autoSave();
  } catch (err) {
    pending.remove();
    addMessage('assistant', `Ошибка: ${err.message}`);
  } finally {
    setBusy(false);
    input.focus();
  }
});

// ── New chat ──────────────────────────────────────────────────────────────────
newChatButton.addEventListener('click', () => {
  if (messages.length === 0) return;
  if (!confirm('Начать новый диалог? Текущий уже сохранён в истории.')) return;
  messages.length = 0;
  chat.innerHTML  = '';
  currentSessionId = null;
  showWelcome();
  input.focus();
});

// ── PDF ───────────────────────────────────────────────────────────────────────
function injectPrintHeader() {
  let h = document.querySelector('.print-header');
  if (!h) { h = document.createElement('div'); h.className = 'print-header'; chat.prepend(h); }
  const now = new Date().toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
  h.innerHTML = `<h2>AI-консультант по сборке ПК — DNS</h2><p>Диалог сохранён: ${now}</p>`;
}

pdfButton.addEventListener('click', () => {
  if (!messages.length) return;
  injectPrintHeader();
  window.print();
});

// ── Init ──────────────────────────────────────────────────────────────────────
showWelcome();
input.focus();
