'use strict';

const loginView = document.querySelector('#loginView');
const dashboard = document.querySelector('#dashboard');
const loginForm = document.querySelector('#loginForm');
const loginEmail = document.querySelector('#loginEmail');
const loginPassword = document.querySelector('#loginPassword');
const loginError = document.querySelector('#loginError');
const logoutButton = document.querySelector('#logoutButton');
const adminIdentity = document.querySelector('#adminIdentity');
const settingsForm = document.querySelector('#settingsForm');
const modelInput = document.querySelector('#modelInput');
const maxTokensInput = document.querySelector('#maxTokensInput');
const temperatureInput = document.querySelector('#temperatureInput');
const publicModeSelect = document.querySelector('#publicModeSelect');
const sessionLimitInput = document.querySelector('#sessionLimitInput');
const ipLimitInput = document.querySelector('#ipLimitInput');
const globalLimitInput = document.querySelector('#globalLimitInput');
const maxCharsInput = document.querySelector('#maxCharsInput');
const welcomeInput = document.querySelector('#welcomeInput');
const examplesInput = document.querySelector('#examplesInput');
const keyStatus = document.querySelector('#keyStatus');
const statusBanner = document.querySelector('#statusBanner');
const selfTestButton = document.querySelector('#selfTestButton');
const reloadKbButton = document.querySelector('#reloadKbButton');
const updateLinksButton = document.querySelector('#updateLinksButton');
const refreshButton = document.querySelector('#refreshButton');
const diagnosticsOutput = document.querySelector('#diagnosticsOutput');

function showBanner(text, error = false) {
  statusBanner.hidden = !text;
  statusBanner.textContent = text || '';
  statusBanner.className = `status-banner${error ? ' error' : ''}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setDashboard(authenticated, email = '') {
  loginView.hidden = authenticated;
  dashboard.hidden = !authenticated;
  if (authenticated) adminIdentity.textContent = email;
}

async function checkSession() {
  try {
    const status = await api('/api/admin/status');
    setDashboard(true, status.email);
    await refreshAll();
  } catch {
    setDashboard(false);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email: loginEmail.value.trim(), password: loginPassword.value })
    });
    loginPassword.value = '';
    setDashboard(true, result.email);
    await refreshAll();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
  } finally {
    button.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  setDashboard(false);
});

function fillSettings(settings) {
  modelInput.value = settings.model || '';
  maxTokensInput.value = settings.maxTokens;
  temperatureInput.value = settings.temperature;
  publicModeSelect.value = settings.publicMode;
  sessionLimitInput.value = settings.perSessionLimit;
  ipLimitInput.value = settings.perIpDailyLimit;
  globalLimitInput.value = settings.globalDailyLimit;
  maxCharsInput.value = settings.maxInputChars;
  welcomeInput.value = settings.welcome || '';
  examplesInput.value = (settings.examples || []).join('\n');
  keyStatus.textContent = settings.apiKeyConfigured ? 'API-ключ настроен' : 'API-ключ отсутствует';
  keyStatus.className = `pill ${settings.apiKeyConfigured ? 'good' : 'bad'}`;
}

async function loadSettings() {
  const settings = await api('/api/admin/settings');
  fillSettings(settings);
  return settings;
}

async function loadMetrics() {
  const metrics = await api('/api/admin/metrics');
  document.querySelector('#metricDaily').textContent = metrics.dailyRequests ?? 0;
  document.querySelector('#metricSuccess').textContent = metrics.successfulResponses ?? 0;
  document.querySelector('#metricErrors').textContent = metrics.upstreamErrors ?? 0;
  document.querySelector('#metricSessions').textContent = metrics.activeSessionsToday ?? 0;
  return metrics;
}

async function refreshAll() {
  try {
    await Promise.all([loadSettings(), loadMetrics()]);
  } catch (error) {
    if (error.status === 401) setDashboard(false);
    else showBanner(error.message, true);
  }
}

settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = settingsForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const payload = {
      model: modelInput.value.trim(),
      maxTokens: Number(maxTokensInput.value),
      temperature: Number(temperatureInput.value),
      publicMode: publicModeSelect.value,
      perSessionLimit: Number(sessionLimitInput.value),
      perIpDailyLimit: Number(ipLimitInput.value),
      globalDailyLimit: Number(globalLimitInput.value),
      maxInputChars: Number(maxCharsInput.value),
      welcome: welcomeInput.value.trim(),
      examples: examplesInput.value.split('\n').map((line) => line.trim()).filter(Boolean)
    };
    const result = await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(payload) });
    fillSettings(result.settings);
    showBanner('Настройки применены. Они будут действовать до перезапуска приложения.');
  } catch (error) {
    showBanner(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

selfTestButton.addEventListener('click', async () => {
  selfTestButton.disabled = true;
  try {
    const result = await api('/api/admin/self-test', { method: 'POST' });
    diagnosticsOutput.textContent = JSON.stringify(result, null, 2);
    showBanner(result.ok ? 'Критические проверки пройдены.' : 'Обнаружены проблемы конфигурации.', !result.ok);
  } catch (error) {
    diagnosticsOutput.textContent = error.message;
    showBanner(error.message, true);
  } finally {
    selfTestButton.disabled = false;
  }
});

reloadKbButton.addEventListener('click', async () => {
  reloadKbButton.disabled = true;
  try {
    const result = await api('/api/admin/reload-kb', { method: 'POST' });
    diagnosticsOutput.textContent = JSON.stringify(result, null, 2);
    showBanner(`База знаний перезагружена: ${result.knowledgeSections} разделов.`);
    await loadSettings();
  } catch (error) {
    showBanner(error.message, true);
  } finally {
    reloadKbButton.disabled = false;
  }
});

updateLinksButton.addEventListener('click', async () => {
  updateLinksButton.disabled = true;
  diagnosticsOutput.textContent = 'Добавляю поисковые fallback-ссылки DNS по названию модели или артикулу…';
  try {
    const result = await api('/api/admin/update-links', { method: 'POST' });
    diagnosticsOutput.textContent = JSON.stringify(result.report, null, 2);
    showBanner(`Просмотрено ${result.report.scanned}; добавлено ${result.report.enriched}; уже подготовлено ${result.report.alreadyPrepared}; без названия ${result.report.unresolved}.`, result.report.unresolved > 0);
  } catch (error) {
    diagnosticsOutput.textContent = error.message;
    showBanner(error.message, true);
  } finally {
    updateLinksButton.disabled = false;
  }
});

refreshButton.addEventListener('click', async () => {
  refreshButton.disabled = true;
  try {
    await loadMetrics();
    showBanner('Метрики обновлены.');
  } catch (error) {
    showBanner(error.message, true);
  } finally {
    refreshButton.disabled = false;
  }
});

checkSession();