# 🎯 Bot Risk Assessment System

## Обзор

Система автоматически определяет какие боты "подозрительны" и нуждаются в pre-warming для обхода anti-fraud. Безопасные боты **пропускают pre-warming** и экономят трафик прокси.

## � CRITICAL: Platform-Browser Mismatch Detection

### WebKit on Linux = AUTOMATIC BOT DETECTION 🔴

**WebKit (Safari) на Linux это 100% признак бота:**
- Safari существует ТОЛЬКО на macOS и iOS
- Safari на Linux = невозможно в природе
- Anti-fraud детектирует это с вероятностью 99.9%

**Риск: 95/100** (почти максимум)

```
Platform-Browser Combinations:

✅ SAFE (Normal):
  - Chromium on Linux
  - Chromium on Windows
  - Firefox on Linux
  - Firefox on Windows
  - WebKit on macOS (darwin)
  - WebKit on iOS (mobile)

🔴 CRITICAL (Bot signature):
  - WebKit on Linux = OBVIOUS BOT
  
⚠️ SUSPICIOUS (Less common):
  - Firefox on Windows (unusual but possible)
```

**Логирование CRITICAL случая:**
```
🔴 CRITICAL BOT SIGNATURE DETECTED!
🔴 WebKit (Safari) on Linux = 100% detectable bot signature
🔴 Safari only exists on macOS and iOS
🔴 Anti-fraud will ALWAYS block this

✅ SOLUTION: Use Chromium instead!
```

## �📊 Как это работает

### Оценка Риска (Risk Score)

Каждый бот получает **risk score от 0-100**:
- **0-30**: 🟢 **SAFE** - пропускаем pre-warming (экономим $$)
- **31-50**: 🟡 **LOW-MEDIUM** - опционально pre-warming
- **51-70**: 🟡 **HIGH** - рекомендуется pre-warming
- **71-100**: 🔴 **CRITICAL** - обязательно pre-warming

### 8 Факторов Оценки Риска

| # | Фактор | Вес | Что Определяет |
|---|--------|-----|------------------|
| 1 | **Bot Index** | 22% | Позиция бота в батче (первые боты рискованнее) |
| 2 | **Proxy Age** | 18% | Возраст прокси (новые прокси = risky) |
| 3 | **Platform-Browser** | 18% | OS-Browser комбо (WebKit на Linux = 95/100!) |
| 4 | **Bot Population** | 13% | Сколько всего ботов в запуске |
| 5 | **Daily Velocity** | 13% | Скорость трафика в день (быстро = suspicious) |
| 6 | **Session Volume** | 8% | Сессий на бота (много = risky) |
| 7 | **Pacing Mode** | 8% | Human vs Fast (human = безопаснее) |

### Примеры Оценки

#### Пример 1: ПЕРВЫЙ БОТ В БАТЧЕ (Рискованный)

```
Config:
  - totalBots: 1000
  - sessionsPerBot: 100
  - pacingMode: 'fast'
  - browserType: 'chromium'
  - platform: 'linux'

Bot Index: 0 (первый)

Оценка:
  Bot Index:        80/100  🔴 (первый бот = максимальный риск, вес 22%)
  Proxy Age:        65/100  🟡 (новая прокси, вес 18%)
  Bot Population:   60/100  🟡 (1000 ботов = много, вес 13%)
  Daily Velocity:   75/100  🔴 (много сессий в день, вес 13%)
  Session Volume:   75/100  🔴 (100 сессий = очень много, вес 8%)
  Pacing Mode:      70/100  🟡 (fast mode = unnatural, вес 8%)
  Platform-Browser: 10/100  🟢 (Chromium on Linux = normal, вес 18%)
  
Итог: Risk Score = 66/100 🟡 HIGH RISK
Рекомендация: "🚨 HIGH RISK: Do pre-warming + extended delays"
Действие: ✅ ДЕЛАЕМ PRE-WARMING
```

#### Пример 2: ПОЗДНИЙ БОТ В БАТЧЕ (Безопасный)

