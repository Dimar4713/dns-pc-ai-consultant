'use strict';

const http = require('http');
const { spawn } = require('child_process');

const MOCK_PORT = 3999;
const APP_PORT = 3998;

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

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}

    const userText = parsed?.messages?.filter((m) => m.role === 'user').at(-1)?.content || '';
    const systemText = parsed?.messages?.find((m) => m.role === 'system')?.content || '';
    const flags = Object.fromEntries(
      Object.entries(markers).map(([key, marker]) => [key, systemText.includes(marker)])
    );
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
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Приложение не запустилось вовремя');
}

async function ask(content) {
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
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
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
    const health = await waitForHealth(`http://127.0.0.1:${APP_PORT}/api/health`);
    if (!health.categoryRoutes?.includes('memory') || !health.categoryRoutes?.includes('monitor')) {
      throw new Error(`Маршруты категорий не загрузились: ${JSON.stringify(health)}`);
    }

    const scenarios = [
      {
        content: 'Игровой ПК до 100000 рублей, Full HD 144 Гц.',
        expect: ['Каталог=да']
      },
      {
        content: 'Монтаж 4K, 64 ГБ оперативной памяти, тихая система и Wi-Fi.',
        expect: ['RAM=да']
      },
      {
        content: 'Офисный microATX ПК без видеокарты, 32 ГБ и SSD 1 ТБ.',
        expect: ['RAM=да']
      },
      {
        content: 'Подбери комплект DDR5 32 ГБ 6000 МГц для AM5.',
        expect: ['RAM=да']
      },
      {
        content: 'Нужен монитор 27 дюймов 1440p 180–200 Гц для игр.',
        expect: ['Монитор=да']
      },
      {
        content: 'Добавь Wi-Fi, Bluetooth, клавиатуру, мышь и веб-камеру.',
        expect: ['Периферия=да']
      },
      {
        content: 'Собери компьютер под ключ с монитором и всей периферией.',
        expect: ['Монитор=да', 'Периферия=да', 'ПодКлюч=да']
      }
    ];

    for (const scenario of scenarios) {
      const payload = await ask(scenario.content);
      for (const expected of scenario.expect) {
        if (!payload.answer?.includes(expected)) {
          throw new Error(`Тест не пройден (${expected}): ${JSON.stringify(payload)}`);
        }
      }
      console.log(`PASS: ${scenario.content}`);
    }

    console.log(`Все ${scenarios.length} smoke-тестов пройдены.`);
  } finally {
    child.kill('SIGTERM');
    mock.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
