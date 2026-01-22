# Гайд по настройке Windows EC2 — пошагово

## Предварительные требования

- Запущенный Windows EC2 (c6i.xlarge или выше)
- Настроен RDP-доступ (Security Group разрешает порт 3389)
- Пароль Windows получен в консоли EC2

---

## Шаг 1: Подключение к EC2 по RDP

### На вашем ПК:

1. **Нажмите `Win + R`**
2. **Введите:** `mstsc` (Remote Desktop Connection)
3. **Укажите публичный IP EC2** (из консоли EC2)
4. **Нажмите «Connect»**
5. **Введите данные:**
   - Username: `Administrator`
   - Password: (EC2 Console → Connect → Get Windows Password)

**Теперь вы должны увидеть рабочий стол Windows на EC2!**

---

## Шаг 2: Скачайте скрипт установки

### Вариант A: скачать с GitHub (рекомендуется)

1. **Откройте браузер** на EC2
2. **Перейдите в репозиторий GitHub**
3. **Откройте:** `adsterra/scripts/setup-ec2-windows.ps1`
4. **Нажмите «Raw»** (просмотр исходника)
5. **Сохраните как:** `C:\setup-ec2-windows.ps1`

### Вариант B: скопировать с локального ПК

1. **На своем ПК** скопируйте `adsterra/scripts/setup-ec2-windows.ps1`
2. **В RDP** откройте Проводник
3. **Вставьте файл** в `C:\setup-ec2-windows.ps1`

---

## Шаг 3: Запустите скрипт установки

1. **Откройте PowerShell от имени администратора:**
   - ПКМ по «Пуск»
   - Выберите «Windows PowerShell (Admin)»

2. **Перейдите в C:\:**
   ```powershell
   cd C:\
   ```

3. **Разрешите выполнение скриптов** (только первый запуск):
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

4. **Запустите скрипт:**
   ```powershell
   .\setup-ec2-windows.ps1
   ```

5. **Следуйте подсказкам:**
   - Введите URL вашего GitHub-репозитория при запросе
   - Скрипт установит все автоматически

**Займет 10-15 минут** (в основном скачивание/установка)

---

## Шаг 4: Настройка переменных окружения

1. **Откройте .env:**
   ```powershell
   notepad C:\AdsenseLoading\adsterra\.env
   ```

2. **Обновите значения:**
   ```env
   BRIGHTDATA_PASSWORD=ваш-настоящий-пароль
   AWS_REGION=us-east-1
   # Добавьте AWS-ключи, если нет IAM role:
   # AWS_ACCESS_KEY_ID=your-key
   # AWS_SECRET_ACCESS_KEY=your-secret
   ```

3. **Сохраните и закройте** (Ctrl+S и закрыть)

---

## Шаг 5: Запуск воркера

1. **Откройте PowerShell** (обычный, не админ)

2. **Перейдите в папку adsterra:**
   ```powershell
   cd C:\AdsenseLoading\adsterra
   ```

3. **Запустите воркер через PM2:**
   ```powershell
   pm2 start ecosystem.config.js
   ```

4. **Сохраните конфиг PM2** (для автозапуска после ребута):
   ```powershell
   pm2 save
   ```

5. **Включите автозапуск PM2 при загрузке Windows:**
   ```powershell
   pm2-startup install
   ```
   (следуйте инструкциям в выводе)

---

## Шаг 6: Проверка работы

1. **Статус PM2:**
   ```powershell
   pm2 status
   ```
   Должно быть `adsterra-worker` в статусе "online"

2. **Логи:**
   ```powershell
   pm2 logs adsterra-worker
   ```
   Должно быть видно, что воркер опрашивает задания

3. **Проверка обработки:**
- В логах: "Polling for jobs..." или "No jobs available"
- Значит, подключен к DynamoDB и работает!

---

## Ежедневный воркфлоу

### Запуск (с локального ПК или фронтенда в облаке):

1. **Создайте прогон** во фронте (профит, распределение и т.д.)
2. **Нажмите «Start Production»**
3. **Фронтенд создаст джобы в DynamoDB**
4. **EC2-воркер подхватит их сам** (за секунды)
5. **Можно наблюдать браузеры** через RDP (по желанию)
6. **Мониторинг прогресса** во фронтенде

### Мониторинг на EC2:

```powershell
# Статус
pm2 status

# Онлайн-логи
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

# Подтянуть свежий код
git pull

# Установить новые зависимости (если менялся package.json)
cd adsterra
npm install

# Рестарт воркера
pm2 restart adsterra-worker
```

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
   - **Нет .env:** создайте по шаблону
   - **Неверные креды:** проверьте .env
   - **Доступ к DynamoDB:** проверьте AWS-ключи
   - **Конфликт портов:** маловероятно, но проверьте

### Нет подключения к DynamoDB?

1. **Проверьте AWS-ключи в .env**
2. **Или используйте IAM role** (прикрепите к инстансу права DynamoDB)
3. **Проверьте подключение:**
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

### PM2 не работает?

1. **Переустановите PM2:**
   ```powershell
   npm install -g pm2 pm2-windows-startup
   ```

2. **Запускайте PowerShell от админа** для команд PM2

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

# Удалить воркер из PM2
pm2 delete adsterra-worker

# Информация PM2
pm2 info adsterra-worker

# Мониторинг (CPU, память)
pm2 monit
```

---

## Заметки по безопасности

1. **Безопасность RDP:**
   - Разрешайте только свой IP в Security Group
   - Используйте сложный пароль Windows
   - Рассмотрите AWS Systems Manager Session Manager

2. **Защитите .env:**
   - Там чувствительные креды
   - Не коммитьте в Git
   - Храните безопасно

3. **AWS-ключи:**
   - Лучше всего IAM role на EC2
   - Альтернатива: ключи в .env (менее безопасно)

---

## Далее

1. ✅ **EC2-воркер запущен** — обрабатывает джобы автоматически
2. **Задеплойте фронтенд** на Vercel/DigitalOcean (опционально)
3. **Создайте первый прогон** во фронтенде
4. **Смотрите, как работает!** 🚀

---

## Поддержка

Если возникли проблемы:
1. Смотрите логи PM2: `pm2 logs adsterra-worker`
2. Проверьте настройки в .env
3. Убедитесь в доступе к DynamoDB
4. Проверьте настройки Security Group

Воркер автоматически возьмет задачи из DynamoDB, как только вы создадите их из фронтенда!