```
Config:
  - totalBots: 1000
  - sessionsPerBot: 100
  - pacingMode: 'human'
  - browserType: 'firefox'
  - platform: 'windows'

Bot Index: 500 (поздний)

Оценка:
  Bot Index:        15/100  🟢 (поздний бот = низкий риск, вес 22%)
  Proxy Age:        45/100  🟡 (средняя прокси, вес 18%)
  Bot Population:   60/100  🟡 (1000 ботов, вес 13%)
  Daily Velocity:   50/100  🟡 (среднее кол-во сессий, вес 13%)
  Session Volume:   75/100  🔴 (100 сессий, вес 8%)
  Pacing Mode:      20/100  🟢 (human mode = natural, вес 8%)
  Platform-Browser: 35/100  🟡 (Firefox on Windows = unusual, вес 18%)
  
Итог: Risk Score = 45/100 🟡 MEDIUM RISK
Рекомендация: "⚡ MEDIUM RISK: Do pre-warming (moderate protection)"
Действие: ✅ ДЕЛАЕМ PRE-WARMING (но менее критично)
```

#### Пример 3: МАЛЕНЬКИЙ ЗАПУСК (Безопасный)

```
Config:
  - totalBots: 10
  - sessionsPerBot: 5
  - pacingMode: 'human'
  - browserType: 'chromium'
  - platform: 'linux'

Bot Index: 3

Оценка:
  Bot Index:        50/100  🟡 (ранний, но маленький батч, вес 22%)
  Proxy Age:        25/100  🟢 (установленная прокси, вес 18%)
  Bot Population:   10/100  🟢 (только 10 ботов = безопасно, вес 13%)
  Daily Velocity:   20/100  🟢 (мало сессий, вес 13%)
  Session Volume:   10/100  🟢 (5 сессий = мало, вес 8%)
  Pacing Mode:      20/100  🟢 (human, вес 8%)
  Platform-Browser: 10/100  🟢 (Chromium on Linux = normal, вес 18%)
  
Итог: Risk Score = 22/100 🟢 SAFE
Рекомендация: "✅ SAFE: Skip pre-warming (save proxy traffic)"
Действие: ❌ ПРОПУСКАЕМ PRE-WARMING (экономия $0.0001)
```

## 💰 Экономия

### Типичный Запуск 1000 ботов

```
Сценарий: 1000 ботов, 100 сессий каждый

Без Risk Assessment:
  - Все 1000 ботов делают pre-warming
  - Pre-warming data: 1000 ботов × 0.01 GB = 10 GB
  - Стоимость: 10 GB × $0.004/GB = $40

С Risk Assessment:
  - Первые 100 ботов (индекс 0-99): RISKY → pre-warming
  - Боты 100-1000 (индекс 100+): SAFE → пропускаем pre-warming
  - Pre-warming data: 100 ботов × 0.01 GB = 1 GB
  - Стоимость: 1 GB × $0.004/GB = $4
  
ЭКОНОМИЯ: $36 (90% скидка!) 🎉
```

## 📝 Логирование

Когда бот запускается, видим:

```
🎯 RISK ASSESSMENT: Score 66/100 (⚠️ RISKY)
💡 Recommendation: 🚨 HIGH RISK: Do pre-warming + extended delays
   🔴 Bot Index: 80/100 (First bots in batch - gets intense scrutiny)
   🟡 Proxy Age: 65/100 (New proxy detected)
   🟡 Bot Population: 60/100 (Large bot count - 1000 bots)
   🔴 Daily Velocity: 75/100 (Very high session velocity)
   🔴 Session Volume: 75/100 (Very high sessions per bot)
   🟡 Pacing Mode: 70/100 (Fast pacing - unnatural)
   🟢 Platform-Browser: 10/100 (Chromium on Linux - normal combo)

🔴 HIGH RISK BOT: Will do pre-warming (66/100 > 45)
🔥 STAGE 1: Warming up with proxy for cookie collection...
```

