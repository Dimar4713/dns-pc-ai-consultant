# AGENTS.md — DNS PC AI Consultant

## Scope

Эти правила обязательны для всего `dns-pc-ai-consultant`. Более узкий `AGENTS.md` MAY усиливать, но не ослаблять их.

Каноническое AIMETON-wide governance-ядро: `Dimar4713/aimeton-architecture/AGENTS.md`.

## Repository mission

Репозиторий — продуктовый пилот AI-консультанта по подбору совместимого ПК и рабочего места. Главные качества: корректная совместимость компонентов, доказуемая актуальность товарных данных, безопасная server-side LLM integration и честное разделение demo/production state.

## Before work

1. Прочитать `README.md`, knowledge/data/compatibility docs, конфигурацию, активные Issues/PR/CI и exact current SHA.
2. При межрепозиторной работе до первой mutation прочитать root `AGENTS.md` всех затрагиваемых репозиториев.
3. Для normative AIMETON решений читать `aimeton-architecture`; для deployment/network/provider/runner reality — `aimeton-infrastructure`.
4. Не принимать одну страницу DNS, один парсер, один LLM ответ или один deploy state за полный factual baseline.

## 3×3 Reality Check

Перед blocker, root-cause, compatibility claim, product-data claim, provider/network conclusion, security/cost decision или consequential write первое объяснение считается гипотезой.

Проверить architecture/lifecycle, alternatives/control paths, history/live; source/contract, runtime/live, independent evidence; выполнить falsification attempt.

`нет доступа к DNS`, `цена актуальна`, `компоненты совместимы`, `единственный путь`, `нужен пользователь`, `production работает` без этого gate являются provisional claims.

## GitHub / execution fallback

До просьбы о ручном действии владельца проверить:

`GitHub connector/API → AIMETON GitHub MCP/router → REST/GraphQL/gh через trusted AIMETON server → owner`.

Ограничение одного token/runner/workflow не является ограничением AIMETON как системы. Secret values не публикуются; сначала использовать существующие auth/secret contracts.

## Continuous Mission / Motor State

```text
READ → DECIDE → ACTION → READ-BACK → EVIDENCE → NEXT SAFE ACTION
```

После каждого material action проверить фактический результат и выполнить следующий безопасный шаг при отсутствии objective authority blocker. Отсутствие нового сообщения владельца не является blocker.

Держать очередь current → next → following. Перед завершением tool-сессии обязательны MOTOR-CHECK и STOP-CHECK. GREEN CI, successful smoke или один provider response не завершают product mission, если остаётся безопасный acceptance/deployment/data-quality шаг.

## Product-data truth boundary

1. Товарные данные, цены, наличие, характеристики и ссылки должны иметь source/provenance и freshness metadata, где это возможно.
2. Не представлять cached/fixture/demo data как live DNS truth.
3. Парсерный failure не доказывает отсутствие товара; проверить альтернативные permitted acquisition paths.
4. LLM не является источником совместимости компонентов. Формальные compatibility rules и проверяемые product attributes имеют приоритет.
5. При конфликте карточки товара, спецификации производителя и локальной базы конфликт фиксируется; не выбирать удобное значение молча.
6. Не ослаблять compatibility guard ради более привлекательной рекомендации.

## LLM / secrets / cost boundary

- Provider API keys, admin secrets, invite codes и session secrets остаются server-side и не публикуются.
- Public user не получает system prompt/provider credential/admin config.
- Paid/quota model calls требуют действующего budget/owner authority, измеримого usage и bounded retries.
- Provider outage, network failure, quota/budget limit и product-data deficiency должны оставаться разными typed causes.

## Cross-repository source-of-truth

Infrastructure/provider/runtime facts принадлежат canonical AIMETON repositories. Generated projections MUST pin canonical repository, exact source SHA, source path, immutable blob/object id и/или digest; drift проверяется fail-closed.

Не создавать локальный второй runner/provider controller или mutable infrastructure inventory ради обхода ограничения одного CI token.

## Authority boundary

Без owner authorization запрещены новые расходы, платные ресурсы, необратимые production/provider mutations, ослабление security/compatibility gates, изменение legal/license boundary и публикация secrets/private customer data.

## Definition of Done

Применимые пункты обязательны:

- code/tests/compatibility rules updated;
- product-data provenance/freshness checked;
- CI exact-SHA verified;
- stage/production read-back выполнен когда применимо;
- docs/status/evidence synchronized;
- next safe action выполнен либо зафиксирован exact blocker;
- strong conclusions прошли 3×3.
