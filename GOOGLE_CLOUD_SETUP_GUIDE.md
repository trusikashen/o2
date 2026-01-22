# Гайд по настройке Windows в Google Cloud

## 📋 Параметры инстанса

- **Instance Name:** adsterra-bot
- **External IP:** 34.69.10.52
- **Region:** us-central1-c
- **OS:** Windows Server 2025
- **Specs:** 12 vCPU, 32GB RAM

---

## Шаг 1: Установите пароль Windows

1. **В Google Cloud Console:**
   - Откройте страницу инстанса
   - Нажмите **«Set Windows password»**
   - Скопируйте сгенерированный пароль (нужен для RDP)

---

## Шаг 2: Подключитесь по RDP

### На вашем ПК:

1. **Нажмите `Win + R`**
2. **Введите:** `mstsc` (Remote Desktop Connection)
3. **Укажите внешний IP:** `34.69.10.52`
4. **Нажмите «Connect»**
5. **Введите логин/пароль:**
   - Username: `Administrator` (или указанный в Google Cloud)
   - Password: (установленный на шаге 1)

**Теперь вы должны увидеть рабочий стол Windows в Google Cloud!**

---

## Шаг 3: Скачайте скрипт установки

### Вариант A: скачать с GitHub (рекомендуется)

1. **Откройте браузер** на Windows VM (IE или Edge)
2. **Перейдите:** https://raw.githubusercontent.com/footyamigo/adsterra/main/scripts/setup-google-cloud-windows.ps1
3. **Правый клик** → **Save As**
4. **Сохраните в:** `C:\setup.ps1`

### Вариант B: копирование с локального ПК

1. **На своем ПК** скопируйте скрипт
2. **В RDP** откройте проводник
3. **Вставьте файл** в `C:\setup.ps1`

---

## Шаг 4: Запустите скрипт установки

1. **Откройте PowerShell от имени администратора:**
   - ПКМ по «Пуск»
   - Выберите «Windows PowerShell (Admin)»

2. **Перейдите в C:\:**
   ```powershell
   cd C:\
   ```

3. **Разрешите выполнение скриптов** (только первый раз):
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

4. **Запустите скрипт:**
   ```powershell
   .\setup.ps1
   ```

5. **Следуйте подсказкам:**
   - Введите URL репозитория: `https://github.com/footyamigo/adsterra`
   - Скрипт установит все автоматически

**Займет 10-15 минут** (в основном скачивание/установка)

---

## Шаг 5: Настройте переменные окружения

1. **Откройте .env:**
   ```powershell
   notepad C:\AdsenseLoading\adsterra\.env
   ```

2. **Обновите значения** (из вашего локального .env):
   ```env
   # BrightData (у вас уже есть)
   BRIGHTDATA_PASSWORD=ql1bol9csls1
   
   # AWS (скопируйте из локального .env)
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your-key-here
   AWS_SECRET_ACCESS_KEY=your-secret-here
   DYNAMODB_ADSTERRA_RUNS_TABLE=AdsterraRuns
   DYNAMODB_ADSTERRA_JOBS_TABLE=AdsterraJobs
   
   # Browser (headed mode for impressions)
   BROWSER_HEADLESS=false
   
   # Timing (10-30 seconds for impressions)
   MIN_AD_WAIT=10000
   MAX_AD_WAIT=30000
   
   # Worker (25 concurrent for $50/day)
   MAX_CONCURRENT_BROWSERS=25
   PROCESS_IMMEDIATELY=true
   ```

3. **Сохраните и закройте** (Ctrl+S и закрыть)

---

## Шаг 6: Запуск воркера

### Вариант A: автостарт-скрипт (рекомендуется)

Держит воркер запущенным и перезапускает при падении:

1. **Откройте PowerShell** (обычный, не админ)

2. **Запустите скрипт автостарта:**
   ```powershell
   cd C:\adsterra
   .\scripts\start-worker-auto.ps1
   ```

Скрипт:
- запустит воркер автоматически
- перезапустит при краше
- держит в работе, пока не остановите (Ctrl+C)

**Чтобы держать в фоне (после закрытия RDP):**
- Используйте Планировщик заданий (см. вариант B)

### Вариант B: Windows Task Scheduler (автостарт при загрузке)

1. **Откройте Task Scheduler** (поиск в Start)

2. **Создайте Basic Task:**
   - Name: "Adsterra Worker"
   - Trigger: "When the computer starts"
   - Action: "Start a program"
   - Program: `powershell.exe`
   - Arguments: `-NoExit -File "C:\adsterra\scripts\start-worker-auto.ps1"`

