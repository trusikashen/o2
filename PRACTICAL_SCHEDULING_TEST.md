# 🧪 ПРАКТИЧЕСКИЙ ТЕСТ: 20 JOBS В ЧЕЛОВЕЧЕСКОМ РЕЖИМЕ

## 📍 Цель теста

✅ Создать 20 задач в режиме "human" с распределением на 30 минут
✅ Задачи на URL ipleak.com БЕЗ прокси
✅ Запустить worker локально
✅ **Проверить что worker выполняет задачи ТОЛЬКО в установленное время**

---

## 🚀 БЫСТРЫЙ СТАРТ (5 минут)

### Шаг 1: Создать 20 задач (1-2 минуты)

```bash
npx tsx scripts/create-scheduling-test-jobs.ts
```

**Ожидаемый вывод:**
```
🧪 SCHEDULING TEST: 20 Jobs in Human Mode Over 30 Minutes
📍 Target: ipleak.com (no proxy)
📝 Pacing Mode: HUMAN (strict scheduling)
⏱️  Duration: 30 minutes
🔢 Job Count: 20

[Step 1] Creating run with human pacing mode...
✅ Run created: test-human-1234567890...

[Step 2] Creating jobs with 1.5-minute intervals...
Job Schedule:
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  Job 01: 2026-01-22T15:45:30.000Z (+0.0m)
  Job 02: 2026-01-22T15:47:00.000Z (+1.5m)
  Job 03: 2026-01-22T15:48:30.000Z (+3.0m)
  ... и ещё 17 задач ...
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
✅ 20 jobs created successfully!
```

**Запомните:** Run ID (будет нужен для проверки)

---

### Шаг 2: Запустить worker (в НОВОМ терминале)

```bash
npm run worker:once
```

**Ожидаемые логи:**
```
🚀 Adsterra Bot Worker started
⏱️  Polling interval: 1000ms
⚡ Process immediately: No (respecting scheduled times)
🔄 Concurrent browsers: 5 (max: 10)
🧵 Worker threads: 8

💡 Waiting for jobs...

[Когда придет время первой задачи]
📋 Loaded config for run: test-human-... (Status: running, Pacing: human)
🚀 [ipleak-bot] Session 1: Starting...
✅ [ipleak-bot] Session 1: Completed in 8.5s
```

---

### Шаг 3: Мониторить выполнение

**В ТРЕТЬЕМ терминале - запускайте команду несколько раз:**

```bash
npm run test:scheduling:monitor
```

**Ожидаемый вывод:**
```
📊 JOB EXECUTION ANALYSIS
════════════════════════════════════════════════════════════════════════════════════════════════

Job Status:
─────────────────────────────────────────────────────────────────────────────────────────────────
⏳ Job 01: 15:45:30 → N/A | Waiting (in 2.5min)
✅ Job 02: 15:47:00 → 15:47:02 | On-time (+0.0min)
✅ Job 03: 15:48:30 → 15:48:35 | On-time (+0.1min)
✅ Job 04: 15:50:00 → 15:50:01 | On-time (+0.0min)
⏳ Job 05: 15:51:30 → N/A | Waiting (in 1.2min)
...

📈 SUMMARY
─────────────────────────────────────────────────────────────────────────────────────────────────
✅ On-time: 3/20
❌ Early (VIOLATION): 0/20
⚠️  Late: 0/20
⏳ Pending: 17/20

🎯 ASSESSMENT
─────────────────────────────────────────────────────────────────────────────────────────────────
✅ SCHEDULING FIX IS WORKING!
   - No jobs executed before schedule
   - All executed jobs respect scheduled times
   - Worker is following human mode correctly!
```

---

## 🎯 ЧТО ПРОВЕРЯЕТСЯ

| Проверка | Хорошо ✅ | Плохо ❌ |
|----------|---------|---------|
| **Timing** | Job выполняется ПОСЛЕ scheduledTime | Job выполняется ДО scheduledTime |
| **Human mode** | Worker пропускает будущие jobs | Worker выполняет future jobs |
| **Schedule respect** | All jobs on-time или поздно | Early execution = violation |
| **Order** | Jobs выполняются в порядке schedule | Jobs выполняются не по порядку |

---

## 📊 РАСПИСАНИЕ ТЕСТОВЫХ ЗАДАЧ

Если вы запустили скрипт в 15:45:00, вот примерное расписание:

