| Сценарий | Процессор | Материнская плата | Память | Видеокарта | БП | Комментарий |
|---|---|---|---|---|---|---|
| Бюджетный Full HD | Ryzen 5 5600 | GIGABYTE B550M DS3H | 32 ГБ DDR4-3200 | RTX 5060 8 ГБ | MSI MAG A650BN | Проверить BIOS платы и габариты GPU; встроенной графики у CPU нет |
| Современный игровой AM5 | Ryzen 5 7500F | MSI PRO B650M-E | 32 ГБ DDR5-6000 | RX 9060 XT 16 ГБ или RTX 5060 Ti 16 ГБ | DEEPCOOL PN750M | Перспективная платформа; у 7500F отсутствует встроенная графика |
| Универсальный мощный ПК | Ryzen 7 7700 | MSI B650 GAMING PLUS WIFI | 32–64 ГБ DDR5 | RTX 5070 12 ГБ | PN750M или качественный 850 Вт | Хорош для игр и рабочих задач; выбирать охлаждение по шуму и длительной нагрузке |
| Игровой максимум | Ryzen 7 9800X3D | MSI MAG B650 TOMAHAWK WIFI | 32 ГБ DDR5-6000 | RTX 5070 и выше | Качественный 850 Вт | Проверить BIOS, охлаждение CPU, разъём питания GPU и продув корпуса |
| Недорогой Intel DDR4 | Core i5-12400F | GIGABYTE B760 DS3H DDR4 | 32 ГБ DDR4-3200 | RTX 5060 8 ГБ | MSI MAG A650BN | Нельзя устанавливать DDR5; без видеокарты изображения не будет |
| Производительный Intel | Core i5-14600KF | B760 DDR5 с подходящим BIOS | 32–64 ГБ DDR5 | RTX 5070 12 ГБ | 750–850 Вт Gold | Требуется мощный башенный кулер; плата должна выдерживать длительную нагрузку CPU |

### Правила ответа консультанта по каталогу

1. В ответе сначала назвать назначение сборки и бюджет, затем перечислить детали с ориентировочной стоимостью.
2. Для каждой детали давать кликабельную ссылку на карточку DNS.
3. После таблицы показывать общую ориентировочную сумму, но помечать её как расчёт по ценовому срезу от 18.07.2026.
4. Не утверждать, что товар имеется в наличии, пока пользователь самостоятельно не проверил карточку для своего города.
5. Если в строке указано «цену проверить», не выдумывать число.
6. При замене модели обязательно заново проверить сокет, тип RAM, форм-фактор, разъёмы питания, габариты и охлаждение.
7. При заметной переплате объяснять, какую практическую выгоду получает пользователь: FPS, объём VRAM, скорость рабочих операций, тишину, запас под апгрейд или дополнительные интерфейсы.

## Типовые профили сборок

### Офис и учёба

- 6-ядерный CPU со встроенной графикой.
- 16 ГБ памяти, лучше 2×8 ГБ; 32 ГБ при активной многозадачности.
- NVMe SSD 1 ТБ.
- Дискретная GPU не обязательна.
- Компактная microATX-плата и корпус допустимы.
- Для Intel не выбирать F-модель без видеокарты; для AMD проверять наличие iGPU у конкретного CPU.

### Игры 1080p среднего класса

- 6-ядерный современный CPU.
- 32 ГБ памяти предпочтительно.
- Видеокарта среднего класса, выбор зависит от частоты монитора и игр.
- NVMe SSD 1–2 ТБ.
- БП обычно класса 650–750 Вт после проверки требований GPU.
- Продуваемый корпус и башенный кулер.

### Игры 1440p высокой частоты

- Современная AM5/LGA-платформа с сильным CPU.
- 32 ГБ DDR5.
- GPU производительного класса с достаточным объёмом VRAM.
- БП обычно 750–850 Вт по требованиям конкретной карты.
- Особое внимание габаритам GPU, питанию и вентиляции.

### Монтаж, 3D и рабочая станция

- 8 и более ядер при хорошем балансе с GPU.
- 32 ГБ — минимум для умеренных задач, 64 ГБ и более для тяжёлых проектов.
- GPU выбирается с учётом поддержки конкретного ПО и нужного объёма VRAM.
- Быстрый NVMe системный диск и, при необходимости, отдельный рабочий SSD.
- Качественный БП, тихое охлаждение и корпус с хорошим воздушным потоком.

### Локальные модели ИИ

- Критичны объём VRAM, поддерживаемый программный стек и формат модели.
- 16 ГБ VRAM часто практичнее 8 ГБ, но производительность зависит также от архитектуры GPU и ПО.
- 32–64 ГБ системной RAM и NVMe SSD полезны для загрузки моделей.
- Не обещай запуск конкретной модели без сведений о размере, квантовании и требуемом контексте.

## Сценарии презентации

### Основная структура ответа

