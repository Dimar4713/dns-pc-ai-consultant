'use strict';

const crypto = require('crypto');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const MOCK_PORT = 3999;
const APP_PORT = 3998;
const ADMIN_PASSWORD = 'test-admin-password-2026';
const ADMIN_EMAIL = 'dimamarareskul@gmail.com';

function makePasswordHash(password) {
  const salt = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

const markers = {
  catalog: 'Расширенный каталог моделей DNS с ценами и ссылками',
  ram: 'Оперативная память DIMM: расширенный каталог',
  monitor: 'Мониторы: правила выбора',
  peripherals: 'Периферия и сетевые устройства',
  fullSet: 'Полный состав комплекта рабочего места'
};

const mock = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/chat/completions') {
    res.writeHead(404).end();
    return;
  }
  if (req.headers.authorization !== 'Bearer test-server-key') {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Нет серверного ключа' } }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    const userText = parsed?.messages?.filter((message) => message.role === 'user').at(-1)?.content || '';
    const systemText = parsed?.messages?.find((message) => message.role === 'system')?.content || '';
    const flags = Object.fromEntries(Object.entries(markers).map(([key, marker]) => [key, systemText.includes(marker)]));
    const hasDnsUrl = systemText.includes('https://www.dns-shop.ru/');
    const answer = [
      `Тестовая консультация принята: ${userText.slice(0, 80)}.`,
      `Каталог=${flags.catalog && hasDnsUrl ? 'да' : 'нет'}.`,
      `RAM=${flags.ram ? 'да' : 'нет'}.`,
      `Монитор=${flags.monitor ? 'да' : 'нет'}.`,
      `Периферия=${flags.peripherals ? 'да' : 'нет'}.`,
      `ПодКлюч=${flags.fullSet ? 'да' : 'нет'}.`
    ].join(' ');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: parsed.model, choices: [{ message: { role: 'assistant', content: answer } }] }));
  });
});

async function waitForHealth(url, attempts = 40) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Приложение не запустилось вовремя');
}

async function ask(content, session = crypto.randomUUID()) {
  const response = await fetch(`http://127.0.0.1:${APP_PORT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': session },
    body: JSON.stringify({ messages: [{ role: 'user', content }] })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function cookieFrom(response) {
  const header = response.headers.get('set-cookie') || '';
  return header.split(';')[0];
}

async function testAdmin() {
  const login = await fetch(`http://127.0.0.1:${APP_PORT}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });
  const loginPayload = await login.json();
  if (!login.ok) throw new Error(`Вход администратора не выполнен: ${JSON.stringify(loginPayload)}`);
  const cookie = cookieFrom(login);

  const status = await fetch(`http://127.0.0.1:${APP_PORT}/api/admin/status`, { headers: { Cookie: cookie } });
  if (!status.ok) throw new Error('Подписанная административная сессия не работает');

  const selfTest = await fetch(`http://127.0.0.1:${APP_PORT}/api/admin/self-test`, {
    method: 'POST', headers: { Cookie: cookie }
  });
  const selfTestPayload = await selfTest.json();
  if (!selfTest.ok || !selfTestPayload.ok) throw new Error(`Самодиагностика не пройдена: ${JSON.stringify(selfTestPayload)}`);
  console.log('PASS: административный вход и самодиагностика');
}

async function run() {
  await new Promise((resolve) => mock.listen(MOCK_PORT, '127.0.0.1', resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      ROUTERAI_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
      ROUTERAI_API_KEY: 'test-server-key',
      ROUTERAI_MODEL: 'deepseek/deepseek-v4-pro',
      SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
      ADMIN_EMAIL,
      ADMIN_PASSWORD_HASH: makePasswordHash(ADMIN_PASSWORD),
      PUBLIC_MODE: 'PUBLIC',
      PUBLIC_SESSION_MESSAGE_LIMIT: '20',
      PUBLIC_IP_DAILY_LIMIT: '100',
      PUBLIC_GLOBAL_DAILY_LIMIT: '1000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  try {
    const health = await waitForHealth(`http://127.0.0.1:${APP_PORT}/api/health`);
    if (!health.serviceReady || !health.categoryRoutes?.includes('memory') || !health.categoryRoutes?.includes('monitor')) {
      throw new Error(`Сервис не готов: ${JSON.stringify(health)}`);
    }

    const scenarios = [
      ['Игровой ПК до 100000 рублей, Full HD 144 Гц.', ['Каталог=да']],
      ['Монтаж 4K, 64 ГБ оперативной памяти, тихая система и Wi-Fi.', ['RAM=да']],
      ['Офисный microATX ПК без видеокарты, 32 ГБ и SSD 1 ТБ.', ['RAM=да']],
      ['Подбери комплект DDR5 32 ГБ 6000 МГц для AM5.', ['RAM=да']],
      ['Нужен монитор 27 дюймов 1440p 180–200 Гц для игр.', ['Монитор=да']],
      ['Добавь Wi-Fi, Bluetooth, клавиатуру, мышь и веб-камеру.', ['Периферия=да']],
      ['Собери компьютер под ключ с монитором и всей периферией.', ['Монитор=да', 'Периферия=да', 'ПодКлюч=да']]
    ];

    for (const [content, expectedItems] of scenarios) {
      const payload = await ask(content);
      for (const expected of expectedItems) {
        if (!payload.answer?.includes(expected)) {
          throw new Error(`Тест не пройден (${expected}): ${JSON.stringify(payload)}`);
        }
      }
      console.log(`PASS: ${content}`);
    }

    await testAdmin();
    console.log(`Все ${scenarios.length} сценариев и административные проверки пройдены.`);
  } finally {
    child.kill('SIGTERM');
    mock.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
