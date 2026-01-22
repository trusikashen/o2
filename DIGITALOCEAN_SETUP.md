# Гайд по настройке DigitalOcean App Platform

## 📋 Предпосылки

1. **Аккаунт DigitalOcean** — зарегистрируйтесь на https://www.digitalocean.com
2. **Репозиторий GitHub** — код должен быть в `footyamigo/adsterra`
3. **AWS-креды** — для доступа к DynamoDB

## 🚀 Быстрая настройка

### 1. Создайте приложение в DigitalOcean

1. Перейдите в [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
2. Нажмите **«Create App»**
3. Подключите GitHub
4. Выберите репо: `footyamigo/adsterra`
5. Ветку: `main`
6. Включите **«Autodeploy on push»**

### 2. Настройте сборку

**Build Command:**
```bash
npm install && npx playwright install chromium --with-deps
```

**Run Command:**
```bash
npm start
```

### 3. Размер инстанса

- **Instance Size:** $98/мес | 8 GB RAM | 2 Dedicated vCPU
- **Autoscaling:**
  - Min Containers: 1
  - Max Containers: 2
  - CPU Threshold: 80%

### 4. Задайте переменные окружения

Перейдите в **Settings → App-Level Environment Variables** и добавьте:

#### AWS (обязательно)
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
DYNAMODB_ADSTERRA_RUNS_TABLE=AdsterraRuns
DYNAMODB_ADSTERRA_JOBS_TABLE=AdsterraJobs
```

#### Proxy (BrightData)
```bash
PROXY_PROVIDER=brightdata
BRIGHTDATA_HOST=brd.superproxy.io
BRIGHTDATA_PORT=33335
BRIGHTDATA_USERNAME=brd-customer-hl_d4382b99-zone-residential_proxy1
BRIGHTDATA_PASSWORD=o1qvlhpaqg22
BRIGHTDATA_ZONE=residential_proxy1
```

#### Worker
```bash
PROCESS_IMMEDIATELY=true
MAX_CONCURRENT_JOBS=500
CONCURRENT_JOBS=50
```

#### Timing
```bash
MIN_SCROLL_WAIT=0
MAX_SCROLL_WAIT=0
MIN_AD_WAIT=10000
MAX_AD_WAIT=30000
```

#### Browser
```bash
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000
```

#### Queue
```bash
QUEUE_POLL_INTERVAL=1000
MAX_RETRIES=3
```

### 5. Деплой

1. Нажмите **«Create Resources»** или **«Deploy»**
2. Подождите сборку (~5-10 минут)
3. Проверьте логи, что воркер стартовал

## ✅ Проверка

После деплоя смотрите логи:

1. Зайдите в **Runtime Logs** в панели DigitalOcean
2. Должно быть что-то вроде:
   ```
   🚀 Adsterra Bot Worker started
   ⏱️  Polling interval: 1000ms
   ⚡ Process immediately: Yes
   🔄 Concurrent jobs: 50 (dynamically calculated from active runs)
   💡 Waiting for jobs...
   ```

## 🔧 Траблшутинг

### Build падает

**Ошибка:** `TypeScript compilation errors`
- **Решение:** убедитесь, что TS-ошибки исправлены (мы их правили)

**Ошибка:** `Playwright browsers not found`
- **Решение:** команда сборки уже включает `npx playwright install chromium --with-deps`

### Воркер не стартует

**Ошибка:** `AWS credentials not found`
- **Решение:** добавьте `AWS_ACCESS_KEY_ID` и `AWS_SECRET_ACCESS_KEY` в переменные

**Ошибка:** `Cannot connect to DynamoDB`
- **Решение:** проверьте `AWS_REGION` и имена таблиц

### Высокое потребление памяти

**Проблема:** контейнер упирается в память  
**Решение:**
  - снизьте `MAX_CONCURRENT_JOBS` (например, 200-300)
  - или берите более крупный инстанс

## 📊 Мониторинг

- **Логи:** в панели DigitalOcean → Runtime Logs
- **Метрики:** CPU/память в панели
- **Очередь:** `npm run check:queue` (если зашли по SSH) или смотрите DynamoDB

## 🔄 Автодеплой

После настройки каждый `git push origin main`:
1. Запустит сборку в DigitalOcean
2. Установит зависимости
3. Установит Playwright браузеры
4. Перезапустит воркер с новым кодом

Ручной деплой не нужен! 🎉

## 💰 Оценка стоимости

- **Запуски на $50/день:** 1 контейнер = $98/мес
- **Запуски на $500/день:** 2 контейнера = $196/мес
- **Простой:** 1 контейнер = $98/мес

Сильно дешевле, чем EC2 ($500/месяц)!
