# Руководство по продакшен-настройке Windows EC2

## 🎯 Рекомендации по спецификации EC2

### Для 25 одновременных браузеров:

**Рекомендуется: `c6i.4xlarge`**
- **vCPU:** 16
- **RAM:** 32 GB
- **Стоимость:** ~$680/месяц (on-demand) или ~$200/месяц (reserved на 1 год)
- **Почему:** комфортно держит 25 браузеров в headed-режиме

**Альтернатива (если бюджет ограничен): `c6i.2xlarge`**
- **vCPU:** 8
- **RAM:** 16 GB  
- **Стоимость:** ~$340/месяц (on-demand)
- **Почему:** может потянуть, но на 25 браузеров будет впритык

### Расчет ресурсов:
- **25 одновременных браузеров** × **400MB каждый** = 10GB RAM
- **Оверхед Windows:** ~3GB
- **Node.js/PM2:** ~500MB
- **Запас:** ~5GB
- **Итого нужно:** ~18-20GB → **рекомендуем 32GB**

---

## 🚀 Продакшен-настройка (IDE не нужна)

### Шаг 1: Создайте Windows-инстанс EC2

1. **AWS Console** → EC2 → Launch Instance
2. **AMI:** Windows Server 2022 Base
3. **Instance Type:** `c6i.4xlarge` (или `c6i.2xlarge`, если бюджет ограничен)
4. **Storage:** минимум 50GB SSD
5. **Security Group:** разрешите RDP (порт 3389) только с вашего IP
6. **Key Pair:** создайте/скачайте .pem (для получения пароля)

---

### Шаг 2: Подключение по RDP (однократно)

1. **Получите пароль Windows:**
   - EC2 Console → выбрать инстанс → Connect → Get Windows Password
   - Расшифруйте парол .pem-ключом

2. **Подключитесь:**
   - Windows: `Win + R` → `mstsc` → ввести Public IP
   - Mac: приложение Microsoft Remote Desktop
   - Username: `Administrator`

---

### Шаг 3: Запустите скрипт установки (автоматически)

1. **Откройте PowerShell от имени администратора** на EC2

2. **Скачайте скрипт:**
   ```powershell
   cd C:\
   Invoke-WebRequest -Uri "https://raw.githubusercontent.com/footyamigo/adsterra/main/scripts/setup-ec2-windows.ps1" -OutFile "setup.ps1"
   ```

3. **Запустите установку:**
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   .\setup.ps1
   ```

4. **Следуйте подсказкам** (введите URL репозитория GitHub)

**Что установится:**
- Node.js 20
- Git
- Клон репозитория
- Зависимости
- Браузеры Playwright
- PM2
- Создание .env

---

### Шаг 4: Настройте файл .env

```powershell
notepad C:\AdsenseLoading\adsterra\.env
```

**Обновите значения:**
```env
# BrightData
BRIGHTDATA_PASSWORD=your-password

# AWS (or use IAM role)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret

# Browser (headed mode)
BROWSER_HEADLESS=false

# Timing (10-30 seconds)
MIN_AD_WAIT=10000
MAX_AD_WAIT=30000

# Concurrency (adjust based on instance size)
MAX_CONCURRENT_BROWSERS=25
```

---

### Шаг 5: Запустите воркер в PM2 (продакшен)

**PM2 работает в фоне — IDE не нужна!**

```powershell
cd C:\AdsenseLoading\adsterra

# Старт воркера
pm2 start ecosystem.config.js

# Сохранить конфиг PM2 (переживает ребут)
pm2 save

# Автозапуск при загрузке Windows
pm2-startup install
```

**Готово!** Воркер работает в фоне.

---

### Шаг 6: Отключите RDP (по желанию)

**Можно закрыть RDP!** PM2 держит воркер запущенным.

**Чтобы подключиться позже:**
- Подключитесь по RDP
- Статус: `pm2 status`
- Логи: `pm2 logs adsterra-worker`

---

## 📊 Мониторинг (без RDP)

### Вариант 1: CloudWatch Logs (рекомендуется)

Настройте CloudWatch agent, чтобы стримить логи PM2 в AWS CloudWatch.

### Вариант 2: SSH/Terminal

Используйте AWS Systems Manager Session Manager (RDP не нужен).

### Вариант 3: Дашборд фронтенда

Фронтенд показывает статусы из DynamoDB в реальном времени.

---

## 🔄 Ежедневные операции

### Обновить код:
```powershell
# Подключитесь по RDP (или Session Manager)
cd C:\AdsenseLoading
git pull
cd adsterra
npm install  # if dependencies changed
pm2 restart adsterra-worker
```

### Проверить статус:
```powershell
pm2 status
pm2 logs adsterra-worker --lines 50
```

### Рестарт воркера:
```powershell
pm2 restart adsterra-worker
```

---

## ❓ FAQ

### Q: Нужно ли собирать в EXE?
**A: Нет!** PM2 запускает `tsx src/worker.ts` напрямую.

### Q: Можно закрыть RDP?
**A: Да!** PM2 работает как сервис, воркер продолжает работу.

### Q: Он стартует после ребута?
**A: Да!** `pm2-startup install` включает автозапуск.

### Q: Cursor/IDE тормозит?
**A: Не запускайте Cursor на EC2!** Используйте только PM2, RDP — по необходимости.

### Q: Как снизить лаги?
**A:**
1. Не запускайте Cursor/IDE на EC2
2. Используйте PM2 (фон)
3. Закрывайте RDP, когда не нужен
4. Используйте `c6i.4xlarge` (32GB RAM) для 25 браузеров

---

## 💰 Оптимизация стоимости

### Вариант 1: Reserved Instances (1 год)
- **c6i.4xlarge:** ~$200/месяц (против $680 on-demand)
- **Экономия:** 70%

### Вариант 2: Spot Instances
- **c6i.4xlarge:** ~$200/месяц (может прерываться)
- **Риск:** инстанс могут завершить (PM2 перезапустится)

### Вариант 3: Расписание Start/Stop
- Работать только в рабочие часы
- Останавливать ночью (экономия ~50%)

---

## ✅ Чеклист продакшена

- [ ] EC2 инстанс создан (`c6i.4xlarge` рекомендуется)
- [ ] RDP настроен
- [ ] Скрипт установки прошел успешно
- [ ] .env настроен с кредами
- [ ] Воркер PM2 запущен и сохранен
- [ ] PM2 startup включен
- [ ] Протестировано на малом прогоне (10 показов)
- [ ] Проверен запуск браузеров
- [ ] RDP отключен (воркер продолжает работать)
- [ ] На фронтенде видно обработку задач

---

## 🎯 Итог

**Что НЕ нужно:**
- ❌ Cursor/IDE на EC2
- ❌ Собрать в EXE
- ❌ Держать RDP открытым
- ❌ Ручной менеджмент процессов

**Что нужно:**
- ✅ PM2 (работает в фоне)
- ✅ Правильный инстанс (`c6i.4xlarge` для 25 браузеров)
- ✅ Файл .env с кредами
- ✅ Разовая настройка через RDP, потом отключиться

**Воркер работает 24/7 в фоне и автоматически обрабатывает задачи!**