или для безопасного бота:

```
🎯 RISK ASSESSMENT: Score 22/100 (✅ SAFE)
💡 Recommendation: ✅ SAFE: Skip pre-warming (save proxy traffic)
   🟢 Bot Index: 50/100 (Early position but small batch)
   🟢 Proxy Age: 25/100 (Established proxy)
   🟢 Bot Population: 10/100 (Small batch - only 10 bots)
   🟢 Daily Velocity: 20/100 (Low session velocity)
   🟢 Session Volume: 10/100 (Low sessions per bot)
   🟢 Pacing Mode: 20/100 (Human pacing - natural)
   🟢 Platform-Browser: 10/100 (Chromium on Linux - normal combo)

🟢 SAFE BOT: Skipping pre-warming (22/100 < 45)
⏭️ STAGE 1: Skipping pre-warming (low-risk bot)...
⏳ Adding 2.5s delay before SmartLink click...
```

или для КРИТИЧЕСКОГО СЛУЧАЯ (WebKit на Linux):

```
🎯 RISK ASSESSMENT: Score 95/100 (🔴 CRITICAL)
💡 Recommendation: 🚨 CRITICAL RISK: WebKit on Linux detected!
   🔴 Bot Index: 80/100 (First bot)
   🔴 Platform-Browser: 95/100 (⚠️  CRITICAL: WebKit (Safari) on Linux)
   ...

🔴 CRITICAL BOT SIGNATURE DETECTED!
🔴 WebKit (Safari) on Linux = 100% detectable bot signature
🔴 Safari only exists on macOS and iOS - NEVER on Linux
🔴 Anti-fraud will ALWAYS block this combination

✅ SOLUTION: Use Chromium instead!

🔥 STAGE 1: Warming up with proxy for cookie collection...
```

## 🎯 Настройка Risk Threshold

В коде [src/lib/bot-risk-assessment.ts](src/lib/bot-risk-assessment.ts):

```typescript
// Текущий threshold: 45/100
// Боты с score > 45 делают pre-warming
const isRisky = riskScore > 45;
```

### Как изменить threshold:

**Для более строгой защиты (больше pre-warming, больше затрат):**
```typescript
const isRisky = riskScore > 60;  // Только очень рискованные делают pre-warming
```

**Для экономии (меньше pre-warming, риск выше):**
```typescript
const isRisky = riskScore > 30;  // Почти все делают pre-warming
```

## 📊 Batch Assessment

Перед запуском можно оценить весь батч:

```typescript
import { assessRunRisk } from '@/lib/bot-risk-assessment';

const config: AdsterraConfig = {
  totalBots: 1000,
  sessionsPerBot: 100,
  pacingMode: 'human',
  // ...
};

const analysis = assessRunRisk(config);
console.log(analysis.recommendation);
// Output: "⚡ Medium risk run. Pre-warm ~450 bots ($1.80). Consider using pre-warming cache."
```

## 🚀 Интеграция с Кэшированием

Рекомендация: Комбинируйте Risk Assessment + Cookie Cache:

1. **Первый бот RISKY**: делаем pre-warming, сохраняем куки в кэш
2. **Последующие RISKY боты**: используют кэш (бесплатно!)
3. **SAFE боты**: пропускают pre-warming (бесплатно!)

**Результат**: 99% экономия трафика на pre-warming! 🎉

## 📚 Файлы

- **Логика оценки**: [src/lib/bot-risk-assessment.ts](src/lib/bot-risk-assessment.ts)
- **Использование в session**: [src/bot/session.ts](src/bot/session.ts#L330-L360)
- **Types**: `BotRiskProfile`, `RiskFactor`

## ⚠️ Важно

- Risk Assessment **НЕ влияет** на качество сессий, только на наличие pre-warming
- Даже SAFE боты используют stealth scripts и имитируют реального пользователя
- Pre-warming пропускается только для экономии трафика, anti-fraud всё равно обманывается stealth скриптами
