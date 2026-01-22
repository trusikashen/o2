# Netlify Deploy - Пошаговая инструкция

## 1️⃣ Подготовить локальный код

```bash
cd c:\Users\Nemesis\Desktop\origin-v1
git status
git add -A
git commit -m "Add authentication and AWS deployment"
git push origin main
```

---

## 2️⃣ Перейти на Netlify

1. Открыть https://app.netlify.com
2. Если нет аккаунта - создать (рекомендуется через GitHub для проще)

---

## 3️⃣ Создать новый сайт

### Способ 1: Через UI (проще) ✅

1. В Netlify → **New site from Git**
2. Выбрать **GitHub** (или GitLab/Bitbucket)
3. Авторизоваться если нужно
4. Найти репо `origin-v1` и нажать
5. Netlify должен автоматически обнаружить `netlify.toml`

**Проверить Build settings:**
- Build command: `npm run build:netlify`
- Publish directory: `out`

Если не подставилось автоматически - установить вручную

### Способ 2: Через Netlify CLI

```bash
npm install -g netlify-cli
netlify login
cd c:\Users\Nemesis\Desktop\origin-v1
netlify init
```

---

## 4️⃣ Добавить переменные окружения

В Netlify UI:
1. **Site settings** (в меню слева)
2. **Build & deploy**
3. **Environment**
4. **Edit variables**

Добавить переменные (нажать "Add variable" для каждой):

```
NEXT_PUBLIC_API_URL = http://100.48.93.18:3000
REACT_APP_API_URL = http://100.48.93.18:3000

APP_USERNAME = admin
APP_PASSWORD = your_secure_password_here

NEXT_PUBLIC_APP_NAME = Adsterra Bot System
NEXT_PUBLIC_ENVIRONMENT = production
```

**ВАЖНО:**
- `NEXT_PUBLIC_API_URL` - IP/домен твоего AWS Backend
- `APP_USERNAME` и `APP_PASSWORD` - для логина в приложение (только ты должен знать!)

---

## 5️⃣ Запустить деплой

### Способ 1: Автоматически (GitHub)
- Каждый `git push origin main` → автоматический деплой на Netlify

### Способ 2: Вручную в UI
- В Netlify: **Deploys** → **Trigger deploy** → **Deploy site**

### Способ 3: Через CLI
```bash
netlify deploy --prod
```

---

## 6️⃣ Ждёшь развёртывания

Процесс примерно 2-5 минут:
- Netlify скачивает код с GitHub
- Запускает `npm run build:netlify`
- Выгружает статику в CDN

Когда готово - получишь URL:
```
https://my-awesome-adsterra.netlify.app
```

---

## 7️⃣ Тестирование

### Открыть фронтенд

```
https://my-awesome-adsterra.netlify.app
```

Должна показаться **страница логина**

### Логин

- Username: `admin` (или что ты установил в `APP_USERNAME`)
- Password: `your_secure_password_here`

### После логина

- Должна открыться страница Adsterra
- Кнопка 🖥️ Terminal должна работать
- API запросы должны идти на `http://100.48.93.18:3000`

### Проверить консоль (DevTools)

F12 → Network tab:
- Должны видеть запросы на `/api/adsterra/...`
- Должны видеть запросы на SSH Terminal `/api/terminal/...`

---

## 8️⃣ Настройка домена (опционально)

Если хочешь свой домен вместо `netlify.app`:

1. В Netlify: **Site settings** → **Domain management**
2. **Add custom domain** → ввести твой домен
3. Следовать инструкциям по настройке DNS

---

## 9️⃣ HTTPS (автоматически)

Netlify автоматически выдаёт SSL сертификат Let's Encrypt ✅

Все запросы автоматически переходят на HTTPS

---

## 📱 Использовать на iPhone

1. Открыть Safari на iPhone
2. Ввести URL Netlify: `https://my-awesome-adsterra.netlify.app`
3. **Share** (нижняя кнопка) → **Add to Home Screen**
4. Теперь это иконка на рабочем столе (как приложение)

---

## 🔄 Обновления

### Обновить фронтенд

```bash
# На компе
cd c:\Users\Nemesis\Desktop\origin-v1
git add .
git commit -m "Update frontend"
git push origin main

# Netlify автоматически развернёт изменения ~2-5 минут
```

### Обновить Backend API

```bash
# На AWS машине
cd /home/ubuntu/o2
git pull origin main
npm install

# Перезагрузить Backend
pm2 restart backend
```

---

## 🛠️ Troubleshooting

### Деплой не работает

Проверить логи в Netlify:
1. **Deploys** → нажать на failed deploy
2. Посмотреть **Build log**

Частые ошибки:
- Неустановленные зависимости: `npm install` локально
- TypeScript ошибки: `npm run build:netlify` локально
- Неправильный путь к файлам

### API не доступен

Проверить:
1. Backend работает на AWS: `curl -s http://100.48.93.18:3000/api/adsterra/runs`
2. Переменная `NEXT_PUBLIC_API_URL` правильно установлена в Netlify
3. AWS Security Group открыт порт 3000

### Логин не работает

Проверить:
1. Username/Password совпадают (регистр важен!)
2. Backend работает (может быть CORS ошибка)
3. DevTools → Console → есть ли ошибки

### SSH Terminal не подключается

Проверить:
1. Backend на AWS работает
2. a.pem скопирован на AWS
3. Права на a.pem: `chmod 600 a.pem`

---

## 📊 Финальная архитектура

```
📱 iPhone (Safari) 
    ↓
🌐 Netlify фронтенд (https://...)
    ├─→ Login: admin / password ✅
    ├─→ 🖥️ Terminal → SSH на AWS VM
    ├─→ API → http://100.48.93.18:3000
    └─→ Workers monitoring

☁️ AWS Backend API (http://100.48.93.18:3000)
    ├─→ /api/terminal (SSH подключение)
    ├─→ /api/adsterra/runs (управление)
    ├─→ /api/auth/login (аутентификация)
    └─→ Workers (polling каждую секунду)

💾 AWS DynamoDB
    └─→ Очередь заданий + статусы
```

---

## ✅ Готово!

Теперь у тебя:
- ✅ **Фронтенд на Netlify** - работает 24/7 и доступен с iPhone
- ✅ **Защита паролем** - только ты можешь залогиниться
- ✅ **Backend на AWS** - управляет ботами и SSH терминалом
- ✅ **Workers на AWS** - качают impressions автоматически

**Компьютер можно выключать!** Всё работает на AWS + Netlify ☁️

---

**Следующий шаг:** Открыть Netlify URL и залогиниться! 🎉
