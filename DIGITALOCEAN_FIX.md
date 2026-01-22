# Исправление деплоя в DigitalOcean

## 🔴 Текущие проблемы

1. **Нет системной библиотеки**: `libnspr4.so` — Chromium нужны системные зависимости
2. **Health-check падает**: компонент настроен как Web Service вместо Worker

## ✅ Решения

### 1. Установить системные зависимости

**В панели DigitalOcean:**

Обновите **Build Command** на:
```bash
npm install && npx playwright install chromium --with-deps
```

Флаг `--with-deps` ставит системные библиотеки для Chromium. App Platform разрешает это на этапе сборки (не в рантайме).

### 2. Настройте как Worker (не Web Service)

**Важно:** убедитесь, что компонент — **Worker**, а не **Web Service**:

1. Зайдите в панель App Platform
2. Найдите приложение → **Components**
3. Проверьте тип:
   - ❌ Если «Web Service» → удалите и создайте новый Worker
   - ✅ Если «Worker» → ок!

**Почему это важно:**
- Worker не требует HTTP health-check на 8080
- Worker запускает фоновые процессы (ваш бот)
- Web Service ждет HTTP эндпоинты (у бота их нет)

### 3. Обновите Build Command в панели

1. Перейдите в **Settings → Build & Deploy**
2. Обновите **Build Command**:
   ```bash
   npm install && npx playwright install chromium --with-deps
   ```
3. Убедитесь, что **Run Command** такой:
   ```bash
   npm start
   ```

### 4. Отключите health-check (если все еще падает)

Если health-check все еще падает после перевода в Worker:

1. Перейдите в **Settings → Health Checks**
2. **Отключите** HTTP health-check (Worker не нужен)
3. Или смените порт (но обычно Worker это не требуется)

## 📝 Итог

**Что сделать:**
1. ✅ Обновить Build Command с флагом `--with-deps`
2. ✅ Убедиться, что компонент — **Worker**
3. ✅ Отключить HTTP health-check

**После этого:**
- Системные зависимости установятся при сборке
- Не будет ошибок health-check (Worker не требует HTTP)
- Браузеры Playwright будут работать корректно
