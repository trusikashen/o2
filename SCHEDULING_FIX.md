# ИСПРАВЛЕНИЕ: Scheduling Bug - Workers выполняют задачи раньше времени

## Проблема (RED FLAG 🚩)

Workers выполняли задачи РАНЬШЕ установленного времени в режиме "human" (не fast).

**Пример проблемы:**
- Задача создана в DynamoDB с `scheduledTime: 07:07`
- Но в 07:01 worker УЖЕ начинает выполнять эту задачу
- Это нарушает логику распределения и расписания задач

## Корневая причина

В `src/worker.ts` были 2 критические ошибки:

### Ошибка 1: Config загружался ПОСЛЕ выбора job
```typescript
// НЕПРАВИЛЬНО:
const job = await getNextJobForRun(RUN_ID, true); // true = ignore scheduled time!
// ... потом загружается config:
const config = run.config as AdsterraConfig;
const pacingMode = config?.pacingMode || 'human';
if (pacingMode === 'human' && job.scheduledTime > now) {
  // Слишком поздно! Job уже выбран с ignoreScheduledTime=true
}
```

### Ошибка 2: Использование `DEFAULT_PROCESS_IMMEDIATELY` флага
```typescript
// НЕПРАВИЛЬНО:
const DEFAULT_PROCESS_IMMEDIATELY = (process.env.PROCESS_IMMEDIATELY ?? 'true') === 'true';

if (RUN_ID) {
  job = await getNextJobForRun(RUN_ID, true); // Всегда ignore schedule для RUN_ID!
} else {
  job = DEFAULT_PROCESS_IMMEDIATELY
    ? await getNextJob(true)     // Игнорирует schedule
    : await getNextJob(false);   // Соблюдает schedule
}
```

Проблема: 
- Флаг `DEFAULT_PROCESS_IMMEDIATELY=true` (по умолчанию) игнорирует ЛЮБЫЕ расписания
- Для `RUN_ID` ВСЕГДА игнорируется `scheduledTime`
- Config проверка происходит ТУЖ ЖЕ после выбора job - уже поздно

## Решение

### Шаг 1: Load run config ПЕРЕД выбором job

```typescript
// ПРАВИЛЬНО:
let pacingMode = 'human'; // Default to human (safe)

if (RUN_ID) {
  // Load config ПЕРВЫЙ, чтобы узнать pacing mode
  const run = await loadRunFromDynamoDB(RUN_ID);
  pacingMode = run.config?.pacingMode || 'human';
}

// Теперь знаем pacing mode ДО выбора job
const ignoreScheduledTimeFlag = pacingMode !== 'human';

// Используем ПРАВИЛЬНЫЙ флаг для всех query функций
if (RUN_ID) {
  job = await getNextJobForRun(RUN_ID, ignoreScheduledTimeFlag); // Correct!
} else if (workerId) {
  job = await getNextJobForWorker(WORKER_ID, ignoreScheduledTimeFlag); // Correct!
} else {
  job = await getNextJob(ignoreScheduledTimeFlag); // Correct!
}
```

### Шаг 2: Удалить `DEFAULT_PROCESS_IMMEDIATELY` влияние

- Удален flipped logic который зависел от env variable
- Теперь решение основано ТОЛЬКО на `pacing mode` из run config
- Default: `'human'` режим (безопасный выбор - соблюдает расписание)

### Шаг 3: Final safety check

Добавлена финальная проверка перед выполнением:

```typescript
// Safety check ПОСЛЕ загрузки полного config
if (finalPacingMode === 'human') {
  const now = Date.now();
  const scheduledTime = new Date(job.scheduledTime).getTime();
  
  if (scheduledTime > now) {
    // Reject и mark as failed (не вернуть в queue)
    await markJobFailed(job.id, `Job scheduled for future`);
    return true; // Handled
  }
}
```

## Файлы которые были изменены

### 1. [src/worker.ts](src/worker.ts)
- Переписана логика в `processJob()` функции
- Config загружается ПЕРЕД выбором job
- `ignoreScheduledTime` флаг основан на `pacing mode`
- Финальная проверка для safety

## Тесты

Созданы 2 набора тестов:

### 1. [src/__tests__/scheduling.test.ts](src/__tests__/scheduling.test.ts)
Unit тесты для queue функций:
- `getNextJob(ignoreScheduledTime)`
- `getNextJobForRun(ignoreScheduledTime)`
- Проверяет правильность фильтрации по `scheduledTime`

**Запуск:**
```bash
npm run test:scheduling
```

### 2. [src/__tests__/worker-scheduling-integration.test.ts](src/__tests__/worker-scheduling-integration.test.ts)
Integration тесты для worker логики:
- Config загружается ПЕРЕД job selection
- Human mode пропускает future jobs
- Fast mode выполняет future jobs
- Проверяет пакет вместе

**Запуск:**
```bash
npm run test:scheduling:integration
```

## Как проверить исправление

### 1. Запустить тесты
```bash
npm run test:scheduling
npm run test:scheduling:integration
```

### 2. Создать тестовый run
```bash
# Создать run с пакингом "human"
curl -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "pacingMode": "human",
    "jobCount": 10,
    "startTime": "now",
    "intervalMs": 60000
  }'
```

### 3. Посмотреть логи worker
```bash
npm run worker:once
```

Вы должны увидеть:
```
⏰ Job abc... scheduled for future (2026-01-22 07:07:00), rejecting...
```

Или для past jobs:
```
📋 Loaded config for run: xyz... (Status: running, Pacing: human, ...)
✅ Job successfully executed at correct time
```

## Результат

✅ Workers теперь СОБЛЮДАЮТ расписание в режиме "human"
✅ Jobs НИКОГДА не выполняются раньше `scheduledTime`
✅ Fast режим все еще может выполнять immediate jobs
✅ Default mode = "human" (безопасный выбор)

## Миграция для существующих runs

Для существующих runs которые уже создали jobs:

1. Jobs старые не пострадают (будут выполнены по schedule)
2. Новые runs автоматически будут использовать новую логику
3. Нет нужны в миграции данных

## Мониторинг

Добавить в логи worker для контроля:
```
✅ [bot-id] Session 1: Completed (Human mode - on schedule)
⏰ [bot-id] Session X: Skipped (Future job - 5min remaining)
```

Это поможет убедиться что scheduling работает правильно!
