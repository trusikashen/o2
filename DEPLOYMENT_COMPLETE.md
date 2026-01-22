# 🚀 Полный гайд: Компьютер выключен, всё работает 24/7

## Финальная архитектура

```
📱 iPhone / Браузер
    ↓
🌐 Netlify (Фронтенд)
    ├─→ 🖥️ Terminal → SSH → AWS VM
    ├─→ /api/adsterra/runs → AWS Backend
    └─→ /api/adsterra/jobs → AWS Backend

☁️ AWS EC2 машина (всегда включена)
    ├─→ Backend API (Next.js, port 3000)
    ├─→ Workers (pm2, polling каждую секунду)
    ├─→ SSH Terminal доступ
    └─→ /home/ubuntu/o2 (проект)

💾 AWS DynamoDB
    ├─→ AdsterraRuns (очередь заданий)
    └─→ AdsterraJobs (статус)
```

---

## ✅ Этап 1: Подготовка (локально на компе)

### 1.1 Убедись что всё committed

```bash
cd c:\Users\Nemesis\Desktop\origin-v1
git status
git add -A
git commit -m "Add Netlify and AWS deployment configs + SSH Terminal"
git push origin main
```

### 1.2 Проверь что файлы есть

```bash
ls -la netlify.toml
ls -la .env.netlify
ls -la .env.aws
ls -la DEPLOYMENT_NETLIFY.md
ls -la DEPLOYMENT_AWS_BACKEND.md
```

**Файлы для деплоя:**
- ✅ netlify.toml
- ✅ .env.netlify
- ✅ .env.aws
- ✅ DEPLOYMENT_NETLIFY.md
- ✅ DEPLOYMENT_AWS_BACKEND.md

---

## ✅ Этап 2: AWS Backend (SSH на машину)

### 2.1 SSH на AWS

```bash
# Замени на свой путь к ключу
ssh -i "C:\Users\Nemesis\AWS\key.pem" ubuntu@100.48.93.18
```

Или через PuTTY / MobaXterm

### 2.2 Обновить проект

```bash
cd /home/ubuntu/o2
git pull origin main
npm install
```

### 2.3 Скопировать a.pem на AWS

**На твоём компе:**
```powershell
# Если нет a.pem, создай через AWS или используй существующий
scp -i "C:\Users\Nemesis\AWS\key.pem" "C:\Users\Nemesis\Desktop\origin-v1\a.pem" ubuntu@100.48.93.18:/home/ubuntu/o2/a.pem
```

**На AWS машине:**
```bash
chmod 600 /home/ubuntu/o2/a.pem
ls -la /home/ubuntu/o2/a.pem
```

### 2.4 Настроить .env на AWS

```bash
cd /home/ubuntu/o2
nano .env
```

Содержимое (или скопируй из `.env.aws`):
```env
# AWS Credentials (ЗАМЕНИ НА СВОИ!)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA_YOUR_REAL_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_REAL_SECRET_KEY
DYNAMODB_ADSTERRA_RUNS_TABLE=AdsterraRuns
DYNAMODB_ADSTERRA_JOBS_TABLE=AdsterraJobs

# SSH Terminal (для подключения К этой машине)
SSH_VM_IP=100.48.93.18
SSH_USERNAME=ubuntu
SSH_KEY_PATH=./a.pem

# Backend
NODE_ENV=production
PORT=3000
BROWSER_HEADLESS=true

# Остальное из .env.aws
BRIGHTDATA_HOST=brd.superproxy.io
BRIGHTDATA_PORT=33335
# ... и т.д
```

### 2.5 Запустить Backend с PM2

```bash
# Остановить старый backend если был
pm2 stop all
pm2 delete all

# Запустить Backend (Next.js API)
npm run build:aws
pm2 start "npm run start:aws" --name backend --cwd /home/ubuntu/o2

# Запустить Workers
pm2 start "xvfb-run -a npm run worker" --name worker --cwd /home/ubuntu/o2

# Сохранить конфиг
pm2 save
pm2 startup
```

### 2.6 Проверить что работает

```bash
# Проверить статус
pm2 status

# Проверить логи
pm2 logs backend
pm2 logs worker

# Тест API
curl -s http://localhost:3000/api/adsterra/runs | jq .
```

Должен вернуть: `[]` (пустой массив)

**Выход из SSH:**
```bash
exit
```

---

## ✅ Этап 3: Netlify Фронтенд

### 3.1 Перейти на Netlify

https://app.netlify.com/

### 3.2 Создать новый сайт

1. **New site from Git**
2. Выбрать **GitHub** (или другой)
3. Авторизоваться если нужно
4. Найти и выбрать репо `origin-v1`

### 3.3 Build Settings

Netlify должен автоматически обнаружить `netlify.toml`

Проверить:
- **Build command:** `npm run build:netlify`
- **Publish directory:** `out`

