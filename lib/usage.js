'use strict';

function createUsage(config, hashIdentifier, getClientIp) {
  const usage = {
    date: new Date().toISOString().slice(0, 10),
    total: 0,
    byIp: new Map(),
    bySession: new Map()
  };

  const metrics = {
    startedAt: new Date().toISOString(),
    chatRequests: 0,
    successfulResponses: 0,
    upstreamErrors: 0,
    rejectedByLimit: 0,
    adminLogins: 0,
    knowledgeReloads: 0,
    lastChatAt: null,
    lastErrorAt: null
  };

  function resetIfNeeded() {
    const today = new Date().toISOString().slice(0, 10);
    if (usage.date === today) return;
    usage.date = today;
    usage.total = 0;
    usage.byIp.clear();
    usage.bySession.clear();
  }

  function validSessionId(value) {
    const text = String(value || '').trim();
    return /^[a-zA-Z0-9._-]{8,120}$/.test(text) ? text : '';
  }

  function consume(req) {
    resetIfNeeded();
    const ipKey = hashIdentifier(getClientIp(req));
    const sessionId = validSessionId(req.headers['x-session-id']) || `ip-${ipKey}`;
    const ipCount = usage.byIp.get(ipKey) || 0;
    const sessionCount = usage.bySession.get(sessionId) || 0;
    const runtime = config.runtime;

    if (usage.total >= runtime.globalDailyLimit) return { ok: false, error: 'Общий дневной лимит публичной демонстрации исчерпан.' };
    if (ipCount >= runtime.perIpDailyLimit) return { ok: false, error: 'Дневной лимит запросов для этого подключения исчерпан.' };
    if (sessionCount >= runtime.perSessionLimit) return { ok: false, error: 'Лимит сообщений в этом диалоге исчерпан. Начните новый диалог.' };

    usage.total += 1;
    usage.byIp.set(ipKey, ipCount + 1);
    usage.bySession.set(sessionId, sessionCount + 1);
    return { ok: true, remainingSession: Math.max(0, runtime.perSessionLimit - sessionCount - 1) };
  }

  function remainingFor(req) {
    resetIfNeeded();
    const sessionId = validSessionId(req.headers['x-session-id']);
    const used = sessionId ? (usage.bySession.get(sessionId) || 0) : 0;
    return Math.max(0, config.runtime.perSessionLimit - used);
  }

  function snapshot() {
    resetIfNeeded();
    return {
      ...metrics,
      usageDate: usage.date,
      dailyRequests: usage.total,
      uniqueConnectionsToday: usage.byIp.size,
      activeSessionsToday: usage.bySession.size
    };
  }

  return { metrics, consume, remainingFor, snapshot };
}

module.exports = { createUsage };
