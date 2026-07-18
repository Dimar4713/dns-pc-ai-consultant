'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROUTERAI_BASE_URL = (process.env.ROUTERAI_BASE_URL || 'https://routerai.ru/api/v1').replace(/\/$/, '');

const root = __dirname;
const kbPath = path.join(root, 'data', 'knowledge-base.md');
const promptPath = path.join(root, 'prompts', 'system-prompt.md');

const knowledgeBase = fs.readFileSync(kbPath, 'utf8');
const baseSystemPrompt = fs.readFileSync(promptPath, 'utf8');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(root, 'public')));

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9+.-]+/gi, ' ')
    .trim();
}

function tokenize(text) {
  return normalize(text)
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

function splitKnowledgeBase(markdown) {
  const sections = markdown.split(/\n(?=##?\s)/g).map((part) => part.trim()).filter(Boolean);
  return sections.map((text, index) => {
    const title = text.match(/^#{1,3}\s+(.+)$/m)?.[1] || `Раздел ${index + 1}`;
    return { title, text };
  });
}

const kbSections = splitKnowledgeBase(knowledgeBase);
const alwaysIncludeTitles = [
  'Критические правила совместимости',
  'Алгоритм подбора сборки',
  'Ограничения данных и честность консультанта'
];

function selectKnowledge(messages, limit = 7) {
  const recentText = messages.slice(-8).map((m) => m.content).join(' ');
  const queryTokens = new Set(tokenize(recentText));

  const scored = kbSections.map((section) => {
    const sectionTokens = tokenize(`${section.title} ${section.text}`);
    let score = 0;
    for (const token of sectionTokens) {
      if (queryTokens.has(token)) score += token.length > 7 ? 3 : 1;
    }
    if (alwaysIncludeTitles.some((title) => section.title.includes(title))) score += 100;
    return { ...section, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((section) => section.text)
    .join('\n\n---\n\n');
}

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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'dns-pc-ai-consultant' });
});

app.post('/api/chat', async (req, res) => {
  const apiKey = String(req.body?.apiKey || '').trim();
  const model = String(req.body?.model || '').trim();
  const messages = sanitizeMessages(req.body?.messages);

  if (!apiKey) return res.status(400).json({ error: 'Укажите API-ключ RouterAI в настройках.' });
  if (!model) return res.status(400).json({ error: 'Выберите модель RouterAI.' });
  if (!messages.length || messages.at(-1).role !== 'user') {
    return res.status(400).json({ error: 'Отсутствует сообщение пользователя.' });
  }

  const relevantKnowledge = selectKnowledge(messages);
  const systemPrompt = `${baseSystemPrompt}\n\n# РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ БАЗЫ ЗНАНИЙ\n${relevantKnowledge}`;

  try {
    const upstream = await fetch(`${ROUTERAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.25,
        max_tokens: 1700
      })
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const upstreamMessage = payload?.error?.message || payload?.message || `RouterAI вернул HTTP ${upstream.status}`;
      return res.status(upstream.status).json({ error: upstreamMessage });
    }

    const answer = payload?.choices?.[0]?.message?.content;
    if (!answer) return res.status(502).json({ error: 'Модель не вернула текстовый ответ.' });

    res.json({ answer, model: payload?.model || model });
  } catch (error) {
    console.error('RouterAI request failed:', error?.message || error);
    res.status(502).json({ error: 'Не удалось обратиться к RouterAI. Проверьте сеть, ключ и выбранную модель.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DNS PC AI Consultant: http://0.0.0.0:${PORT}`);
});
