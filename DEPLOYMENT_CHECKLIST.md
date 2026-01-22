# Чеклист деплоя в DigitalOcean

## ✅ Перед деплоем

- [x] Исправлены ошибки TypeScript
- [x] Версия Node указана в package.json
- [x] `tsx` перенесен в dependencies (не devDependencies)
- [x] Настроена команда старта (`npm start`)
- [x] dotenv подгружается в worker.ts
- [x] Установка браузеров Playwright в postinstall

## 📦 Добавленные/измененные файлы

- [x] `.do/app.yaml` — конфиг DigitalOcean
- [x] `DIGITALOCEAN_SETUP.md` — гайд по настройке
- [x] `.nvmrc` — версия Node
- [x] `.node-version` — версия Node
- [x] `package.json` — обновлен postinstall
- [x] `src/worker.ts` — добавлен импорт dotenv
- [x] `src/orchestrator-run.ts` — исправлены TS-ошибки

## 🚀 Шаги деплоя

### 1. Push в GitHub
```bash
cd adsterra
git add .
git commit -m "Configure for DigitalOcean deployment"
git push origin main
```

### 2. Настройка в DigitalOcean

#### A. Создайте App
1. Зайдите на https://cloud.digitalocean.com/apps
2. Нажмите "Create App"
3. Подключите GitHub
4. Repo: `footyamigo/adsterra`
5. Ветка: `main`
6. Включите "Autodeploy on push"

#### B. Настройте компонент
- **Type:** Worker
- **Instance Size:** $98/мес | 8 GB RAM | 2 Dedicated vCPU
- **Autoscaling:**
  - Min: 1
  - Max: 2
  - CPU Threshold: 80%

#### C. Build Settings
- **Build Command:** `npm install && npx playwright install chromium --with-deps`
- **Run Command:** `npm start`

#### D. Environment Variables
Добавьте все переменные из `DIGITALOCEAN_SETUP.md`:
- AWS-креды
- Настройки прокси
- Конфиг воркера
- Настройки таймингов
- Настройки браузера

### 3. Деплой
- Нажмите "Create Resources"
- Дождитесь сборки (~5-10 минут)
- Проверьте логи на успех

## 🔍 Проверка после деплоя

- [ ] Build завершился успешно
- [ ] Воркер стартовал (проверьте логи)
- [ ] Есть подключение к DynamoDB
- [ ] Есть подключение к BrightData proxy
- [ ] Переменные окружения подхватились верно

## 📝 Шаблон переменных окружения

Скопируйте в панель DigitalOcean:

```bash
# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
DYNAMODB_ADSTERRA_RUNS_TABLE=AdsterraRuns
DYNAMODB_ADSTERRA_JOBS_TABLE=AdsterraJobs

# Proxy
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

## 🐛 Траблшутинг

### Build падает
- Проверьте ошибки TypeScript
- Убедитесь в версии Node (20+)
- Проверьте установку Playwright

### Воркер не стартует
- Проверьте переменные окружения
- Проверьте AWS-креды
- Проверьте имена таблиц DynamoDB

### Проблемы с памятью
- Уменьшите `MAX_CONCURRENT_JOBS`
- Возьмите инстанс крупнее
- Проверьте, работает ли автомасштабирование
