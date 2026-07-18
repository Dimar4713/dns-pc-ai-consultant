'use strict';

function integerEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function numberEnv(name, fallback, min, max) {
  const value = Number.parseFloat(process.env[name] || '');
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function enumEnv(name, fallback, allowed) {
  const value = String(process.env[name] || fallback).trim().toUpperCase();
  return allowed.includes(value) ? value : fallback;
}

function booleanEnv(name, fallback = false) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

const config = {
  port: integerEnv('PORT', 3000, 1, 65535),
  routerBaseUrl: (process.env.ROUTERAI_BASE_URL || 'https://routerai.ru/api/v1').replace(/\/$/, ''),
  routerApiKey: String(process.env.ROUTERAI_API_KEY || '').trim(),
  adminEmail: String(process.env.ADMIN_EMAIL || 'dimamarareskul@gmail.com').trim().toLowerCase(),
  adminPasswordHash: String(process.env.ADMIN_PASSWORD_HASH || '').trim(),
  adminPassword: String(process.env.ADMIN_PASSWORD || '').trim(),
  sessionSecret: String(process.env.SESSION_SECRET || '').trim(),
  inviteCode: String(process.env.DEMO_INVITE_CODE || '').trim(),
  adminSessionTtlMs: integerEnv('ADMIN_SESSION_TTL_MINUTES', 480, 15, 1440) * 60_000,
  requestTimeoutMs: integerEnv('ROUTERAI_TIMEOUT_MS', 60_000, 5_000, 180_000),
  dnsLinkAutoUpdate: booleanEnv('DNS_LINK_AUTO_UPDATE', false),
  dnsLinkUpdateHourUtc: integerEnv('DNS_LINK_UPDATE_HOUR_UTC', 3, 0, 23),
  dnsLinkTimeoutMs: integerEnv('DNS_LINK_TIMEOUT_MS', 20_000, 5_000, 60_000),
  dnsLinkDelayMs: integerEnv('DNS_LINK_DELAY_MS', 1500, 500, 10_000),
  dnsLinkUserAgent: String(process.env.DNS_LINK_USER_AGENT || 'Mozilla/5.0 DNS-PC-AI-Consultant-Link-Validator/1.0').trim(),
  runtime: {
    model: String(process.env.ROUTERAI_MODEL || 'deepseek/deepseek-v4-pro').trim(),
    maxTokens: integerEnv('ROUTERAI_MAX_TOKENS', 4000, 500, 8000),
    temperature: numberEnv('ROUTERAI_TEMPERATURE', 0.1, 0, 1),
    publicMode: enumEnv('PUBLIC_MODE', 'PUBLIC', ['PUBLIC', 'INVITE_ONLY', 'DISABLED']),
    perSessionLimit: integerEnv('PUBLIC_SESSION_MESSAGE_LIMIT', 20, 1, 200),
    perIpDailyLimit: integerEnv('PUBLIC_IP_DAILY_LIMIT', 40, 1, 5000),
    globalDailyLimit: integerEnv('PUBLIC_GLOBAL_DAILY_LIMIT', 500, 1, 100000),
    maxInputChars: integerEnv('PUBLIC_MAX_INPUT_CHARS', 4000, 200, 12000),
    welcome: String(process.env.PUBLIC_WELCOME || '').trim() ||
      'Здравствуйте! Я помогу подобрать совместимую сборку компьютера по пилотной базе товаров DNS.ru.\n\n' +
      'Укажите бюджет, задачи, требования к монитору и уже имеющиеся комплектующие.',
    examples: [
      'Игровой ПК до 120 000 ₽ для Full HD 144 Гц',
      'Рабочая станция для монтажа 4K с 64 ГБ памяти',
      'Компактный офисный компьютер с монитором и периферией'
    ]
  }
};

function applyRuntimeSettings(input = {}) {
  const runtime = config.runtime;
  if (typeof input.model === 'string' && input.model.trim()) runtime.model = input.model.trim().slice(0, 160);
  if (input.maxTokens !== undefined) runtime.maxTokens = Math.max(500, Math.min(8000, Number(input.maxTokens) || 4000));
  if (input.temperature !== undefined) runtime.temperature = Math.max(0, Math.min(1, Number(input.temperature) || 0));
  const mode = String(input.publicMode || '').toUpperCase();
  if (['PUBLIC', 'INVITE_ONLY', 'DISABLED'].includes(mode)) runtime.publicMode = mode;
  if (input.perSessionLimit !== undefined) runtime.perSessionLimit = Math.max(1, Math.min(200, Number(input.perSessionLimit) || 20));
  if (input.perIpDailyLimit !== undefined) runtime.perIpDailyLimit = Math.max(1, Math.min(5000, Number(input.perIpDailyLimit) || 40));
  if (input.globalDailyLimit !== undefined) runtime.globalDailyLimit = Math.max(1, Math.min(100000, Number(input.globalDailyLimit) || 500));
  if (input.maxInputChars !== undefined) runtime.maxInputChars = Math.max(200, Math.min(12000, Number(input.maxInputChars) || 4000));
  if (typeof input.welcome === 'string' && input.welcome.trim()) runtime.welcome = input.welcome.trim().slice(0, 3000);
  if (Array.isArray(input.examples)) {
    const examples = input.examples.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6);
    if (examples.length) runtime.examples = examples.map((item) => item.slice(0, 300));
  }
  return runtime;
}

module.exports = { config, applyRuntimeSettings };
