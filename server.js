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
    return { id: index, title, text };
  });
}

const kbSections = splitKnowledgeBase(knowledgeBase);
const alwaysIncludeTitles = [
  'Критические правила совместимости',
  'Алгоритм подбора сборки',
  'Ограничения данных и честность консультанта'
];

const categoryRoutes = [
  {
    id: 'memory',
    aliases: ['оперативн', 'озу', 'ram', 'ddr3', 'ddr4', 'ddr5', 'dimm', 'so-dimm', 'sodimm', 'тайминг', 'xmp', 'expo', 'памят', '16 гб', '32 гб', '64 гб', '128 гб'],
    titles: ['оперативная память', 'память dimm', 'примеры оперативной памяти']
  },
  {
    id: 'monitor',
    aliases: ['монитор', 'экран', 'дисплей', 'герц', 'гц', 'full hd', '1080p', '1440p', '2k', '4k', 'ultrawide', 'oled', 'vesa'],
    titles: ['мониторы', 'соответствие монитора']
  },
  {
    id: 'storage',
    aliases: ['ssd', 'hdd', 'nvme', 'накопител', 'диск', 'm.2', 'sata', 'хранилищ', 'архив'],
    titles: ['накопители', 'ssd', 'hdd']
  },
  {
    id: 'peripherals',
    aliases: ['клавиатур', 'мыш', 'веб камер', 'веб-камер', 'гарнитур', 'наушник', 'микрофон', 'колонк', 'перифери'],
    titles: ['периферия и сетевые устройства', 'проверка периферии']
  },
  {
    id: 'network',
    aliases: ['wi-fi', 'wifi', 'вай фай', 'bluetooth', 'блютуз', 'сетев', 'ethernet', 'адаптер'],
    titles: ['периферия и сетевые устройства', 'wi-fi и bluetooth']
  },
  {
    id: 'audio',
    aliases: ['звук', 'аудио', 'asio', 'цап', 'звуковая карта', 'аудиоинтерфейс'],
    titles: ['периферия и сетевые устройства', 'звуковые карты']
  },
  {
    id: 'cooling',
    aliases: ['кулер', 'охлажден', 'вентилятор', 'термопаст', 'сжо', 'радиатор', 'pwm', 'argb'],
    titles: ['систем охлаждения', 'дополнительные комплектующие', 'корпусные вентиляторы']
  },
  {
    id: 'power',
    aliases: ['блок питания', 'бп', 'psu', 'ибп', 'ups', 'сетевой фильтр', 'розетк', '12vhpwr', '12v-2x6'],
    titles: ['блоков питания', 'дополнительные комплектующие', 'ибп и сетевые фильтры']
  },
  {
    id: 'platform',
    aliases: ['процессор', 'cpu', 'материн', 'плата', 'сокет', 'чипсет', 'bios', 'ам4', 'ам5', 'am4', 'am5', 'lga'],
    titles: ['процессор', 'материнск', 'критические правила совместимости']
  },
  {
    id: 'graphics',
    aliases: ['видеокарт', 'gpu', 'график', 'rtx', 'radeon', 'rx ', 'vram', 'видеопамят'],
    titles: ['видеокарт']
  },
  {
    id: 'case',
    aliases: ['корпус', 'форм фактор', 'форм-фактор', 'atx', 'microatx', 'mini-itx', 'габарит'],
    titles: ['корпус', 'материнская плата и корпус']
  }
];

const fullSetAliases = [
  'под ключ',
  'полный комплект',
  'полное рабочее место',
  'рабочее место',
  'компьютер целиком',
  'все вместе',
  'с монитором',
  'с периферией'
];

function includesAlias(normalizedText, alias) {
  return normalizedText.includes(normalize(alias));
}

function detectRoutes(text) {
  const normalizedText = normalize(text);
  const ids = new Set();

  for (const route of categoryRoutes) {
    if (route.aliases.some((alias) => includesAlias(normalizedText, alias))) {
      ids.add(route.id);
    }
  }

  if (fullSetAliases.some((alias) => includesAlias(normalizedText, alias))) {
    ['monitor', 'peripherals', 'network', 'audio', 'power'].forEach((id) => ids.add(id));
  }

  return [...ids];
}

function sectionMatchesRoute(section, route) {
  const normalizedTitle = normalize(section.title);
  return route.titles.some((part) => normalizedTitle.includes(normalize(part)));
}

function selectKnowledge(messages, limit = 12, maxChars = 65000) {
  const recentText = messages.slice(-10).map((m) => m.content).join(' ');
  const queryTokens = new Set(tokenize(recentText));
  const matchedRouteIds = detectRoutes(recentText);
  const matchedRoutes = categoryRoutes.filter((route) => matchedRouteIds.includes(route.id));

  const scored = kbSections.map((section) => {
    const sectionTokens = tokenize(`${section.title} ${section.text}`);
    let score = 0;

    for (const token of sectionTokens) {
      if (queryTokens.has(token)) score += token.length > 7 ? 3 : 1;
    }

    const mandatory = alwaysIncludeTitles.some((title) => section.title.includes(title));
    const routeHits = matchedRoutes.filter((route) => sectionMatchesRoute(section, route));

    if (mandatory) score += 500;
    if (routeHits.length) score += 900 + routeHits.length * 100;

    return {
      ...section,
      score,
      mandatory,
      routeHits: routeHits.map((route) => route.id)
    };
  });

  const ordered = scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id - b.id;
  });

  const selected = [];
  let totalChars = 0;

  for (const section of ordered) {
    const mustTake = section.mandatory || section.routeHits.length > 0;
    if (!mustTake && selected.length >= limit) continue;
    if (!mustTake && section.score <= 0) continue;

    const separatorLength = selected.length ? 9 : 0;
    const nextLength = section.text.length + separatorLength;
    if (totalChars + nextLength > maxChars && !mustTake) continue;

    selected.push(section);
    totalChars += nextLength;

    if (selected.length >= limit && !ordered.some((item) =>
      !selected.some((current) => current.id === item.id) && (item.mandatory || item.routeHits.length > 0))) {
      break;
    }
  }

  return {
    text: selected.map((section) => section.text).join('\n\n---\n\n'),
    categories: matchedRouteIds,
    sections: selected.map((section) => section.title)
  };
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
    knowledgeSections: kbSections.length,
    categoryRoutes: categoryRoutes.map((route) => route.id)
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

  const selectedKnowledge = selectKnowledge(messages);
  const routingNote = selectedKnowledge.categories.length
    ? `\n\n# ОПРЕДЕЛЕННЫЕ КАТЕГОРИИ ЗАПРОСА\n${selectedKnowledge.categories.join(', ')}`
    : '';
  const systemPrompt = `${baseSystemPrompt}${routingNote}\n\n# РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ БАЗЫ ЗНАНИЙ\n${selectedKnowledge.text}`;

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

    res.json({
      answer,
      model: payload?.model || model,
      knowledgeCategories: selectedKnowledge.categories
    });
  } catch (error) {
    console.error('RouterAI request failed:', error?.message || error);
    res.status(502).json({ error: 'Не удалось обратиться к RouterAI. Проверьте сеть, ключ и выбранную модель.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DNS PC AI Consultant: http://0.0.0.0:${PORT}`);
  console.log(`База знаний: ${loadedKnowledge.files.join(', ')}; разделов: ${kbSections.length}`);
});
