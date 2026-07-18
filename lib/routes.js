'use strict';

const path = require('path');
const { applyRuntimeSettings } = require('./config');

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .slice(-24)
    .filter((message) => message && ['user', 'assistant'].includes(message.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').slice(0, 12000)
    }))
    .filter((message) => message.content.trim());
}

function registerRoutes(app, context) {
  const { config, security, usage, knowledge, root } = context;
  const runtime = config.runtime;
  const publicDir = path.join(root, 'public');

  function checkPublicAccess(req) {
    if (runtime.publicMode === 'DISABLED') {
      return { ok: false, status: 503, error: 'Публичная демонстрация временно отключена.' };
    }
    if (runtime.publicMode === 'INVITE_ONLY') {
      const providedCode = String(req.headers['x-demo-code'] || '').trim();
      if (!config.inviteCode || !security.safeEqual(providedCode, config.inviteCode)) {
        return { ok: false, status: 403, error: 'Для демонстрации требуется действующий код доступа.' };
      }
    }
    return { ok: true };
  }

  function settingsView() {
    const kb = knowledge.status();
    return {
      ...runtime,
      apiKeyConfigured: Boolean(config.routerApiKey),
      inviteCodeConfigured: Boolean(config.inviteCode),
      adminPasswordHashConfigured: Boolean(config.adminPasswordHash),
      sessionSecretConfigured: config.sessionSecret.length >= 32,
      knowledgeFiles: kb.files,
      knowledgeSections: kb.sections,
      knowledgeLoadedAt: kb.loadedAt
    };
  }

  app.get('/api/health', (_req, res) => {
    const kb = knowledge.status();
    res.json({
      ok: true,
      service: 'dns-pc-ai-consultant',
      publicMode: runtime.publicMode,
      serviceReady: Boolean(config.routerApiKey && runtime.model),
      knowledgeFiles: kb.files,
      knowledgeSections: kb.sections,
      categoryRoutes: kb.categoryRoutes
    });
  });

  app.get('/api/public-config', (req, res) => {
    const access = checkPublicAccess(req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      publicMode: runtime.publicMode,
      accessible: access.ok,
      serviceReady: Boolean(config.routerApiKey && runtime.model),
      welcome: runtime.welcome,
      examples: runtime.examples,
      limits: {
        perSession: runtime.perSessionLimit,
        remainingSession: usage.remainingFor(req),
        maxInputChars: runtime.maxInputChars
      },
      contactEmail: 'dimamarareskul@gmail.com'
    });
  });

  app.post('/api/chat', async (req, res) => {
    const access = checkPublicAccess(req);
    if (!access.ok) return res.status(access.status).json({ error: access.error });
    if (!config.routerApiKey) return res.status(503).json({ error: 'Сервис временно не настроен. Обратитесь к владельцу демонстрации.' });
    if (!runtime.model) return res.status(503).json({ error: 'Модель консультанта не настроена.' });

    const messages = sanitizeMessages(req.body?.messages);
    if (!messages.length || messages.at(-1).role !== 'user') {
      return res.status(400).json({ error: 'Отсутствует сообщение пользователя.' });
    }
    if (messages.at(-1).content.length > runtime.maxInputChars) {
      return res.status(413).json({ error: `Сообщение превышает лимит ${runtime.maxInputChars} символов.` });
    }

    const quota = usage.consume(req);
    if (!quota.ok) {
      usage.metrics.rejectedByLimit += 1;
      return res.status(429).json({ error: quota.error });
    }

    usage.metrics.chatRequests += 1;
    usage.metrics.lastChatAt = new Date().toISOString();
    const selected = knowledge.buildSystemPrompt(messages);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    const wantStream = String(req.headers.accept || '').includes('text/event-stream');

    // ── Streaming path ──────────────────────────────────────────────────────
    if (wantStream) {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      req.on('close', () => controller.abort());

      const sendData = (obj) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      try {
        const upstream = await fetch(`${config.routerBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.routerApiKey}` },
          body: JSON.stringify({
            model: runtime.model,
            messages: [{ role: 'system', content: selected.prompt }, ...messages],
            temperature: runtime.temperature,
            max_tokens: runtime.maxTokens,
            stream: true
          }),
          signal: controller.signal
        });

        if (!upstream.ok) {
          const errPayload = await upstream.json().catch(() => ({}));
          usage.metrics.upstreamErrors += 1;
          usage.metrics.lastErrorAt = new Date().toISOString();
          sendData({ error: errPayload?.error?.message || `RouterAI вернул HTTP ${upstream.status}` });
          return res.end();
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let receivedContent = false;

        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              if (receivedContent) usage.metrics.successfulResponses += 1;
              sendData({ type: 'done', remainingSession: quota.remainingSession, categories: selected.categories });
              break outer;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices?.[0]?.delta?.content) receivedContent = true;
            } catch { /* ignore malformed chunk */ }
            if (!res.writableEnded) res.write(`data: ${data}\n\n`);
          }
        }

        if (!receivedContent) {
          usage.metrics.upstreamErrors += 1;
          usage.metrics.lastErrorAt = new Date().toISOString();
          sendData({ error: 'Модель не вернула текстовый ответ.' });
        }
      } catch (error) {
        usage.metrics.upstreamErrors += 1;
        usage.metrics.lastErrorAt = new Date().toISOString();
        sendData({
          error: error?.name === 'AbortError'
            ? 'Модель не ответила за отведённое время.'
            : 'Не удалось обратиться к AI-модели.'
        });
      } finally {
        clearTimeout(timeout);
        if (!res.writableEnded) res.end();
      }
      return;
    }

    // ── Non-streaming fallback ───────────────────────────────────────────────
    try {
      const upstream = await fetch(`${config.routerBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.routerApiKey}` },
        body: JSON.stringify({
          model: runtime.model,
          messages: [{ role: 'system', content: selected.prompt }, ...messages],
          temperature: runtime.temperature,
          max_tokens: runtime.maxTokens
        }),
        signal: controller.signal
      });

      const payload = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        usage.metrics.upstreamErrors += 1;
        usage.metrics.lastErrorAt = new Date().toISOString();
        const message = payload?.error?.message || payload?.message || `RouterAI вернул HTTP ${upstream.status}`;
        return res.status(upstream.status >= 500 ? 502 : upstream.status).json({ error: message });
      }

      const answer = payload?.choices?.[0]?.message?.content;
      if (!answer) {
        usage.metrics.upstreamErrors += 1;
        usage.metrics.lastErrorAt = new Date().toISOString();
        return res.status(502).json({ error: 'Модель не вернула текстовый ответ.' });
      }

      usage.metrics.successfulResponses += 1;
      return res.json({ answer, knowledgeCategories: selected.categories, remainingSession: quota.remainingSession });
    } catch (error) {
      usage.metrics.upstreamErrors += 1;
      usage.metrics.lastErrorAt = new Date().toISOString();
      console.error('RouterAI request failed:', error?.message || error);
      return res.status(502).json({
        error: error?.name === 'AbortError'
          ? 'Модель не ответила за отведённое время.'
          : 'Не удалось обратиться к AI-модели.'
      });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.post('/api/admin/login', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const ip = security.getClientIp(req);
    if (!security.loginAllowed(ip)) return res.status(429).json({ error: 'Слишком много попыток входа. Повторите позднее.' });
    if (config.sessionSecret.length < 32) {
      return res.status(503).json({ error: 'Вход администратора не настроен: требуется SESSION_SECRET длиной не менее 32 символов.' });
    }
    if (!config.adminPasswordHash && !config.adminPassword) {
      return res.status(503).json({ error: 'Пароль администратора не настроен.' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!security.safeEqual(email, config.adminEmail) || !security.verifyPassword(password)) {
      security.recordLoginFailure(ip);
      return res.status(401).json({ error: 'Неверный email или пароль.' });
    }

    security.clearLoginFailures(ip);
    usage.metrics.adminLogins += 1;
    security.setAdminCookie(req, res, security.createAdminToken(email));
    return res.json({ ok: true, email });
  });

  app.post('/api/admin/logout', (req, res) => {
    security.clearAdminCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/admin/status', security.requireAdmin, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ authenticated: true, email: req.admin.sub });
  });

  app.get('/api/admin/settings', security.requireAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(settingsView());
  });

  app.put('/api/admin/settings', security.requireAdmin, (req, res) => {
    applyRuntimeSettings(req.body || {});
    res.json({ ok: true, settings: settingsView() });
  });

  app.get('/api/admin/metrics', security.requireAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(usage.snapshot());
  });

  app.post('/api/admin/reload-kb', security.requireAdmin, (_req, res) => {
    try {
      const status = knowledge.reload();
      usage.metrics.knowledgeReloads += 1;
      res.json({
        ok: true,
        knowledgeFiles: status.files,
        knowledgeSections: status.sections,
        knowledgeLoadedAt: status.loadedAt
      });
    } catch (error) {
      res.status(500).json({ error: error?.message || 'Не удалось перезагрузить базу знаний.' });
    }
  });

  app.post('/api/admin/self-test', security.requireAdmin, (_req, res) => {
    const kb = knowledge.status();
    const checks = {
      apiKeyConfigured: Boolean(config.routerApiKey),
      modelConfigured: Boolean(runtime.model),
      sessionSecretStrong: config.sessionSecret.length >= 32,
      adminPasswordConfigured: Boolean(config.adminPasswordHash || config.adminPassword),
      passwordStoredAsHash: Boolean(config.adminPasswordHash),
      knowledgeLoaded: Boolean(kb.files.length && kb.sections),
      inviteCodeReady: runtime.publicMode !== 'INVITE_ONLY' || Boolean(config.inviteCode)
    };
    const critical = ['apiKeyConfigured','modelConfigured','sessionSecretStrong','adminPasswordConfigured','knowledgeLoaded','inviteCodeReady'];
    res.json({ ok: critical.every((key) => checks[key]), checks });
  });

  app.get('/admin', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(publicDir, 'admin.html'));
  });

  app.use(require('express').static(publicDir, {
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    index: 'index.html'
  }));

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Маршрут API не найден.' });
    return res.status(404).sendFile(path.join(publicDir, 'index.html'));
  });
}

module.exports = { registerRoutes };
