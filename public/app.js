'use strict';

const STORAGE_KEY = 'dns-pc-consultant.settings.v1';
const DEFAULT_MODEL = 'deepseek/deepseek-v4-pro';
const WELCOME = `Здравствуйте! Я помогу подобрать совместимую сборку компьютера по учебной базе товаров DNS.ru.\n\nОтветьте, пожалуйста, сразу на 3 вопроса:\n1. Какой бюджет и входят ли в него монитор, Windows и периферия?\n2. Для каких задач нужен ПК: игры, работа, учёба? Для игр укажите разрешение и желаемую частоту кадров; для работы — программы.\n3. Есть ли уже купленные детали и важны ли тишина, компактность, внешний вид или будущий апгрейд?`;

const chat = document.querySelector('#chat');
const form = document.querySelector('#chatForm');
const input = document.querySelector('#messageInput');
const sendButton = document.querySelector('#sendButton');
const settingsDialog = document.querySelector('#settingsDialog');
const settingsButton = document.querySelector('#settingsButton');
const closeSettings = document.querySelector('#closeSettings');
const settingsForm = document.querySelector('#settingsForm');
const apiKeyInput = document.querySelector('#apiKeyInput');
const modelSelect = document.querySelector('#modelSelect');
const customModelLabel = document.querySelector('#customModelLabel');
const customModelInput = document.querySelector('#customModelInput');

const messages = [];
let isBusy = false;

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_MODEL
    };
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL };
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function addMessage(role, content, extraClass = '') {
  const node = document.createElement('div');
  node.className = `message ${role} ${extraClass}`.trim();
  node.textContent = content;
  chat.append(node);
  chat.scrollTop = chat.scrollHeight;
  return node;
}

function showWelcome() {
  addMessage('assistant', WELCOME);
}

function openSettings() {
  const settings = loadSettings();
  apiKeyInput.value = settings.apiKey;
  const known = [...modelSelect.options].some((option) => option.value === settings.model && option.value !== 'custom');
  modelSelect.value = known ? settings.model : 'custom';
  customModelInput.value = known ? '' : settings.model;
  customModelLabel.hidden = known;
  settingsDialog.showModal();
}

function setBusy(value) {
  isBusy = value;
  sendButton.disabled = value;
  input.disabled = value;
}

settingsButton.addEventListener('click', openSettings);
closeSettings.addEventListener('click', () => settingsDialog.close());
modelSelect.addEventListener('change', () => {
  customModelLabel.hidden = modelSelect.value !== 'custom';
});
settingsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const model = modelSelect.value === 'custom' ? customModelInput.value.trim() : modelSelect.value;
  if (!model) {
    customModelInput.focus();
    return;
  }
  saveSettings({ apiKey: apiKeyInput.value.trim(), model });
  settingsDialog.close();
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
  if (isBusy) return;

  const text = input.value.trim();
  if (!text) return;

  const settings = loadSettings();
  if (!settings.apiKey) {
    openSettings();
    apiKeyInput.focus();
    return;
  }

  addMessage('user', text);
  messages.push({ role: 'user', content: text });
  input.value = '';
  input.style.height = 'auto';
  setBusy(true);
  const pending = addMessage('assistant', 'Подбираю совместимые компоненты…', 'pending');

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: settings.apiKey, model: settings.model, messages })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);

    pending.remove();
    addMessage('assistant', payload.answer);
    messages.push({ role: 'assistant', content: payload.answer });
  } catch (error) {
    pending.remove();
    addMessage('assistant', `Ошибка: ${error.message}`);
  } finally {
    setBusy(false);
    input.focus();
  }
});

showWelcome();
input.focus();