```
15:45:00 - Job 01 ← FIRST SHOULD EXECUTE NOW
15:46:30 - Job 02
15:48:00 - Job 03
15:49:30 - Job 04
15:51:00 - Job 05
15:52:30 - Job 06
15:54:00 - Job 07
15:55:30 - Job 08
15:57:00 - Job 09
15:58:30 - Job 10
16:00:00 - Job 11  ← 15 minutes passed
16:01:30 - Job 12
16:03:00 - Job 13
16:04:30 - Job 14
16:06:00 - Job 15
16:07:30 - Job 16
16:09:00 - Job 17
16:10:30 - Job 18
16:12:00 - Job 19
16:13:30 - Job 20  ← LAST JOB (28.5 minutes from first)
```

---

## 🔍 ЛОГИ КОТОРЫЕ ИЩИТЕ

### ✅ ХОРОШИЕ ЛОГИ (scheduling работает):
```
📋 Loaded config for run: test-human-... (Pacing: human)
🚀 [ipleak-bot] Session 1: Starting...
✅ [ipleak-bot] Session 1: Completed in 8.5s
```

### ❌ ПЛОХИЕ ЛОГИ (scheduling НЕ работает):
```
⏰ Job abc... scheduled for future (2026-01-22 15:47:00), rejecting...
```

Если видите такие логи - это значит что worker пытался выполнить будущую задачу (это ОШИБКА, но наша исправление её отклонило).

---

## 💡 СОВЕТЫ

### 1. Время и синхронизация
- Убедитесь что время на компьютере ПРАВИЛЬНОЕ
- Использующется UTC время в DynamoDB
- Если время неверное - test даст неправильные результаты

Проверить время:
```bash
date  # Linux/Mac
Get-Date  # Windows PowerShell
```

### 2. Worker не выполняет задачи?

Проверьте:
```bash
# Проверить очередь
npm run check:queue

# Должно быть:
# Run: test-human-...
# ✅ Completed: 1 / 20
# ⏳ Waiting: 19
```

### 3. Worker закончил слишком быстро?

Это может быть потому что:
- Jobs уже прошли scheduledTime
- Worker выполняет все что может (правильно)
- Или есть ошибки

Проверить статус:
```bash
npm run test:scheduling:monitor
```

---

## 🏁 ОКОНЧАНИЕ ТЕСТА

### Ожидаемый результат (ВСЕГДА TRUE если исправление работает):

```
🎯 ASSESSMENT
─────────────────────────────────────────────────────────────────────────────────────────────────
✅ SCHEDULING FIX IS WORKING!
   - No jobs executed before schedule ← КЛЮЧЕВАЯ ПРОВЕРКА
   - All executed jobs respect scheduled times
   - Worker is following human mode correctly!
```

### Очистить тестовые данные:

После теста можно очистить:
```bash
npm run clear:jobs
```

---

## 📋 ЧЕК-ЛИСТ ТЕСТА

- [ ] 1. Запустил `npm run test:scheduling:create`
- [ ] 2. Запомнил Run ID
- [ ] 3. Запустил worker в новом терминале
- [ ] 4. Несколько раз запустил `npm run test:scheduling:monitor`
- [ ] 5. Проверил что нет ❌ Early violations
- [ ] 6. Дождался выполнения нескольких jobs
- [ ] 7. Все jobs выполнились в правильное время ✅

---

## 🎉 ЧТО ДОЛЖНО ПРОИСХОДИТЬ

**БЫЛО (BUGGY):**
```
06:00 - Job создана на 07:00
06:05 - Worker СРАЗУ выполняет ❌ ОШИБКА!
```

**СЕЙЧАС (FIXED):**
```
06:00 - Job создана на 07:00
06:05 - Worker ПРОПУСКАЕТ (ещё не время) ✅
07:00 - Worker ВЫПОЛНЯЕТ точно в срок ✅
```

---

## 📞 ЕСЛИ ТЕСТ ПРОВАЛИЛСЯ

Если видите ❌ Early violations:

1. Проверьте worker логи
2. Проверьте что используется NEW код из [src/worker.ts](../src/worker.ts)
3. Перезагрузите worker
4. Запустите unit тесты:
```bash
npm run test:scheduling
npm run test:scheduling:integration
```

Если unit тесты проходят но практический тест не работает - это может быть проблема с временем или конфигурацией.

---

**Удачи с тестом! 🚀**

Этот тест окончательно докажет что scheduling bug ИСПРАВЛЕН!
