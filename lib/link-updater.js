'use strict';

const fs = require('fs');
const path = require('path');

const PRODUCT_URL_RE = /\[([^\]]+)\]\((https:\/\/www\.dns-shop\.ru\/product\/[^)\s]+)\)/g;
const PRODUCT_HREF_RE = /href=["'](\/product\/[a-f0-9]{16}\/[^"'#?]+\/?)["']/gi;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function normalize(value) {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
}
function tokens(value) { return new Set(normalize(value).split(/\s+/).filter((x) => x.length >= 2)); }
function partNumber(value) {
  const matches = String(value || '').match(/\[([^\]]{4,})\]/g) || [];
  return matches.map((x) => x.slice(1, -1)).find((x) => /[a-z]/i.test(x) && /\d/.test(x)) || '';
}
function scoreCandidate(label, href) {
  const a = tokens(label);
  const b = tokens(decodeURIComponent(href).replace(/-/g, ' '));
  if (!a.size) return 0;
  let hit = 0;
  for (const item of a) if (b.has(item)) hit += 1;
  return hit / a.size;
}

async function fetchText(url, timeoutMs, userAgent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal
    });
    const text = await response.text().catch(() => '');
    return { ok: response.ok && !/страница не найдена|товар не найден/i.test(text), status: response.status, url: response.url, text };
  } finally { clearTimeout(timer); }
}

function createLinkUpdater(root, config, knowledge) {
  const dataDir = path.join(root, 'data');
  const reportPath = path.join(dataDir, 'dns-link-update-report.json');
  let running = false;
  let lastReport = null;
  let timer = null;

  function status() { return { running, scheduled: Boolean(timer), lastReport }; }

  async function findReplacement(label) {
    const exactPart = partNumber(label);
    const query = exactPart || label;
    const searchUrl = `https://www.dns-shop.ru/search/?q=${encodeURIComponent(query)}`;
    const result = await fetchText(searchUrl, config.dnsLinkTimeoutMs, config.dnsLinkUserAgent);
    if (!result.ok) return { replacement: '', confidence: 0, reason: `search-http-${result.status}`, searchUrl };

    const unique = [...new Set([...result.text.matchAll(PRODUCT_HREF_RE)].map((m) => m[1]))];
    const ranked = unique.map((href) => ({ href, score: scoreCandidate(label, href) })).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best) return { replacement: '', confidence: 0, reason: 'no-candidates', searchUrl };

    const slug = normalize(decodeURIComponent(best.href).replace(/-/g, ' '));
    const exact = exactPart && slug.includes(normalize(exactPart));
    const second = ranked[1]?.score || 0;
    const confident = exact || (best.score >= 0.72 && best.score - second >= 0.12);
    return {
      replacement: confident ? `https://www.dns-shop.ru${best.href}` : '',
      confidence: exact ? 1 : best.score,
      reason: confident ? (exact ? 'exact-part-number' : 'unique-name-match') : 'ambiguous',
      searchUrl
    };
  }

  async function run({ write = true } = {}) {
    if (running) throw new Error('Проверка ссылок уже выполняется.');
    running = true;
    const startedAt = new Date().toISOString();
    const report = { startedAt, finishedAt: null, checked: 0, valid: 0, updated: 0, unresolved: 0, errors: 0, changes: [], unresolvedItems: [] };

    try {
      const files = fs.readdirSync(dataDir).filter((name) => /^knowledge-base(?:-\d+)?\.md$/i.test(name)).sort();
      for (const name of files) {
        const filePath = path.join(dataDir, name);
        let content = fs.readFileSync(filePath, 'utf8');
        const matches = [...content.matchAll(PRODUCT_URL_RE)];
        for (const match of matches) {
          const [full, label, oldUrl] = match;
          report.checked += 1;
          try {
            const checked = await fetchText(oldUrl, config.dnsLinkTimeoutMs, config.dnsLinkUserAgent);
            if (checked.ok && checked.url.includes('/product/')) { report.valid += 1; }
            else {
              const found = await findReplacement(label);
              if (found.replacement && found.replacement !== oldUrl) {
                content = content.replace(full, `[${label}](${found.replacement})`);
                report.updated += 1;
                report.changes.push({ file: name, label, from: oldUrl, to: found.replacement, confidence: found.confidence, reason: found.reason });
              } else {
                report.unresolved += 1;
                report.unresolvedItems.push({ file: name, label, url: oldUrl, status: checked.status, searchUrl: found.searchUrl, reason: found.reason });
              }
            }
          } catch (error) {
            report.errors += 1;
            report.unresolvedItems.push({ file: name, label, url: oldUrl, reason: error?.message || 'request-failed' });
          }
          await sleep(config.dnsLinkDelayMs);
        }
        if (write && report.changes.some((item) => item.file === name)) fs.writeFileSync(filePath, content, 'utf8');
      }
      report.finishedAt = new Date().toISOString();
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
      if (write && report.updated) knowledge.reload();
      lastReport = report;
      return report;
    } finally { running = false; }
  }

  function scheduleDaily() {
    if (!config.dnsLinkAutoUpdate || timer) return;
    const scheduleNext = () => {
      const now = new Date();
      const next = new Date(now);
      next.setUTCHours(config.dnsLinkUpdateHourUtc, 0, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      timer = setTimeout(async () => {
        timer = null;
        try { await run({ write: true }); } catch (error) { console.error('DNS link update failed:', error); }
        scheduleNext();
      }, next.getTime() - now.getTime());
      timer.unref?.();
      console.log(`Следующая проверка DNS-ссылок: ${next.toISOString()}`);
    };
    scheduleNext();
  }

  return { run, status, scheduleDaily };
}

module.exports = { createLinkUpdater };