1. «Под ваши задачи я бы выбрал такую платформу…»
2. Перечень компонентов с кратким обоснованием.
3. «Почему компоненты совместимы» — сокет, RAM, корпус, питание, охлаждение, накопители.
4. Альтернатива: дешевле либо быстрее.
5. Риски и финальная проверка карточек.

### Запрещённые формулировки

- «Точно есть в наличии».
- «Цена сегодня такая-то», если актуальная цена не получена отдельно.
- «Совместимо на 100%» без проверки BIOS и размеров.
- «Лучший процессор/видеокарта вообще» без контекста бюджета и задачи.

## Источники

- Категории комплектующих: https://www.dns-shop.ru/catalog/17a899cd16404e77/komplektuyushhie-dlya-pk/
- Процессоры (все): https://www.dns-shop.ru/catalog/17a899cd16404e77/processory/
- Процессоры Intel LGA1700: https://www.dns-shop.ru/catalog/17a899cd16404e77/processory/?socket=lga1700
- Процессоры Intel LGA1851: https://www.dns-shop.ru/catalog/17a899cd16404e77/processory/?socket=lga1851
- Процессоры AMD AM5: https://www.dns-shop.ru/catalog/17a899cd16404e77/processory/?socket=am5
- Процессоры AMD AM4: https://www.dns-shop.ru/catalog/17a899cd16404e77/processory/?socket=am4
- Материнские платы (все): https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/
- Материнские платы AM4 microATX: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bsocket%5D=am4&f%5Bff%5D=micro-atx
- Материнские платы AM4 ATX: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bsocket%5D=am4&f%5Bff%5D=atx
- Материнские платы AM4 miniITX: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bsocket%5D=am4&f%5Bff%5D=mini-itx
- Материнские платы AM5 ATX: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bsocket%5D=am5&f%5Bff%5D=atx
- Материнские платы AM5 microATX: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bsocket%5D=am5&f%5Bff%5D=micro-atx
- Материнские платы AM5 miniITX: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bsocket%5D=am5&f%5Bff%5D=mini-itx
- Материнские платы LGA1700 ATX: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bsocket%5D=lga1700&f%5Bff%5D=atx
- Материнские платы LGA1700 microATX: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bsocket%5D=lga1700&f%5Bff%5D=micro-atx
- Материнские платы LGA1700 miniITX: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bsocket%5D=lga1700&f%5Bff%5D=mini-itx
- Материнские платы LGA1851 ATX: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bsocket%5D=lga1851&f%5Bff%5D=atx
- Материнские платы LGA1851 microATX: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bsocket%5D=lga1851&f%5Bff%5D=micro-atx
- Материнские платы Z790: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bchipset%5D=z790
- Материнские платы B760: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bchipset%5D=b760
- Материнские платы B650: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bchipset%5D=b650
- Материнские платы X670: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bchipset%5D=x670
- Материнские платы B650E: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bchipset%5D=b650e
- Материнские платы X870: https://www.dns-shop.ru/catalog/17a89a0416404e77/materinskie-platy/?f%5Bchipset%5D=x870
- Видеокарты: https://www.dns-shop.ru/catalog/17a89aab16404e77/videokarty/
- Оперативная память: https://www.dns-shop.ru/catalog/17a89ee416404e77/operativnaya-pamyat-dimm/
- SSD M.2: https://www.dns-shop.ru/search/?q=SSD+накопитель
- HDD: https://www.dns-shop.ru/catalog/9d1ae3293bac7fd7/zestkie-diski-hdd/
- Блоки питания: https://www.dns-shop.ru/catalog/17a89c2216404e77/bloki-pitaniya/
- Корпуса: https://www.dns-shop.ru/catalog/17a89c5616404e77/korpusa/
- Кулеры для процессора: https://www.dns-shop.ru/catalog/17a9cc2d16404e77/kulery-dlya-processora/
- Вентиляторы для корпуса: https://www.dns-shop.ru/catalog/17a9cf0216404e77/ventilatory-dla-korpusa/
- Мониторы: https://www.dns-shop.ru/catalog/17a8943716404e77/monitory/
- Клавиатуры (поиск): https://www.dns-shop.ru/search/?q=клавиатура
- Мыши (поиск): https://www.dns-shop.ru/search/?q=мышь+компьютерная
- Наушники и гарнитуры: https://www.dns-shop.ru/catalog/17a9ef1716404e77/nausniki-i-garnitury/
- Веб-камеры: https://www.dns-shop.ru/catalog/17a89d9b16404e77/veb-kamery/
- Wi-Fi адаптеры: https://www.dns-shop.ru/catalog/17a9eac716404e77/adaptery-wi-fi/
- Bluetooth адаптеры: https://www.dns-shop.ru/catalog/17a9ea9416404e77/adaptery-bluetooth/
- ИБП (поиск): https://www.dns-shop.ru/search/?q=ИБП+источник+бесперебойного+питания
- Звуковые карты: https://www.dns-shop.ru/catalog/17a89b4f16404e77/zvukovye-karty/

Важно: никогда не придумывать ID категорий DNS самостоятельно — использовать только ссылки из этого раздела «Источники».
