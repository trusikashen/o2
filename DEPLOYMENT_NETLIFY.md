# Netlify Deployment Guide

## Архитектура

```
📱 iPhone (или любой браузер)
    ↓
Netlify (Фронтенд React) → AWS Backend API
    ↓
🖥️ Terminal кнопка → SSH подключение к AWS VM
```

## 🚀 Быстрый старт

### 1. Подготовить репо

Убедись что в git есть все файлы:
```bash
git add -A
git commit -m "Add Netlify deployment config"
git push origin main
```

### 2. Создать Netlify аккаунт

- Перейти на https://netlify.com
- Зарегистрируйся (можно через GitHub)

### 3. Подключить репо к Netlify

**Вариант 1: Через UI (проще)**
1. В Netlify → New site from Git
2. Выбрать GitHub (или другой git provider)
3. Найти твой репо `origin-v1`
4. Netlify автоматически обнаружит `netlify.toml`

**Вариант 2: Через Netlify CLI**
```bash
npm install -g netlify-cli
netlify login
netlify init
```

### 4. Настроить Environment Variables

В Netlify UI:
1. Site settings → Build & deploy → Environment variables
2. Добавить переменные из `.env.netlify`:

```
NEXT_PUBLIC_API_URL = http://100.48.93.18:3000
REACT_APP_API_URL = http://100.48.93.18:3000
NEXT_PUBLIC_APP_NAME = Adsterra Bot System
NEXT_PUBLIC_ENVIRONMENT = production
```

**ВАЖНО:** Замени `100.48.93.18:3000` на твой реальный Backend URL:
- Если AWS машина имеет domain: `https://backend.your-domain.com`
- Если используешь IP: `http://100.48.93.18:3000`

### 5. Развернуть

```bash
# Локально (тест перед деплоем)
npm run build:netlify
npm run preview  # если есть

# Или просто push - Netlify автоматически развернёт
git push origin main
```

---

## ✅ Проверить что работает

### 1. Фронтенд доступен

- Перейди на URL Netlify (например: `https://my-adsterra.netlify.app`)
- Должна загрузиться страница

### 2. API подключение работает

- Открой DevTools (F12)
- Network tab
- Кликни на Adsterra страницу
- Должны видеть запросы на `http://100.48.93.18:3000/api/...`

### 3. SSH Terminal работает

- Кликни кнопку 🖥️ Terminal
- Должно откыться модальное окно
- Должно автоподключиться и показать терминал

---

## 🔗 Интеграция с AWS Backend

### 1. Backend должен быть запущен на AWS

```bash
# На AWS машине
pm2 start "npm run build:aws && npm run start:aws" --name backend
```

### 2. CORS настройка (если нужна)

Если видишь CORS ошибки:

В `.env` на AWS добавь:
```env
CORS_ORIGIN=https://your-netlify-site.netlify.app
```

### 3. Проверить что Backend доступен

```bash
# С твоего компа
curl -s http://100.48.93.18:3000/api/adsterra/runs
```

Должно вернуть JSON ответ (может быть пустой массив `[]`)

---

## 📱 Открыть на iPhone

1. Получи URL Netlify (например: `https://my-adsterra.netlify.app`)
2. На iPhone открой браузер
3. Введи URL
4. Скоро сохрани на Home Screen (Add to Home Screen)
5. Откроется как приложение

---

## 🛠️ Настройки Netlify

### Автоматический деплой при push

- Уже настроено в `netlify.toml`
- Каждый `git push` на main → автоматический деплой

### Предпросмотр (Preview Deploy)

- Каждый PR в GitHub → Netlify создаёт preview URL
- Отлично для тестирования перед merge

### Branch Deploy

```
main → production
staging → staging
```

---

## 🚨 Troubleshooting

### Деплой не работает

Проверить логи:
1. Netlify UI → Deploys
2. Нажать на failed deploy
3. Посмотреть Build log

Часто ошибка: неустановленные зависимости
```bash
# Локально переустанови
rm -rf node_modules
npm install
npm run build:netlify
```

### API не доступен с фронтенда

1. Проверить что Backend работает на AWS
2. Проверить Security Group на AWS (порт 3000 открыт)
3. Проверить Environment Variables в Netlify (правильный API URL)

### SSH Terminal не подключается

- Проверить что Backend работает
- Проверить что a.pem скопирован на AWS
- Проверить логи Backend: `pm2 logs backend`

---

## 📊 После деплоя

```
✅ Фронтенд на Netlify (всегда доступен)
✅ Backend на AWS EC2 (всегда работает)
✅ Workers на AWS (всегда работают)
✅ SSH Terminal (работает через Backend)
✅ Компьютер выключен (не нужен!)
```

**Готово! Можешь использовать на iPhone в любое время!** 🎉
