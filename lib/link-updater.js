'use strict';

const fs = require('fs');
const path = require('path');

const PRODUCT_URL_RE = /\[([^\]]+)\]\((https:\/\/www\.dns-shop\.ru\/product\/[^)\s]+)\)/g;
const SEARCH_URL_RE = /https:\/\/www\.dns-shop\.ru\/search\/\?q=/i;
const GENERIC_LABEL_RE = /^(открыть|карточка|карточка dns|подбор dns|смотреть|купить)$/i;

function cleanMarkdown(value) {
  return String(value || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>#|]/g, ' ')
    .replace(/\b(?:цена|стоимость)\s*[:—-]?\s*[\d\s]+\s*₽?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPartNumber(value) {
  const candidates = [...String(value || '').matchAll(/\[([^\]]{4,})\]/g)].map((match) => match[1].trim());
  return candidates.find((item) => /[a-zа-я]/i.test(item) && /\d/.test(item)) || '';
}

function usefulQuery(value) {
  const cleaned = cleanMarkdown(value)
    .replace(/\b(?:открыть|карточка|подбор|dns|dns-shop|магазин)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 4 ? cleaned.slice(0, 180) : '';
}

function inferQuery(content, matchIndex, label) {
  if (label && !GENERIC_LABEL_RE.test(label.trim())) {
    const labelPart = extractPartNumber(label);
    return labelPart || usefulQuery(label);
  }

  const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
  const lineEndRaw = content.indexOf('\n', matchIndex);
  const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw;
  const currentLine = content.slice(lineStart, lineEnd);
  const beforeLink = currentLine.slice(0, Math.max(0, matchIndex - lineStart));
  const currentPart = extractPartNumber(currentLine);
  if (currentPart) return currentPart;

  const currentQuery = usefulQuery(beforeLink);
  if (currentQuery) return currentQuery;

  let cursor = lineStart - 1;
  for (let i = 0; i < 4 && cursor > 0; i += 1) {
    const previousStart = content.lastIndexOf('\n', cursor - 1) + 1;
    const previousLine = content.slice(previousStart, cursor).trim();
    cursor = previousStart - 1;
    if (!previousLine) continue;
    const previousPart = extractPartNumber(previousLine);
    if (previousPart) return previousPart;
    const previousQuery = usefulQuery(previousLine);
    if (previousQuery) return previousQuery;
  }
  return '';
}

function createLinkUpdater(root, _config, knowledge) {
  const dataDir = path.join(root, 'data');
  const reportPath = path.join(dataDir, 'dns-link-update-report.json');
  let running = false;
  let lastReport = null;

  function status() {
    return {
      running,
      scheduled: false,
      mode: 'fallback-links',
      note: 'Серверная проверка DNS отключена: DNS возвращает HTTP 401 для Replit. Подготавливаются браузерные поисковые ссылки.',
      lastReport
    };
  }

  async function run({ write = true } = {}) {
    if (running) throw new Error('Подготовка ссылок уже выполняется.');
    running = true;
    const report = {
      mode: 'fallback-links',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      scanned: 0,
      enriched: 0,
      alreadyPrepared: 0,
      unresolved: 0,
      filesChanged: [],
      changes: [],
      unresolvedItems: [],
      warning: 'Прямые карточки DNS не проверялись: серверные запросы Replit блокируются HTTP 401.'
    };

    try {
      const files = fs.readdirSync(dataDir)
        .filter((name) => /^knowledge-base(?:-\d+)?\.md$/i.test(name))
        .sort();

      for (const name of files) {
        const filePath = path.join(dataDir, name);
        const original = fs.readFileSync(filePath, 'utf8');
        let content = original;
        const matches = [...original.matchAll(PRODUCT_URL_RE)].reverse();

        for (const match of matches) {
          const [full, rawLabel, productUrl] = match;
          const index = match.index || 0;
          report.scanned += 1;

          const lineEndRaw = original.indexOf('\n', index);
          const lineEnd = lineEndRaw === -1 ? original.length : lineEndRaw;
          const line = original.slice(original.lastIndexOf('\n', index) + 1, lineEnd);
          if (SEARCH_URL_RE.test(line)) {
            report.alreadyPrepared += 1;
            continue;
          }

          const query = inferQuery(original, index, rawLabel);
          if (!query) {
            report.unresolved += 1;
            report.unresolvedItems.push({ file: name, label: rawLabel, url: productUrl, reason: 'product-name-not-found' });
            continue;
          }

          const searchUrl = `https://www.dns-shop.ru/search/?q=${encodeURIComponent(query)}`;
          const directLabel = GENERIC_LABEL_RE.test(rawLabel.trim()) ? 'Карточка DNS' : rawLabel.trim();
          const replacement = `[${directLabel}](${productUrl}) · [Поиск DNS: ${query}](${searchUrl})`;
          content = `${content.slice(0, index)}${replacement}${content.slice(index + full.length)}`;
          report.enriched += 1;
          report.changes.push({ file: name, query, productUrl, searchUrl });
        }

        if (write && content !== original) {
          fs.writeFileSync(filePath, content, 'utf8');
          report.filesChanged.push(name);
        }
      }

      report.finishedAt = new Date().toISOString();
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
      if (write && report.filesChanged.length) knowledge.reload();
      lastReport = report;
      return report;
    } finally {
      running = false;
    }
  }

  function scheduleDaily() {
    console.log('Автообновление DNS-ссылок отключено: серверные запросы Replit блокируются DNS.');
  }

  return { run, status, scheduleDaily };
}

module.exports = { createLinkUpdater, inferQuery, cleanMarkdown };