Если не автоматически, установить вручную.

### 3.4 Добавить Environment Variables

1. **Site settings** (в меню)
2. **Build & deploy**
3. **Environment**
4. **Edit variables**
5. Добавить:

```
NEXT_PUBLIC_API_URL = http://100.48.93.18:3000
REACT_APP_API_URL = http://100.48.93.18:3000
```

**ВАЖНО:** Если используешь домен вместо IP:
```
NEXT_PUBLIC_API_URL = https://backend.your-domain.com
REACT_APP_API_URL = https://backend.your-domain.com
```

### 3.5 Deploy

Нажать **Deploy site**

Ждёшь 2-5 минут пока деплоится...

Когда готово - получишь URL: `https://my-adsterra.netlify.app` (примерно)

---

## ✅ Этап 4: Тестирование

### 4.1 Проверить фронтенд

Открой URL Netlify в браузере:
```
https://my-adsterra.netlify.app/adsterra
```

Должна загрузиться страница с кнопкой **🖥️ Terminal**

### 4.2 Проверить API подключение

DevTools (F12) → Network tab

Должны видеть запросы на `http://100.48.93.18:3000/api/...`

Если видишь ошибку CORS - значит API не доступен (проверить AWS)

### 4.3 Тест SSH Terminal

1. Кликни **🖥️ Terminal**
2. Должно откыться окно с терминалом
3. Должно автоподключиться (показать "Connecting to: ubuntu@100.48.93.18")
4. Введи команду: `pwd`
5. Должно показать: `/home/ubuntu` или что-то похожее

### 4.4 Проверить Workers

На AWS машине:
```bash
ssh -i "key.pem" ubuntu@100.48.93.18
pm2 logs worker
```

Должен видеть polling каждую секунду

---

## 📱 Использовать на iPhone

1. Открой Safari на iPhone
2. Введи URL Netlify: `https://my-adsterra.netlify.app`
3. Нажми поделиться (Share)
4. **Add to Home Screen**
5. Теперь это иконка как приложение

Каждый раз кликаешь иконку - открывается фронтенд на Netlify ✅

---

## 🛠️ Полезные команды

### На AWS машине

```bash
# SSH подключение
ssh -i "key.pem" ubuntu@100.48.93.18

# Статус PM2
pm2 status
pm2 logs backend
pm2 logs worker

# Рестарт
pm2 restart backend
pm2 restart worker

# Остановить/запустить
pm2 stop backend
pm2 start backend

# Проверить API
curl -s http://localhost:3000/api/adsterra/runs
```

### На компе (PowerShell)

```bash
# Не нужно ничего! Компьютер выключен 😎
```

---

## 🔒 Безопасность

### Что защищено:

✅ **SSH Term** - использует SSH ключ (a.pem)
✅ **AWS Credentials** - в `.env` на AWS машине (не в Netlify)
✅ **DynamoDB** - доступен только из AWS (не из интернета)
✅ **Netlify** - только фронтенд (ничего критического)

### Что открыто:

⚠️ **Backend API** - доступен по IP (http://100.48.93.18:3000)
- Если нужна безопасность - закрыть за VPN или использовать HTTPS с сертификатом

---

## 🚨 Troubleshooting

### Фронтенд не загружается

```bash
# На компе - переделать локально и перепушить
npm run dev
# Проверить что работает
# Потом: git push origin main
```

### API не доступен с фронтенда

1. На AWS проверить Backend:
   ```bash
   curl -s http://localhost:3000/api/adsterra/runs
   ```

2. Проверить Security Group (AWS Console):
   - Должен быть открыт порт 3000 для входящего трафика

3. Проверить переменные в Netlify (правильный URL)

### SSH Terminal не работает

1. На AWS проверить a.pem:
   ```bash
   ls -la ./a.pem
   chmod 600 ./a.pem
   ```

2. Проверить Backend логи:
   ```bash
   pm2 logs backend | grep -i ssh
   ```

### Workers не работают

```bash
# На AWS
pm2 logs worker
pm2 restart worker
```

---

## 📊 Финальное состояние

```
✅ Компьютер: ВЫКЛЮЧЕН (не нужен!)
✅ Фронтенд: На Netlify (доступен 24/7)
✅ Backend: На AWS (работает 24/7)
✅ Workers: На AWS (работают 24/7)
✅ SSH Terminal: Работает с iPhone
✅ iPhone: Открыл приложение → работает
```

---

## 🎉 Готово!

Теперь у тебя есть:
1. **Фронтенд на Netlify** - можешь открыть с iPhone
2. **Backend на AWS** - работает 24/7
3. **Workers на AWS** - качают impressions 24/7
4. **SSH Terminal** - управляешь AWS машиной с iPhone
5. **Компьютер выключен** - экономишь электричество 💡

**Наслаждайся!** 🚀
