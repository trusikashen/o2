# Scheduling Fix - Быстрый старт для тестирования

## 🎯 Что было исправлено

Worker БЫЛ выполнял jobs раньше установленного времени:
```
06:00 - создана задача на 07:00
06:05 - worker УЖЕ выполняет эту задачу ❌ ОШИБКА
```

Теперь исправлено:
```
06:00 - создана задача на 07:00
06:05 - worker ПРОПУСКАЕТ эту задачу ✅
07:00 - worker ВЫПОЛНЯЕТ в установленное время ✅
```

## 🚀 Как тестировать

### Вариант 1: Запустить unit tests (быстро)

```bash
# Тест функций очереди
npm run test:scheduling

# Тест worker логики
npm run test:scheduling:integration
```

Ожидаемый результат:
```
✅ Passed: 7/7
✅ All tests passed!
```

### Вариант 2: Запустить demo (видеть результат)

```bash
npx tsx scripts/demo-scheduling-fix.ts
```

Увидите:
```
✅ TEST 1: HUMAN MODE (respects schedule)
   ✅ Selected job: job-past-10min...  (CORRECT: past job)
   ❌ ERROR: Selected a FUTURE job!    (would indicate failure)

✅ TEST 2: FAST MODE (ignores schedule)  
   ✅ Selected job: [any job]
   ✅ CORRECT: Fast mode can process ANY job
```

### Вариант 3: Manual testing в production

#### 1. Создать run с human режимом

Frontend:
```
Settings → Create New Run
- Pacing Mode: "human" ← ВАЖНО
- Job Count: 10
- Start Time: Now
- Interval: 60s
```

Или через API:
```bash
curl -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "pacingMode": "human",
    "jobCount": 10,
    "startTime": "now",
    "intervalMs": 60000
  }'
```

#### 2. Запустить worker и смотреть логи

```bash
npm run worker:once
```

Ожидаемые логи:
```
📋 Loaded config for run: 8a2c1... (Status: running, Pacing: human)
⏳ Waiting for jobs...
💤 No jobs available...

[когда придет время выполнения]
🚀 Session 1: Starting...
✅ Session 1: Completed in 8.5s
```

Если job будущий:
```
⏰ Job 5d3e2... scheduled for future (2026-01-22 07:07:00), rejecting...
```

#### 3. Проверить что jobs выполняются по расписанию

Логируйте времена в DynamoDB:
- `createdAt` - когда создана задача
- `scheduledTime` - когда должна выполниться
- `updatedAt` - когда фактически выполнена

Должно быть: `updatedAt >= scheduledTime` ✅

## 📊 Что тестировать

| Случай | Поведение | Проверка |
|--------|-----------|----------|
| Human mode + future job | Пропускает | Логи: нет выполнения |
| Human mode + past job | Выполняет | Логи: `✅ Session X: Completed` |
| Fast mode + future job | Выполняет | Логи: `✅ Session X: Completed` |
| Default mode | Использует human | Логи: `Pacing: human` |

## 🔍 Как убедиться что работает

### Признак 1: Логи worker
```
✅ Правильно:
  📋 Loaded config... (Pacing: human)
  🚀 Session 1: Starting...
  ✅ Session 1: Completed

❌ Неправильно:
  ⏰ Job scheduled for future... (постоянно в логах)
```

### Признак 2: DynamoDB jobs
Проверьте в DynamoDB:
```
Job 1:
  scheduledTime: 2026-01-22 07:00:00
  status: completed
  createdAt: 2026-01-22 06:55:00
  ✅ Job выполнен ПОСЛЕ scheduledTime
```

### Признак 3: Queue status
```bash
npm run check:queue
```

Должно показать:
```
Run: xyz...
  ✅ Completed: 10 / 10 (100%)
  ❌ Failed: 0
  ⏳ Waiting: 0
  🔄 Active: 0
```

## 🐛 Если что-то не работает

### Problem: Worker не выполняет tasks

**Решение:**
```bash
# 1. Проверить что run создана правильно
npm run check:active-runs

# 2. Проверить jobs в очереди
npm run check:queue

# 3. Проверить логи worker
npm run worker:once | grep -i "error\|warning\|scheduling"
```

### Problem: Tasks выполняются в неправильное время

**Проверить:**
1. Какой `pacingMode` у run? 
   ```bash
   npm run check:active-runs | grep "Pacing"
   ```

2. Проверить `scheduledTime` в jobs
   ```typescript
   // В DynamoDB посмотреть jobs таблицу
   // scheduledTime должен быть past when job executed
   ```

### Problem: Tests не проходят

```bash
# 1. Проверить что DynamoDB доступен
npm run check:active-runs

# 2. Запустить с verbose логами
DEBUG=* npm run test:scheduling

# 3. Проверить AWS credentials
echo $AWS_ACCESS_KEY_ID
echo $AWS_REGION
```

## 📝 Notes

- Default pacing mode: `"human"` (безопасно)
- Jobs ВСЕГДА выполняются в human mode >= scheduledTime
- Fast mode может выполнять immediately (по желанию)
- Финальная проверка перед выполнением (safety)
- Нет миграции данных нужна

## 🎓 Для разработки

### Если нужно изменить логику:

1. Основной файл: [src/worker.ts](src/worker.ts) - функция `processJob()`
2. Queue функции: [src/queue/dynamodb-queue.ts](src/queue/dynamodb-queue.ts)
3. Tests: [src/__tests__/scheduling.test.ts](src/__tests__/scheduling.test.ts)

### Ключевые points в коде:

```typescript
// Line ~155 в worker.ts:
// Загрузить config для определения pacing mode
const pacingMode = config?.pacingMode || 'human';

// Line ~165:
// Определить флаг на основе pacing mode
const ignoreScheduledTimeFlag = pacingMode !== 'human';

// Line ~200:
// Финальная safety проверка перед выполнением
if (finalPacingMode === 'human' && scheduledTime > now) {
  await markJobFailed(job.id, `Job scheduled for future`);
  return true;
}
```

---

**Статус: ✅ ГОТОВО**

Все тесты должны пройти, scheduling должен работать правильно!
