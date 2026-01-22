# AWS EC2 Backend Deployment Guide

## Архитектура

```
Netlify (Фронтенд) → AWS EC2 Backend API → AWS DynamoDB
                  ↓
                SSH Terminal
                  ↓
            AWS EC2 VM (SSH)

AWS EC2 Workers → AWS DynamoDB (polling)
```

## 🚀 Быстрый старт

### 1. SSH на AWS машину

```bash
ssh -i /path/to/key.pem ubuntu@100.48.93.18
```

### 2. Скопировать обновленный проект

```bash
cd /home/ubuntu
git clone <твой-репо-url> o2-netlify
cd o2-netlify
```

Или если уже есть репо - обновить:
```bash
cd /home/ubuntu/o2
git pull origin main
```

### 3. Установить зависимости

```bash
npm install
```

### 4. Настроить .env для AWS

Скопируй `.env.aws` в `.env`:
```bash
cp .env.aws .env
```

Обнови в `.env`:
```env
# Одинаковые для всех машин (замени на СВОИ ЗНАЧЕНИЯ!)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA_YOUR_REAL_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_REAL_SECRET_KEY

# SSH Terminal конфиг (подключение К этой машине)
SSH_VM_IP=100.48.93.18
SSH_USERNAME=ubuntu
SSH_KEY_PATH=./a.pem

# Для продакшена
NODE_ENV=production
PORT=3000
BROWSER_HEADLESS=true
```

### 5. Установить a.pem на AWS

На твоём компе:
```bash
# Если нет a.pem, создай или получи от AWS
scp -i /path/to/key.pem ~/Desktop/a.pem ubuntu@100.48.93.18:/home/ubuntu/o2/a.pem

# На AWS машине - установить права
ssh -i /path/to/key.pem ubuntu@100.48.93.18
chmod 600 /home/ubuntu/o2/a.pem
```

### 6. Запустить Backend API с PM2

```bash
# На AWS машине
cd /home/ubuntu/o2

# Запустить Backend (Next.js API server)
pm2 start "npm run build:aws && npm run start:aws" --name backend --cwd /home/ubuntu/o2

# Или через next dev (для debug)
pm2 start "npm run dev" --name backend --cwd /home/ubuntu/o2

# Запустить Workers (уже как раньше)
pm2 start "xvfb-run -a npm run worker" --name worker --cwd /home/ubuntu/o2

# Сохранить PM2 конфиг
pm2 save
pm2 startup
```

### 7. Настроить SSL/HTTPS (рекомендуется)

```bash
# Установить Certbot
sudo apt-get install certbot python3-certbot-nginx

# Получить SSL сертификат
sudo certbot certonly --standalone -d your-aws-domain.com

# Или использовать reverse proxy (nginx)
sudo apt-get install nginx
# Настроить nginx как reverse proxy для port 3000
```

### 8. Получить IP/домен Backend API

На AWS машине:
```bash
# IP
curl -s http://checkip.amazonaws.com

# Или используй Elastic IP (рекомендуется)
# https://console.aws.amazon.com/ec2 → Elastic IPs
```

**Твой Backend URL:** `http://100.48.93.18:3000` или `https://your-domain.com`

---

## 🔗 Настроить Netlify для подключения к Backend

1. **Перейди в Netlify UI** → Site settings → Build & deploy → Environment

2. **Добавь переменные:**
   ```
   NEXT_PUBLIC_API_URL = http://100.48.93.18:3000
   REACT_APP_API_URL = http://100.48.93.18:3000
   ```

3. **Если используешь домен вместо IP:**
   ```
   NEXT_PUBLIC_API_URL = https://backend.your-domain.com
   REACT_APP_API_URL = https://backend.your-domain.com
   ```

---

## ✅ Проверить что работает

### 1. Backend API (на AWS)

```bash
# На AWS машине
curl -s http://localhost:3000/api/adsterra/runs | jq .

# Или с фронтенда (Netlify)
curl -s http://100.48.93.18:3000/api/adsterra/runs | jq .
```

### 2. SSH Terminal (с фронтенда)

- Открой Netlify URL
- Кликни кнопку 🖥️ Terminal
- Должно автоподключиться к AWS VM

### 3. Workers слушают Backend

На AWS машине:
```bash
pm2 logs worker
```

Должно видеть polling `/api/adsterra/runs` каждые 1 секунду

---

## 🛠️ Полезные команды

```bash
# Логи Backend
pm2 logs backend

# Логи Workers
pm2 logs worker

# Логи всего
pm2 logs

# Перезагрузить Backend
pm2 restart backend

# Остановить всё
pm2 stop all

# Удалить процессы
pm2 delete all
```

---

## 🔍 Troubleshooting

### Backend не запускается
```bash
# Проверить ошибки
npm run build:aws
npm run start:aws

# Может быть проблема с портом
sudo lsof -i :3000
```

### SSH Terminal не подключается
```bash
# Проверить что a.pem существует
ls -la ./a.pem

# Права на файл
chmod 600 ./a.pem

# Проверить SSH подключение с компа
ssh -i a.pem ubuntu@100.48.93.18
```

### Workers не видят Backend
```bash
# Проверить что Backend работает
curl -s http://localhost:3000/api/adsterra/runs

# Проверить AWS Security Group (порт 3000 открыт)
# https://console.aws.amazon.com/ec2 → Security Groups
```

### CORS ошибки

Добавь в Backend `.env`:
```env
CORS_ORIGIN=https://your-netlify-site.netlify.app
```

И в `/src/app/api/terminal/route.ts` добавь CORS headers:
```typescript
response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
response.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
```

---

## 📊 Структура после деплоя

```
Твой компьютер: ВЫКЛЮЧЕН ✅

Netlify: 
  - Фронтенд (React)
  - 🖥️ Terminal кнопка → подключается к Backend

AWS EC2:
  - Backend API (Next.js /api/...)
  - Workers (pm2, polling)
  - SSH доступ через Terminal

AWS DynamoDB:
  - AdsterraRuns (очередь заданий)
  - AdsterraJobs (статус)
```

---

**Готово!** Теперь компьютер можно выключать, всё работает 24/7 на AWS и Netlify! 🚀
