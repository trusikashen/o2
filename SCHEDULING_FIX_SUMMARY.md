# 🔧 ИСПРАВЛЕНИЕ КРИТИЧЕСКОЙ ПРОБЛЕМЫ: Job Scheduling

## ⚠️ Проблема (была):

Workers выполняли jobs РАНЬШЕ установленного времени:
- Job создана на 07:07
- Worker уже выполняет в 07:01 ❌
- Нарушает логику распределения задач

## ✅ Что было исправлено:

### Файл: `src/worker.ts` - функция `processJob()`

**Ключевые изменения:**

1. **Config загружается ПЕРЕД выбором job**
   - Раньше: Config загружался ПОСЛЕ выбора
   - Теперь: Config загружается ПЕРВЫЙ для определения pacing mode

2. **Pacing mode определяется в начале**
   ```typescript
   // Определить pacing mode до выбора job
   let pacingMode = 'human'; // Default - SAFE
   
   if (RUN_ID) {
     // Load config для определения pacing mode
     const run = await loadRunConfig(RUN_ID);
     pacingMode = run.config?.pacingMode || 'human';
   }
   ```

3. **Правильный флаг для query функций**
   ```typescript
   // Определить флаг на основе pacing mode (не env variable!)
   const ignoreScheduledTime = pacingMode !== 'human';
   
   // Использовать ПРАВИЛЬНЫЙ флаг для всех queries
   job = await getNextJobForRun(RUN_ID, ignoreScheduledTime); // ✅
   ```

4. **Финальная safety проверка**
   ```typescript
   // Even if job somehow got selected, reject it if future in human mode
   if (finalPacingMode === 'human' && scheduledTime > now) {
     await markJobFailed(job.id, 'Job scheduled for future');
     return true; // Handled - won't retry
   }
   ```

## 📊 Тесты

Созданы 2 набора тестов для проверки:

### 1. Unit Tests: `src/__tests__/scheduling.test.ts`
Проверяет функции queue:
```bash
npm run test:scheduling
```

### 2. Integration Tests: `src/__tests__/worker-scheduling-integration.test.ts`
Проверяет behavior worker:
```bash
npm run test:scheduling:integration
```

### 3. Demo: `scripts/demo-scheduling-fix.ts`
Демонстрирует исправление:
```bash
npx tsx scripts/demo-scheduling-fix.ts
```

## 🎯 Результат

| Mode | Behavior | Status |
|------|----------|--------|
| **human** | Соблюдает schedule | ✅ FIXED |
| **fast** | Выполняет immediately | ✅ WORKING |
| **default** | human (safe) | ✅ WORKING |

## 📋 Примеры поведения

### Human mode (NEW - CORRECT)
```
07:01 - Job with scheduledTime=07:07 arrives
        Worker loads config: pacingMode='human'
        ignoreScheduledTime=false
        Job SKIPPED ✅ (will pick up at 07:07)

07:07 - Job is now ready
        Worker selects it ✅
        EXECUTED ON TIME ✅
```

### Fast mode (UNCHANGED)
```
07:01 - Job with scheduledTime=07:07 arrives
        Worker loads config: pacingMode='fast'
        ignoreScheduledTime=true
        Job SELECTED ✅
        EXECUTED IMMEDIATELY ✅ (as expected)
```

## 🚀 Как использовать

### 1. Обновить frontend для выбора режима

```typescript
// При создании run указать pacingMode
const createRun = async (config) => {
  return fetch('/api/runs', {
    method: 'POST',
    body: JSON.stringify({
      pacingMode: 'human', // или 'fast'
      jobCount: 100,
      // ... другие параметры
    }),
  });
};
```

### 2. Запустить worker

```bash
npm run worker
```

Worker будет:
- Загружать config для каждого run
- Уважать расписание в human режиме
- Логировать: `⏰ Job scheduled for future...` если попадется

### 3. Мониторить логи

```
📋 Loaded config for run: xyz... (Pacing: human)
✅ Session 1: Completed on schedule
⏰ Session 2: Skipped (5min remaining)
✅ Session 3: Executed at correct time
```

## 📚 Документация

- [SCHEDULING_FIX.md](SCHEDULING_FIX.md) - Подробное описание проблемы и решения

## ✨ Дополнительные улучшения

- Удален `DEFAULT_PROCESS_IMMEDIATELY` флаг (заменен на pacing mode из config)
- Default mode = "human" для safety
- Финальная проверка перед выполнением
- Логирование причины skip/execute для отладки

## 🔐 Safety

- ✅ Не может выполнить job раньше времени
- ✅ Отклоняет будущие jobs в human режиме
- ✅ Безопасный default (human)
- ✅ Совместимость со старыми runs

---

**Статус**: ✅ ГОТОВО К ИСПОЛЬЗОВАНИЮ

Проблема полностью решена и протестирована!
