# AWS Клонирование и запуск

## 1️⃣ SSH на AWS машину

```bash
# Windows/PowerShell
ssh -i "C:\path\to\your\key.pem" ubuntu@100.48.93.18

# macOS/Linux
ssh -i ~/path/to/your/key.pem ubuntu@100.48.93.18

# Или через PuTTY / MobaXterm
```

---

## 2️⃣ Клонировать проект

Если это первый раз:
```bash
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/o2.git o2
cd o2
```

Если репо уже есть - обновить:
```bash
cd /home/ubuntu/o2
git pull origin main
npm install
```

---

## 3️⃣ Настроить .env на AWS

```bash
nano .env
```

Содержимое `.env` на AWS (замени на СВОИ ЗНАЧЕНИЯ):

```env
# AWS Credentials (ЗАМЕНИ НА СВОИ!)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA_YOUR_REAL_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_REAL_AWS_SECRET_KEY
DYNAMODB_ADSTERRA_RUNS_TABLE=AdsterraRuns
DYNAMODB_ADSTERRA_JOBS_TABLE=AdsterraJobs

# SSH Terminal Configuration
SSH_VM_IP=100.48.93.18
SSH_USERNAME=ubuntu
SSH_KEY_PATH=./a.pem

# Backend Configuration
NODE_ENV=production
PORT=3000
BROWSER_HEADLESS=true

# Прокси (скопируй из локального .env)
BRIGHTDATA_HOST=brd.superproxy.io
BRIGHTDATA_PORT=33335
BRIGHTDATA_USERNAME=brd-customer-xxxxx-zone-mobile_proxy1
BRIGHTDATA_PASSWORD=your_password
BRIGHTDATA_ZONE=mobile_proxy1

# Аутентификация фронтенда
APP_USERNAME=your_username
APP_PASSWORD=your_password

# Остальное из твоего .env
PROCESS_IMMEDIATELY=false
MAX_WORKER_THREADS=2
QUEUE_POLL_INTERVAL=1000
MAX_RETRIES=3
# ... и т.д
```

Сохранить: `Ctrl + O` → Enter → `Ctrl + X`

---

## 4️⃣ Копировать a.pem на AWS

**На твоём компе (PowerShell/Terminal):**

```powershell
# Windows PowerShell
scp -i "C:\path\to\aws\key.pem" "C:\path\to\a.pem" ubuntu@100.48.93.18:/home/ubuntu/o2/a.pem

# macOS/Linux
scp -i ~/path/to/aws/key.pem ~/path/to/a.pem ubuntu@100.48.93.18:/home/ubuntu/o2/a.pem
```

**На AWS машине (проверить права):**

```bash
chmod 600 /home/ubuntu/o2/a.pem
ls -la /home/ubuntu/o2/a.pem
```

---

## 5️⃣ Запустить Backend API

**На AWS машине:**

```bash
cd /home/ubuntu/o2

# Остановить старые процессы если были
pm2 stop all
pm2 delete all

# Собрать для продакшена
npm run build:aws

# Запустить Backend на порте 3000
pm2 start "npm run start:aws" --name backend --cwd /home/ubuntu/o2

# Проверить что работает
pm2 status

# Посмотреть логи
pm2 logs backend
```

Должно видеть:
```
▲ Next.js 14.2.35
- Local:        http://localhost:3000
```

---

## 6️⃣ Запустить Workers

```bash
# На AWS машине
cd /home/ubuntu/o2

# Запустить Workers (точно как было)
pm2 start "xvfb-run -a npm run worker" --name worker --cwd /home/ubuntu/o2

# Сохранить конфиг PM2
pm2 save
pm2 startup

# Проверить статус
pm2 status
```

---

## 7️⃣ Проверить что всё работает

### Backend доступен

```bash
# На AWS машине
curl -s http://localhost:3000/api/adsterra/runs | jq .

# Ответ должен быть: [] (пустой массив)
```

### Логи

```bash
# Backend логи
pm2 logs backend

# Worker логи
pm2 logs worker

# Все логи
pm2 logs
```

### Остановить/перезагрузить

```bash
# Рестарт Backend
pm2 restart backend

# Остановить Workers
pm2 stop worker

# Запустить заново
pm2 start worker

# Остановить всё
pm2 stop all
```

---

## 📝 Полезные команды

```bash
# Статус всех процессов
pm2 status

# Удалить все процессы
pm2 delete all

# Просмотр лога в реальном времени
pm2 logs backend --lines 50 --follow

# Информация о процессе
pm2 info backend

# Монитор (CPU, Memory)
pm2 monit

# Перезагрузка PM2
pm2 reload all
```

---

## 🚀 Готово!

Теперь на AWS работает:
- ✅ Backend API (http://100.48.93.18:3000)
- ✅ Workers (качают impressions)
- ✅ SSH Terminal (доступен через Netlify)

**Далее:** [DEPLOYMENT_NETLIFY.md](DEPLOYMENT_NETLIFY.md) - как задеплоить фронтенд на Netlify
