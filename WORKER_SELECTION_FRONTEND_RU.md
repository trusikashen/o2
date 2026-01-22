# Выбор Воркеров в Интерфейсе Фронтенда

## 📍 Где найти?

Выбор воркеров находится в файле:
**`src/app/adsterra/page.tsx`** - главная страница для создания кампаний

Секция находится в форме создания новой кампании, **прямо после выбора "Pacing Mode"** (режима распределения).

## 🎨 Визуально

```
┌─────────────────────────────────────────────────────────┐
│           Create New Run (Форма создания)               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Pacing Mode] - выбор режима распределения            │
│    ○ Human     ○ Fast                                  │
│                                                          │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│  ┃  Worker Assignment (Optional) ← ВЫ ЗДЕСЬ  ┃ │
│  ┃                                             ┃ │
│  ┃  [worker-0] [worker-1] [worker-2] ...      ┃ │
│  ┃  [worker-3] [worker-4] [worker-5] ...      ┃ │
│  ┃  ...                                        ┃ │
│  ┃  [worker-14]                               ┃ │
│  ┃                                             ┃ │
│  ┃  Selected: worker-0, worker-1              ┃ │
│  ┃  Jobs будут распределены между 2 workers   ┃ │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│                                                          │
│  [Basic Configuration] - остальные параметры          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## ⚙️ Как Это Работает

### Шаг 1: Выбор Воркеров
- Нажимаете на кнопку воркера (например `worker-0`)
- Кнопка становится синей/выделенной
- Воркер добавляется в список "Selected"

### Шаг 2: Выбор Нескольких Воркеров
```
Пример: Выбираю worker-0, worker-1, worker-2

[worker-0]  [worker-1]  [worker-2]  [worker-3]  ...
  (синий)     (синий)     (синий)    (белый)

Selected: worker-0, worker-1, worker-2
Jobs будут распределены между 3 workers
```

### Шаг 3: Отправка Формы
Когда вы нажимаете "Submit", данные включают:
```javascript
{
  name: "My Campaign",
  config: { /* ... */ },
  assignedWorkerIds: ["worker-0", "worker-1", "worker-2"]  // ← Выбранные воркеры
}
```

## 💡 Примеры Использования

### Пример 1: Кампания для одного воркера
```
Сценарий: Тестировать новую конфигурацию на worker-0

1. Выбираю только [worker-0]
2. Остальные параметры заполняю
3. Submit

Результат: Все 1000 jobs пойдут только worker-0
```

### Пример 2: Распределение между тремя воркерами
```
Сценарий: Кампания должна идти на worker-0, worker-1, worker-5

1. Выбираю [worker-0] [worker-1] [worker-5]
2. Остальные параметры
3. Submit

Результат: 
  - Job 0, 3, 6, ... → worker-0
  - Job 1, 4, 7, ... → worker-1
  - Job 2, 5, 8, ... → worker-5
```

### Пример 3: Без выбора (любой воркер может взять)
```
Сценарий: Стандартная кампания, неважно какой воркер обработает

1. НЕ выбираю никаких воркеров
2. Остальные параметры
3. Submit

Результат: assignedWorkerIds пусто
         Любой доступный воркер может взять эти jobs
```

## 🔄 Обновления на Фронтенде

### Где добавлен код?

**Файл:** `src/app/adsterra/page.tsx`

**1. State для выбора воркеров (строка ~28):**
```typescript
const [assignedWorkerIds, setAssignedWorkerIds] = useState<string[]>([]);
```

**2. Обновлен handleSubmit (строка ~170):**
```typescript
...(assignedWorkerIds.length > 0 && { assignedWorkerIds }),
```

**3. UI Компонент (строка ~600):**
```jsx
{/* Worker Assignment */}
<div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
  {/* Кнопки воркеров */}
  {Array.from({length: 15}, (_, i) => `worker-${i}`).map((workerId) => (
    <button
      onClick={() => {
        setAssignedWorkerIds(prev =>
          prev.includes(workerId)
            ? prev.filter(id => id !== workerId)
            : [...prev, workerId]
        );
      }}
      // ... стили
    >
      {workerId}
    </button>
  ))}
</div>
```

## 🎯 Логика Работы

### Frontend (React State)
```
User нажимает на воркер
    ↓
onClick срабатывает
    ↓
setAssignedWorkerIds(prev =>
  prev.includes(workerId)
    ? prev.filter(...)     // Убрать, если уже выбран
    : [...prev, workerId]  // Добавить, если не выбран
)
    ↓
State обновляется
    ↓
Кнопка меняет цвет (синий/белый)
    ↓
В поле Selected показываются выбранные воркеры
```

### Backend (API)
```
Frontend отправляет:
{
  assignedWorkerIds: ["worker-0", "worker-1"]
}
    ↓
API получает и сохраняет в run
    ↓
createJobsForRun() читает assignedWorkerIds
    ↓
Распределяет jobs round-robin:
  - Job 0 → worker-0
  - Job 1 → worker-1
  - Job 2 → worker-0
  - Job 3 → worker-1
    ↓
Сохраняет в DynamoDB с assignedWorkerId для каждого job
```

## 📋 Состояния Кнопок Воркеров

### Невыбранный (default)
```css
background: white
color: gray-700
border: gray-300
```
Пример: `[worker-3]` когда не нажата

### Выбранный (selected)
```css
background: blue-600
color: white
border: blue-600
```
Пример: `[worker-0]` когда нажата

## 🔄 Сброс Формы

Когда кампания успешно создана:
```typescript
setRunName('');
setAssignedWorkerIds([]);  // ← Очищаем выбор воркеров
```

Поэтому для следующей кампании все кнопки будут белые (невыбранные).

## 🚀 Использование

### Шаг за шагом:

1. **Откройте страницу** `/adsterra` (главная страница)

2. **Заполните базовые параметры:**
   - Run Name
   - Adsterra URL
   - Bots/Sessions/Impressions

3. **Выберите воркеров** (опционально):
   - Кликните на нужные кнопки worker-0 до worker-14
   - Выбранные станут синими

4. **Нажмите Submit**
   - Если воркеры выбраны: jobs распределяются между ними
   - Если не выбраны: любой воркер может взять

5. **Смотрите результат:**
   - Новая кампания появится в списке
   - Если выбрали воркеров, увидите их в assignedWorkerIds

## ⚠️ Важно

- **Выбор воркеров - опционально** (не обязательно)
- Если не выбрать - работает как раньше (любой воркер)
- Выбор сохраняется в database с каждым job
- Только выбранные воркеры будут обрабатывать эти jobs

## 🔗 Связанные Файлы

- **Frontend UI:** `src/app/adsterra/page.tsx`
- **API:** `src/app/api/adsterra/runs/route.ts`
- **Job Creation:** `src/lib/adsterra/create-jobs.ts`
- **Worker Logic:** `src/worker.ts`

---

**Коротко:** В форме создания кампании вы увидите ряд кнопок `[worker-0]`, `[worker-1]`, ... `[worker-14]`. Нажимайте на нужные - они станут синими. Это означает, что только эти воркеры будут обрабатывать jobs данной кампании.
