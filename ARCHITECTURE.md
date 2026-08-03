# Caselog — архітектура

> Нормативний документ. Він визначає межі модулів і напрямок залежностей.
> Детальні правила коду, тестування та рев'ю описані в `docs/DEVELOPMENT.md`, а
> дорогі для зміни рішення — у `docs/adr/`.

## 1. Архітектурний стиль

Caselog — **модульний моноліт** із feature-first структурою.

- Один deployable backend і одна база даних.
- Бізнес-можливості ізольовані в модулях: `auth`, `projects`, `test-cases`,
  `test-runs`, `attachments` тощо.
- Усередині backend-модуля використовується шарова структура.
- Для зовнішніх систем використовуються ports and adapters.
- Multi-tenancy є системним інваріантом, а не опціональною перевіркою.

Це прагматична архітектура: ми не впроваджуємо мікросервіси, strict Clean
Architecture або rich DDD заради форми. Новий abstraction layer повинен захищати
реальну межу чи прибирати реальне дублювання.

```text
HTTP
  ↓
Controller
  ↓
Application service / use case
  ↓
Repository
  ↓
TenantDatabaseService / Prisma
  ↓
PostgreSQL + RLS
```

Напрямок залежностей у цій схемі односторонній. Нижній шар не імпортує верхній.

## 2. Межа модуля

Модуль володіє своєю поведінкою та внутрішньою реалізацією. Типова структура:

```text
test-runs/
  test-run.module.ts
  test-run.controller.ts
  test-run.service.ts
  test-run.repository.ts
  test-result.repository.ts
  junit-parser.ts
  *.spec.ts
```

Назви файлів відображають їхню відповідальність, а не технічний шаблон. Великий
repository можна розділити за агрегатом або окремим persistence workflow, але не
на довільні `helpers`.

### Public API модуля

- Nest-модуль експортує лише application services або явно названі public ports.
- Інший feature-модуль не імпортує чужі controllers, repositories, persistence
  types чи internal helpers.
- Взаємодія між feature-модулями відбувається через експортований service.
- Спільний API-контракт належить `packages/schemas`, а не одному з consumers.
- Циклічна залежність означає неправильну межу. `forwardRef()` не є виправленням.

### Дозволений напрямок імпортів

```text
feature controller → feature service → feature repository
feature            → core / common / @caselog/schemas
feature A           → exported service or public port of feature B
core / common       ✕ feature
feature A internals ✕ feature B internals
```

`core` містить технічні можливості застосунку: database, mail, storage,
configuration, health. `common` містить невеликі стабільні примітиви, які не
належать конкретній feature. Вони не повинні перетворюватися на каталог випадкових
helpers.

## 3. Відповідальність backend-шарів

### Controller

- Приймає HTTP-запит і дістає transport context.
- Валідує payload через спільну Zod-схему.
- Викликає один application service/use case.
- Повертає DTO або запускає transport-specific response, наприклад download.
- Не містить бізнес-рішень, Prisma-запитів або tenant authorization logic.

### Application service / use case

- Оркеструє бізнес-операцію.
- Перевіряє права та стан домену.
- Координує repositories і зовнішні ports.
- Кидає доменні помилки й не знає про HTTP status codes.
- Не викликає Prisma напряму.

Service не зобов'язаний бути великим. Якщо правило можна виразити чистою функцією,
service викликає її замість накопичення приватних методів.

### Repository

- Інкапсулює Prisma та форму збереження даних.
- Завжди приймає `organizationId` для tenant-owned даних.
- Відкриває tenant-scoped transaction через `TenantDatabaseService`.
- Може виконувати атомарний persistence workflow: read-modify-write, bulk insert,
  upsert або блокування рядків.
- Не знає про HTTP, guards, JWT чи UI.
- Не приймає бізнес-рішення, які можна обчислити без бази даних.

За замовчуванням repository володіє транзакцією своєї атомарної операції. Якщо один
use case має бути атомарним між кількома repositories, створюється явний
module-level Unit of Work. Сирий Prisma transaction client не передається в
controller і не стає загальною залежністю service layer.

#### Prisma і raw SQL

