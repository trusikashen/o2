# Настройка автономного фронтенда в папке Adsterra

## Шаг 1: Установите зависимости

```powershell
cd C:\adsterra\adsterra
npm install
```

## Шаг 2: Скопируйте файлы фронтенда

Нужно скопировать эти файлы из корневого проекта `AdsenseLoading`:

### Из `src/app/adsterra/` → `src/app/adsterra/`
- `page.tsx`
- `[runId]/page.tsx`

### Из `src/app/api/adsterra/` → `src/app/api/adsterra/`
- `runs/route.ts`
- `runs/[runId]/route.ts`
- `runs/[runId]/start/route.ts`
- `runs/[runId]/stop/route.ts`
- `runs/[runId]/stats/route.ts`
- `runs/[runId]/test-local/route.ts`

### Из `src/lib/adsterra/` → `src/lib/adsterra/`
- `concurrency-calculator.ts`
- `create-jobs.ts`
- `distribution-calculator.ts`

### Из `src/lib/` → `src/lib/`
- `adsterraProfitConfigs.ts`

### Из `src/types/` → `src/types/`
- `adsterra.ts` (или создать `index.ts` с типами)

### Создайте `src/app/layout.tsx` и `src/app/globals.css`

Они нужны для работы Next.js.

## Шаг 3: Запуск

```powershell
npm run dev
```

Фронтенд поднимется на `http://localhost:3000/adsterra`
