# 🚀 Полный гайд: Компьютер выключен, всё работает 24/7

## 📋 Содержание

1. [Архитектура](#архитектура)
2. [Шаг 1: AWS Клонирование](#шаг-1-aws-клонирование)
3. [Шаг 2: Netlify Деплой](#шаг-2-netlify-деплой)
4. [Шаг 3: Первый запуск](#шаг-3-первый-запуск)
5. [Функции](#функции)

---

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│ 📱 iPhone / Браузер                                          │
│ (Только логин + пароль для доступа)                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ↓
        ┌──────────────────────┐
        │ 🌐 Netlify Фронтенд  │  (https://your-site.netlify.app)
        │ • React компоненты   │  • Автоматический HTTPS
        │ • xterm.js терминал  │  • CDN, безопасно, быстро
        │ • Логин страница     │
        └──────────┬───────────┘
                   │ API запросы
                   ↓
        ┌──────────────────────┐
        │ ☁️  AWS Backend API   │  (http://100.48.93.18:3000)
        │ • /api/adsterra/*    │  • Next.js 14
        │ • /api/terminal      │  • SSH подключение
        │ • /api/auth/login    │  • DynamoDB работа
        └──────────┬───────────┘
                   │
        ┌──────────┴───────────┐
        ↓                      ↓
    ┌─────────────┐    ┌──────────────┐
    │  Workers    │    │  DynamoDB    │
    │ (pm2)       │    │ • Runs       │
    │ • Polling   │    │ • Jobs       │
    │ • Headless  │    │ • Queue      │
    │ • xvfb      │    │              │
    └─────────────┘    └──────────────┘
```

---

## 📝 Фазы деплоя

### Фаза 1: AWS Backend (⏱️ ~20 минут)
- Клонировать проект на AWS
- Установить зависимости
- Запустить Backend API (port 3000)
- Запустить Workers (pm2)

### Фаза 2: Netlify Фронтенд (⏱️ ~10 минут)
- Подключить GitHub репо к Netlify
- Добавить переменные окружения
- Запустить автоматический деплой
- Получить публичный URL

### Фаза 3: Первый запуск (⏱️ ~5 минут)
- Открыть Netlify URL
- Залогиниться (username/password)
- Тестировать функции

---

## 🎯 Шаг 1: AWS Клонирование

### 1.1 SSH на AWS машину

```bash
ssh -i "path/to/key.pem" ubuntu@100.48.93.18
```

### 1.2 Клонировать проект

```bash
cd /home/ubuntu
git clone https://github.com/YOUR_USERNAME/o2.git o2
cd o2
npm install
```

### 1.3 Настроить .env

```bash
nano .env
```

**Скопировать и добавить:**
```env
# AWS Credentials (ЗАМЕНИ!)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=YOUR_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET

DYNAMODB_ADSTERRA_RUNS_TABLE=AdsterraRuns
DYNAMODB_ADSTERRA_JOBS_TABLE=AdsterraJobs

# SSH Terminal
SSH_VM_IP=100.48.93.18
SSH_USERNAME=ubuntu
SSH_KEY_PATH=./a.pem

# Backend
NODE_ENV=production
PORT=3000
BROWSER_HEADLESS=true

# Аутентификация фронтенда
APP_USERNAME=admin
APP_PASSWORD=your_password

# Прокси (скопируй из локального .env)
BRIGHTDATA_HOST=...
BRIGHTDATA_PORT=...
# ... и т.д
```

Сохранить: `Ctrl+O` → Enter → `Ctrl+X`

### 1.4 Копировать a.pem

**На твоём компе:**
```bash
scp -i "key.pem" "a.pem" ubuntu@100.48.93.18:/home/ubuntu/o2/a.pem
```

**На AWS:**
```bash
chmod 600 /home/ubuntu/o2/a.pem
```

### 1.5 Запустить Backend + Workers

```bash
cd /home/ubuntu/o2
npm run build:aws

# Backend
pm2 start "npm run start:aws" --name backend --cwd /home/ubuntu/o2

# Workers
pm2 start "xvfb-run -a npm run worker" --name worker --cwd /home/ubuntu/o2

# Сохранить
pm2 save
pm2 startup
```

### 1.6 Проверить что работает

```bash
# Тест API
curl -s http://localhost:3000/api/adsterra/runs | jq .

# Логи
pm2 logs backend
pm2 logs worker
```

✅ **AWS готов!** Backend работает на `http://100.48.93.18:3000`

---

## 🌐 Шаг 2: Netlify Деплой

### 2.1 Подготовить код

```bash
# На компе
cd c:\Users\Nemesis\Desktop\origin-v1
git add -A
git commit -m "Add AWS deployment + authentication"
git push origin main
```

### 2.2 Перейти на Netlify

1. Открыть https://app.netlify.com
2. Создать аккаунт (через GitHub проще)
3. **New site from Git** → GitHub → найти `origin-v1`

### 2.3 Добавить переменные окружения

В Netlify: **Site settings** → **Build & deploy** → **Environment**

```
NEXT_PUBLIC_API_URL = http://100.48.93.18:3000
REACT_APP_API_URL = http://100.48.93.18:3000
APP_USERNAME = admin
APP_PASSWORD = your_secure_password
```

### 2.4 Деплой

Нажать **Deploy site** или сделать `git push` (автоматический деплой)

Ждёшь 2-5 минут...

✅ **Netlify готов!** Получишь URL вроде `https://my-site.netlify.app`

---

## 🔐 Шаг 3: Первый запуск

### 3.1 Открыть фронтенд

```
https://my-site.netlify.app
```

### 3.2 Залогиниться

- Username: `admin` (или что ты установил)
- Password: `your_secure_password`

### 3.3 Тестировать

✅ Должна открыться страница Adsterra  
✅ Кнопка 🖥️ Terminal должна работать (подключится через SSH)  
✅ Создание runs должно работать (API → AWS Backend)  
✅ Workers должны работать (polling)  

---

## ✨ Функции

### 🖥️ SSH Terminal
- Кликни кнопку Terminal на фронтенде
- Автоматически подключается к AWS VM
- Можешь запускать команды прямо с iPhone

### 🤖 Управление ботами
- Создание runs
- Мониторинг статуса
- Просмотр статистики

### 🔐 Аутентификация
- Логин/пароль для доступа
- Сохраняется в localStorage (24 часа)
- Выход кнопка внизу страницы

### 📱 Mobile-friendly
- Полностью работает на iPhone
- Можно добавить как приложение на Home Screen
- Доступен 24/7 через Netlify

---

## 🛠️ Полезные команды

### На AWS машине

```bash
# Статус процессов
pm2 status

# Логи
pm2 logs backend
pm2 logs worker

# Рестарт
pm2 restart backend
pm2 restart worker

# Остановить
pm2 stop all

# Удалить
pm2 delete all
```

### На компе

```bash
# Локальный деплой (тестирование)
npm run dev

# Сборка для Netlify
npm run build:netlify

# Preview
npm run preview

# SSH на AWS
ssh -i "key.pem" ubuntu@100.48.93.18
```

---

## 🔄 Обновления

### Обновить фронтенд

```bash
# На компе
git add .
git commit -m "Update frontend"
git push origin main
# Netlify автоматически развернёт (~2-5 минут)
```

### Обновить Backend

```bash
# На AWS
cd /home/ubuntu/o2
git pull origin main
npm install
pm2 restart backend
```

---

## 🚨 Troubleshooting

### API не доступен

```bash
# На AWS проверить
curl -s http://localhost:3000/api/adsterra/runs

# Проверить Security Group (открыт ли порт 3000)
# https://console.aws.amazon.com/ec2 → Security Groups
```

### SSH Terminal не работает

```bash
# На AWS проверить a.pem
ls -la /home/ubuntu/o2/a.pem
chmod 600 /home/ubuntu/o2/a.pem

# Проверить логи Backend
pm2 logs backend | grep -i ssh
```

### Логин не работает

Проверить:
1. Username/Password совпадают (регистр важен!)
2. Backend работает
3. DevTools Console → есть ли ошибки

---

## 📊 Финальное состояние

```
✅ Компьютер: ВЫКЛЮЧЕН (не нужен!)
✅ Фронтенд: На Netlify (24/7, автоматический HTTPS)
✅ Backend: На AWS EC2 (24/7, работает как надо)
✅ Workers: На AWS (24/7, качают impressions)
✅ SSH Terminal: Работает с iPhone
✅ Аутентификация: Защита паролем
✅ iPhone: Приложение на Home Screen
```

---

## 📚 Документация

- [AWS_QUICK_START.md](AWS_QUICK_START.md) - Детальный гайд AWS
- [NETLIFY_DEPLOY.md](NETLIFY_DEPLOY.md) - Детальный гайд Netlify
- [TERMINAL_SETUP.md](TERMINAL_SETUP.md) - SSH Terminal конфигурация
- [DEPLOYMENT_AWS_BACKEND.md](DEPLOYMENT_AWS_BACKEND.md) - Арная информация про Backend

---

## 🎉 Готово!

Теперь у тебя есть полностью автоматизированная система:
- Фронтенд на Netlify с защитой паролем
- Backend на AWS с SSH терминалом
- Workers качают impressions 24/7
- Компьютер можно выключать

**Наслаждайся! 🚀**

Любые вопросы - читай документацию или проверяй логи (`pm2 logs`).
