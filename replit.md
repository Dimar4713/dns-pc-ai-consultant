# DNS PC AI Consultant

Учебный AI-консультант по подбору совместимых комплектующих для сборки ПК на основе товарного среза DNS.ru.

## Как запустить

Workflow **Start application** запускает сервер автоматически:

```
PORT=5000 npm start
```

Откройте Preview — откроется чат-интерфейс. Нажмите ⚙, введите API-ключ RouterAI.ru и выберите модель.

## Стек

- **Node.js / Express** — сервер (`server.js`)
- **RouterAI.ru** (OpenAI-совместимый API) — LLM-бэкенд; ключ вводится пользователем в интерфейсе
- Статический фронтенд (`public/`)
- База знаний в Markdown (`data/knowledge-base-*.md`)
- Системный промпт (`prompts/system-prompt.md`)

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3000` (workflow использует `5000`) | Порт сервера |
| `ROUTERAI_BASE_URL` | `https://routerai.ru/api/v1` | Базовый URL RouterAI |

## Проверка

```bash
npm test   # три smoke-теста без расхода API-баланса
```

## User preferences

- Проект синхронизируется с GitHub-репозиторием `Dimar4713/dns-pc-ai-consultant` (ветка `dns-pc-ai-consultant`).
