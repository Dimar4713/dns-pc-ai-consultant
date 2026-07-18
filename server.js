'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROUTERAI_BASE_URL = (process.env.ROUTERAI_BASE_URL || 'https://routerai.ru/api/v1').replace(/\/$/, '');

const root = __dirname;
const dataDir = path.join(root, 'data');
const promptPath = path.join(root, 'prompts', 'system-prompt.md');

function loadKnowledgeBase() {
  const files = fs
    .readdirSync(dataDir)
    .filter((name) => /^knowledge-base(?:-\d+)?\.md$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));

  if (!files.length) {
    throw new Error('В каталоге data не найдены файлы knowledge-base*.md');
  }

  return {
    files,
    text: files
      .map((name) => fs.readFileSync(path.join(dataDir, name), 'utf8').trim())
      .filter(Boolean)
      .join('\n\n')
  };
}

const loadedKnowledge = loadKnowledgeBase();
const knowledgeBase = loadedKnowledge.text;
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
  res.json({
    ok: true,
    service: 'dns-pc-ai-consultant',
    knowledgeFiles: loadedKnowledge.files,
    knowledgeSections: kbSections.length
  });
});

app.post('/api/chat', async (req, res) => {
  const apiKey = String(req.body?.apiKey || '').trim();
  const model = String(req.body?.model || '').trim();
  const messages = sanitizeMessages(req.body?.messages);
  const maxTokens = Math.max(500, Math.min(8000, Number(req.body?.maxTokens) || 4000));
  const temperature = Math.max(0, Math.min(1, Number(req.body?.temperature) ?? 0.25));

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
        temperature,
        max_tokens: maxTokens
      })
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const upstreamMessage = payload?.error?.message || payload?.message || `RouterAI вернул HTTP ${upstream.status}`;
      return res.status(upstream.status).json({ error: upstreamMessage });
    }

    const choice = payload?.choices?.[0];
    const finishReason = choice?.finish_reason;
    const answer = choice?.message?.content;

    if (!answer) {
      console.error('RouterAI empty answer. finish_reason=%s payload=%s',
        finishReason,
        JSON.stringify(payload).slice(0, 500));

      let hint = '';
      if (finishReason === 'length') hint = ' Ответ обрезан лимитом токенов — попробуйте переспросить короче.';
      else if (finishReason === 'content_filter') hint = ' Ответ заблокирован фильтром модели.';
      else if (!choice) hint = ' Модель не вернула ни одного варианта ответа (choices пуст).';

      return res.status(502).json({ error: `Модель не вернула текстовый ответ.${hint}` });
    }

    res.json({ answer, model: payload?.model || model });
  } catch (error) {
    console.error('RouterAI request failed:', error?.message || error);
    res.status(502).json({ error: 'Не удалось обратиться к RouterAI. Проверьте сеть, ключ и выбранную модель.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DNS PC AI Consultant: http://0.0.0.0:${PORT}`);
  console.log(`База знаний: ${loadedKnowledge.files.join(', ')}; разделов: ${kbSections.length}`);
});