Prisma є default для звичайного CRUD. Parameterized raw SQL дозволений у repository
або `*.persistence.ts`, коли потрібні row locks, bulk operations, RLS context,
PostgreSQL-specific можливості чи виміряна оптимізація. `$queryRawUnsafe` і
`$executeRawUnsafe` заборонені. Tenant-owned SQL явно фільтрує `organization_id`
навіть за наявності RLS, має typed result та integration test із PostgreSQL.

SQL відповідає за читання, блокування й persistence. Бізнес-рішення до виконання
SQL приймає application/domain layer.

### Domain/pure logic

Парсинг, matching, status mapping, розрахунки та state transitions реалізуються як
невеликі typed pure functions, якщо їм не потрібні I/O або DI. Клас не створюється
лише заради OOP.

### Ports and adapters

S3, email, Jira, Monday та інші зовнішні системи ховаються за вузькими ports.
Infrastructure adapter реалізує port і підключається через DI. Інтерфейс для
кожного внутрішнього класу не потрібен; abstraction вводиться на реальній зовнішній
або змінній межі.

## 4. Multi-tenancy

Tenant isolation діє на кожному шляху до даних:

1. Org-scoped principal містить immutable `organizationId`.
2. Кожна tenant-owned таблиця має `organization_id`.
3. Repository вимагає `organizationId` у своєму public method.
4. `TenantDatabaseService` встановлює transaction-local
   `caselog.organization_id`.
5. PostgreSQL RLS обмежує видимі рядки.
6. Cross-tenant API test очікує `404` для чужого ресурсу.

Прямий доступ до tenant-owned Prisma models поза repository заборонений. Глобальні
таблиці та bootstrap-запити є явними винятками, а не способом обійти tenant scope.
Повне рішення описане в ADR 0002 і ADR 0006.

## 5. API та contracts

- REST API має префікс `/api/v1`.
- Zod-схеми в `packages/schemas` є спільним контрактом API і web-клієнта.
- DTO не віддає Prisma entities напряму.
- Усе, що вміє UI, має бути доступне через публічний API.
- Колекції використовують cursor pagination.
- CI/import workflows отримують bulk endpoints.
- Retryable create/write operations мають визначену idempotency semantics.

Зміна public contract, data model або іншого дорогого для відкату рішення потребує
ADR.

## 6. Frontend

Angular-застосунок також організований feature-first:

```text
app/
  core/                 # auth, interceptors, app-wide providers
  shared/               # reusable UI and API primitives
  features/
    auth/
    workspace/
      cases/
      projects/
      runs/
```

- Використовуються standalone components.
- Feature не імпортує internals іншої feature.
- `core` і `shared` не імпортують features.
- Route configuration композиціонує features на рівні застосунку.
- Компонент відповідає за presentation та UI events, але не виконує HTTP напряму.
- Feature API/service відповідає за server communication.
- Signals зберігають UI state; RxJS використовується для справжніх async streams.
- Спільний компонент переноситься в `shared` лише після появи стабільного спільного
  призначення, а не наперед.

## 7. Розмір і розбиття коду

Код розбивається за responsibility і reason to change, не за формальною кількістю
рядків.

Сигнали для розбиття:

- файл змішує transport, orchestration, persistence і pure logic;
- назва файлу перестала точно описувати його вміст;
- незалежні частини змінюються з різних причин;
- тести потребують надто великого setup для невеликого правила;
- файл наближається до 300–400 рядків або метод до 50–60 рядків.

Останній пункт є приводом для рев'ю, а не автоматичною помилкою. Краще один зв'язний
repository на 350 рядків, ніж п'ять абстракцій без власної відповідальності.

Тести розміщуються поруч із production-файлом як `*.spec.ts`. Окремі каталоги
доречні для наскрізних integration/e2e suites або спільної test infrastructure.

## 8. Архітектурна перевірка зміни

Перед merge автор і reviewer перевіряють:

1. Який модуль володіє новою поведінкою?
2. Чи залежності йдуть тільки вниз по шарах?
3. Чи не імпортує feature internals іншого модуля?
4. Де перевіряється `organizationId` і який cross-tenant test це доводить?
5. Бізнес-рішення знаходиться в service/pure function, а не в controller або
   persistence mapping?
6. Чи справді потрібен новий class/interface/dependency?
7. Чи потрібен ADR?

Правила, які можливо перевірити автоматично, поступово закріплюються lint rules,
architecture tests і CI. Документована межа залишається обов'язковою навіть до
появи автоматичної перевірки.
