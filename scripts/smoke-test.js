'use strict';

const http = require('http');
const { spawn } = require('child_process');

const MOCK_PORT = 3999;
const APP_PORT = 3998;

const mock = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/chat/completions') {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    const userText = parsed?.messages?.filter((m) => m.role === 'user').at(-1)?.content || '';
    const systemText = parsed?.messages?.find((m) => m.role === 'system')?.content || '';
    const catalogIncluded = systemText.includes('Расширенный каталог моделей DNS с ценами и ссылками')
      && systemText.includes('https://www.dns-shop.ru/product/');
    const answer = `Тестовая консультация принята: ${userText.slice(0, 80)}. Проверены сокет, тип памяти, корпус, БП и охлаждение. Каталог: ${catalogIncluded ? 'подключен' : 'не найден'}.`;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      model: parsed.model,
      choices: [{ message: { role: 'assistant', content: answer } }]
    }));
  });
});

async function waitForHealth(url, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Приложение не запустилось вовремя');
}

async function run() {
  await new Promise((resolve) => mock.listen(MOCK_PORT, '127.0.0.1', resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: require('path').join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(APP_PORT),
      ROUTERAI_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForHealth(`http://127.0.0.1:${APP_PORT}/api/health`);
    const scenarios = [
      'Игровой ПК до 100000 рублей, Full HD 144 Гц.',
      'Монтаж 4K, 64 ГБ памяти, тихая система и Wi-Fi.',
      'Офисный microATX ПК без видеокарты, 32 ГБ и SSD 1 ТБ.'
    ];

    for (const content of scenarios) {
      const response = await fetch(`http://127.0.0.1:${APP_PORT}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: 'test-key',
          model: 'deepseek/deepseek-v4-pro',
          messages: [{ role: 'user', content }]
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.answer?.includes('Проверены сокет') || !payload.answer?.includes('Каталог: подключен')) {
        throw new Error(`Тест не пройден: ${JSON.stringify(payload)}`);
      }
      console.log(`PASS: ${content}`);
    }
    console.log('Все 3 smoke-теста пройдены.');
  } finally {
    child.kill('SIGTERM');
    mock.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