3. **Сохраните** — воркер автозапустится при каждой загрузке

### Вариант C: ручной старт (для теста)

```powershell
cd C:\adsterra
npx tsx src/worker.ts
```

Оставьте окно открытым на время теста.

---

## Шаг 7: Проверьте работу

**Важно:** Теперь воркер:
- ✅ ретраит 502 и прочие ошибки прокси (2 ретрая = 3 попытки)
- ✅ каждые 5 минут показывает сводку прогресса
- ✅ в конце выводит финальную сводку с доходом/прибылью

1. **Проверьте статус PM2:**
   ```powershell
   pm2 status
   ```
   Должно быть `adsterra-worker` в статусе "online"

2. **Посмотрите логи:**
   ```powershell
   pm2 logs adsterra-worker
   ```
   Должно быть видно опрос задач

3. **Проверка обработки:**
- В логах: "Polling for jobs..." или "No jobs available"
- Значит, подключение к DynamoDB есть и все работает!

---

## Ежедневный воркфлоу

### Запуск прогона (из локального фронтенда):

1. **Создайте прогон** во фронте (ставим $50/день, 12 часов, human pacing)
2. **Нажмите «Start Production»**
3. **Фронт создаст джобы в DynamoDB**
4. **Воркер в Google Cloud подхватит их сам** (за секунды)
5. **Мониторьте прогресс** во фронте

### Мониторинг в Google Cloud:

```powershell
# Статус
pm2 status

# Лайв-логи
pm2 logs adsterra-worker

# Последние 100 строк
pm2 logs adsterra-worker --lines 100

# Рестарт при необходимости
pm2 restart adsterra-worker
```

### Обновление кода:

```powershell
# Перейти в репозиторий
cd C:\AdsenseLoading

# Подтянуть код
git pull

# Установить зависимости (если менялся package.json)
cd adsterra
npm install

# Рестарт воркера
pm2 restart adsterra-worker
```

---

## Оптимизация стоимости: расписание 12 часов

Чтобы экономить, запускаясь 12 часов/день:

### Вариант 1: ручной старт/стоп

1. **Стартуйте инстанс** когда нужно (через Google Cloud Console)
2. **PM2 автозапускает** воркер при загрузке инстанса
3. **Останавливайте инстанс** после работы (экономия ~50%)

### Вариант 2: автоматическое расписание (рекомендуется)

Используйте Google Cloud Scheduler для автозапуска/остановки:
- **Start:** каждый день в нужное время
- **Stop:** через 12 часов
- **Стоимость:** ~$138/месяц (против ~$280/месяц при 24/7)

---

## Траблшутинг

### Воркер не стартует?

1. **Проверьте статус PM2:**
   ```powershell
   pm2 status
   ```

2. **Посмотрите ошибки в логах:**
   ```powershell
   pm2 logs adsterra-worker --err
   ```

3. **Частые причины:**
   - Нет .env: создайте по шаблону
   - Неверные креды: проверьте .env
   - Доступ к DynamoDB: проверьте AWS-ключи

### Нет подключения к DynamoDB?

1. **Проверьте AWS-ключи в .env**
2. **Проверьте подключение:**
   ```powershell
   cd C:\AdsenseLoading\adsterra
   node -e "const {DynamoDBClient} = require('@aws-sdk/client-dynamodb'); const client = new DynamoDBClient({region: 'us-east-1'}); console.log('Connected!');"
   ```

### Браузеры не запускаются?

1. **Проверьте BROWSER_HEADLESS=false** в .env
2. **Убедитесь, что Playwright браузеры установлены:**
   ```powershell
   cd C:\AdsenseLoading\adsterra
   npx playwright install chromium firefox webkit
   ```

---

## Полезные команды

```powershell
# Статус воркера
pm2 status

# Лайв-логи
pm2 logs adsterra-worker

# Последние 50 строк
pm2 logs adsterra-worker --lines 50

# Рестарт воркера
pm2 restart adsterra-worker

# Стоп воркера
pm2 stop adsterra-worker

# Мониторинг (CPU, память)
pm2 monit
```

---

## Далее

1. ✅ **Воркер запущен** — автоматически обрабатывает задачи
2. **Создайте первый прогон** во фронте
3. **Посмотрите, как работает!** 🚀

Воркер автоматически возьмет задачи из DynamoDB, как только вы создадите их с фронтенда!
