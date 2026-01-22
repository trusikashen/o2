# Быстрый гайд по настройке DigitalOcean

## 🎯 Как это работает

**Вы настраиваете команды сборки/запуска ОДИН раз в панели DigitalOcean.**
Дальше каждый `git push` в GitHub автоматически запускает деплой.

## ✅ Пошаговая настройка (однократно)

### 1. Создайте приложение в DigitalOcean

1. Перейдите на https://cloud.digitalocean.com/apps
2. Нажмите **«Create App»**
3. Подключите аккаунт GitHub
4. Выберите репозиторий: `footyamigo/adsterra`
5. Выберите ветку: `main`
6. ✅ Включите **«Autodeploy on push»**

### 2. Настройте компонент (Worker)

Когда DigitalOcean предложит настроить компонент:

**Component Type:** Worker (не Web Service)

**Build Command:**
```bash
npm install && npx playwright install chromium
```

**Run Command:**
```bash
npm start
```

**Размер инстанса:**
- Выберите: $98/мес | 8 GB RAM | 2 Dedicated vCPU

**Автомасштабирование:**
- Minimum Containers: 1
- Maximum Containers: 2
- CPU Threshold: 80%

### 3. Добавьте переменные окружения

Перейдите в **Settings → App-Level Environment Variables** и добавьте:

```bash
# AWS (Required)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
DYNAMODB_ADSTERRA_RUNS_TABLE=AdsterraRuns
DYNAMODB_ADSTERRA_JOBS_TABLE=AdsterraJobs

# Proxy (BrightData)
PROXY_PROVIDER=brightdata
BRIGHTDATA_HOST=brd.superproxy.io
BRIGHTDATA_PORT=33335
BRIGHTDATA_USERNAME=brd-customer-hl_d4382b99-zone-residential_proxy1
BRIGHTDATA_PASSWORD=o1qvlhpaqg22
BRIGHTDATA_ZONE=residential_proxy1

# Worker
PROCESS_IMMEDIATELY=true
MAX_CONCURRENT_JOBS=500
CONCURRENT_JOBS=50

# Timing
MIN_SCROLL_WAIT=0
MAX_SCROLL_WAIT=0
MIN_AD_WAIT=10000
MAX_AD_WAIT=30000

# Browser
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000

# Queue
QUEUE_POLL_INTERVAL=1000
MAX_RETRIES=3
```

### 4. Деплой

Нажмите **«Create Resources»** или **«Deploy»**

---

## 🔄 После начальной настройки

**Вот и все!** Теперь при каждом:

```bash
git push origin main
```

DigitalOcean:
1. ✅ увидит push
2. ✅ автоматически выполнит build command
3. ✅ установит зависимости
4. ✅ установит Playwright браузеры
5. ✅ запустит воркер
6. ✅ выкатит новый код

**Никаких ручных действий!**

---

## 🐛 Траблшутинг

### Build падает: «Playwright requires sudo»

**Исправлено!** Убрали флаг `--with-deps`. В DigitalOcean системные зависимости уже стоят.

### Браузер не найден

Если ошибки браузера сохраняются, build command должен быть:
```bash
npm install && npx playwright install chromium
```

Убедитесь, что так и прописано в панели DigitalOcean → Settings → Build Command

### Приложение не стартует

Проверьте:
- ✅ переменные окружения заданы
- ✅ AWS-креды корректны
- ✅ имена таблиц DynamoDB правильные

---

## 📝 Итог

1. **Настройте один раз** в панели DigitalOcean (build/run)
2. **Делайте push** в GitHub → автодеплой
3. **Готово!** Ручной деплой не нужен

Файлы `.do/app.yaml` и `app.yaml` — опциональны: DigitalOcean использует их, если найдет, но можно настроить все через UI.
