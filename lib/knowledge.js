'use strict';

const fs = require('fs');
const path = require('path');

const alwaysIncludeTitles = [
  'Критические правила совместимости',
  'Алгоритм подбора сборки',
  'Ограничения данных и честность консультанта'
];

const categoryRoutes = [
  { id: 'memory', aliases: ['оперативн','озу','ram','ddr3','ddr4','ddr5','dimm','so-dimm','sodimm','тайминг','xmp','expo','памят','16 гб','32 гб','64 гб','128 гб'], titles: ['оперативная память','память dimm','примеры оперативной памяти'] },
  { id: 'monitor', aliases: ['монитор','экран','дисплей','герц','гц','full hd','1080p','1440p','2k','4k','ultrawide','oled','vesa'], titles: ['мониторы','соответствие монитора'] },
  { id: 'storage', aliases: ['ssd','hdd','nvme','накопител','диск','m.2','sata','хранилищ','архив'], titles: ['накопители','ssd','hdd'] },
  { id: 'peripherals', aliases: ['клавиатур','мыш','веб камер','веб-камер','гарнитур','наушник','микрофон','колонк','перифери'], titles: ['периферия и сетевые устройства','проверка периферии'] },
  { id: 'network', aliases: ['wi-fi','wifi','вай фай','bluetooth','блютуз','сетев','ethernet','адаптер'], titles: ['периферия и сетевые устройства','wi-fi и bluetooth'] },
  { id: 'audio', aliases: ['звук','аудио','asio','цап','звуковая карта','аудиоинтерфейс'], titles: ['периферия и сетевые устройства','звуковые карты'] },
  { id: 'cooling', aliases: ['кулер','охлажден','вентилятор','термопаст','сжо','радиатор','pwm','argb'], titles: ['систем охлаждения','дополнительные комплектующие','корпусные вентиляторы'] },
  { id: 'power', aliases: ['блок питания','бп','psu','ибп','ups','сетевой фильтр','розетк','12vhpwr','12v-2x6'], titles: ['блоков питания','дополнительные комплектующие','ибп и сетевые фильтры'] },
  { id: 'platform', aliases: ['процессор','cpu','материн','плата','сокет','чипсет','bios','ам4','ам5','am4','am5','lga'], titles: ['процессор','материнск','критические правила совместимости'] },
  { id: 'graphics', aliases: ['видеокарт','gpu','график','rtx','radeon','rx ','vram','видеопамят'], titles: ['видеокарт'] },
  { id: 'case', aliases: ['корпус','форм фактор','форм-фактор','atx','microatx','mini-itx','габарит'], titles: ['корпус','материнская плата и корпус'] }
];

const fullSetAliases = ['под ключ','полный комплект','полное рабочее место','рабочее место','компьютер целиком','все вместе','с монитором','с периферией'];

function normalize(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9+.-]+/gi, ' ').trim();
}

function tokenize(text) {
  return normalize(text).split(/\s+/).filter((word) => word.length >= 3);
}

function detectRoutes(text) {
  const normalizedText = normalize(text);
  const ids = new Set();
  for (const route of categoryRoutes) {
    if (route.aliases.some((alias) => normalizedText.includes(normalize(alias)))) ids.add(route.id);
  }
  if (fullSetAliases.some((alias) => normalizedText.includes(normalize(alias)))) {
    ['monitor','peripherals','network','audio','power'].forEach((id) => ids.add(id));
  }
  return [...ids];
}

function splitKnowledgeBase(markdown) {
  return markdown.split(/\n(?=##?\s)/g).map((part) => part.trim()).filter(Boolean).map((text, index) => ({
    id: index,
    title: text.match(/^#{1,3}\s+(.+)$/m)?.[1] || `Раздел ${index + 1}`,
    text
  }));
}

function createKnowledgeService(root) {
  const dataDir = path.join(root, 'data');
  const promptPath = path.join(root, 'prompts', 'system-prompt.md');
  let files = [];
  let baseSystemPrompt = '';
  let sections = [];
  let loadedAt = '';

  function reload() {
    files = fs.readdirSync(dataDir)
      .filter((name) => /^knowledge-base(?:-\d+)?\.md$/i.test(name))
      .sort((a, b) => a.localeCompare(b, 'en'));
    if (!files.length) throw new Error('В каталоге data не найдены файлы knowledge-base*.md');
    const text = files.map((name) => fs.readFileSync(path.join(dataDir, name), 'utf8').trim()).filter(Boolean).join('\n\n');
    baseSystemPrompt = fs.readFileSync(promptPath, 'utf8');
    sections = splitKnowledgeBase(text);
    loadedAt = new Date().toISOString();
    return status();
  }

  function select(messages, limit = 12, maxChars = 40000) {
    const recentText = messages.slice(-10).map((message) => message.content).join(' ');
    const queryTokens = new Set(tokenize(recentText));
    const categoryIds = detectRoutes(recentText);
    const matchedRoutes = categoryRoutes.filter((route) => categoryIds.includes(route.id));

    const ordered = sections.map((section) => {
      let score = 0;
      for (const token of tokenize(`${section.title} ${section.text}`)) {
        if (queryTokens.has(token)) score += token.length > 7 ? 3 : 1;
      }
      const mandatory = alwaysIncludeTitles.some((title) => section.title.includes(title));
      const routeHits = matchedRoutes.filter((route) => route.titles.some((part) => normalize(section.title).includes(normalize(part))));
      if (mandatory) score += 500;
      if (routeHits.length) score += 900 + routeHits.length * 100;
      return { ...section, score, mandatory, routeHits: routeHits.map((route) => route.id) };
    }).sort((a, b) => (b.score - a.score) || (a.id - b.id));

    const selected = [];
    let totalChars = 0;
    for (const section of ordered) {
      const required = section.mandatory || section.routeHits.length > 0;
      if (!required && (selected.length >= limit || section.score <= 0)) continue;
      const nextLength = section.text.length + (selected.length ? 9 : 0);
      if (totalChars + nextLength > maxChars && !required) continue;
      selected.push(section);
      totalChars += nextLength;
    }

    return {
      text: selected.map((section) => section.text).join('\n\n---\n\n'),
      categories: categoryIds,
      sectionTitles: selected.map((section) => section.title)
    };
  }

  function buildSystemPrompt(messages) {
    const selected = select(messages);
    const routingNote = selected.categories.length
      ? `\n\n# ОПРЕДЕЛЕННЫЕ КАТЕГОРИИ ЗАПРОСА\n${selected.categories.join(', ')}`
      : '';
    return {
      prompt: `${baseSystemPrompt}${routingNote}\n\n# РЕЛЕВАНТНЫЕ ФРАГМЕНТЫ БАЗЫ ЗНАНИЙ\n${selected.text}`,
      categories: selected.categories
    };
  }

  function status() {
    return { files, sections: sections.length, loadedAt, categoryRoutes: categoryRoutes.map((route) => route.id) };
  }

  reload();
  return { reload, buildSystemPrompt, status };
}

module.exports = { createKnowledgeService };
