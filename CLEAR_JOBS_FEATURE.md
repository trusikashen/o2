# Clear All Jobs Feature - с прогрессом

## Overview
Frontend функция для очистки всех задач из DynamoDB с визуальным отображением прогресса удаления.

## Features

### Frontend Button
- **Location**: Top right corner of the Adsterra dashboard (`http://localhost:3001/adsterra`)
- **Button**: 🗑️ Clear All Jobs (Red button)
- **Safety**: Double confirmation dialogs to prevent accidental deletion
- **Progress Modal**: Real-time display of deletion progress with statistics

### Progress Display Modal
Модальное окно показывает:
- 🔍 **Status** - текущее состояние операции (Scanning/Deleting/Complete/Error)
- 📊 **Jobs Found** - общее количество найденных задач
- ✅ **Deleted** - успешно удаленные задачи
- ❌ **Failed** - не удалось удалить
- 📈 **Progress Bar** - визуальное отображение прогресса

### API Endpoint
- **Endpoint**: `DELETE /api/jobs/clear`
- **Method**: DELETE
- **Authentication**: None (ensure proper security if exposed to production)
- **Response**:
  ```json
  {
    "success": true,
    "message": "✨ Successfully deleted 1500/1500 jobs! Database cleanup complete.",
    "deletedCount": 1500,
    "failedCount": 0,
    "jobsFound": 1500,
    "successRate": "100.0"
  }
  ```

## Usage

### From Frontend (Рекомендуется)
1. Перейти на `http://localhost:3001/adsterra`
2. Нажать красную кнопку **🗑️ Clear All Jobs** в правом верхнем углу
3. Подтвердить первый диалог (⚠️ Warning)
4. Подтвердить второй диалог (🚨 Last Warning)
5. Смотреть как удаляются jobs в модальном окне:
   - 📊 Видеть сколько всего найдено jobs
   - ✅ Видеть текущее количество удаленных
   - ❌ Видеть количество ошибок
   - 📈 Видеть прогресс бар
6. Автоматическое закрытие после завершения

### From Terminal (как было)
```bash
npm run clear:jobs
```

### From API (curl)
```bash
curl -X DELETE http://localhost:3001/api/jobs/clear
```

## Technical Details

### Files Modified/Created

1. **Created**: [src/app/api/jobs/clear/route.ts](src/app/api/jobs/clear/route.ts)
   - API endpoint for DynamoDB job deletion
   - Сканирует все задачи с пагинацией
   - Удаляет батчами по 25 для оптимальной производительности
   - Возвращает детальную статистику
   - Логирует прогресс в консоль сервера

2. **Modified**: [src/app/adsterra/page.tsx](src/app/adsterra/page.tsx)
   - Added state variables for clearing progress:
     - `isClearing` - флаг выполнения операции
     - `clearingProgress` - объект с информацией о прогрессе
   - Added `handleClearAllJobs()` function
   - Added red **Clear All Jobs** button in header
   - Added progress modal component
   - Shows success message after operation

### Implementation Details

#### Backend (API Route)
- **Pagination**: Правильно обрабатывает большие датасеты с пагинацией
- **Batch Deletion**: Удаляет jobs батчами по 25 для лучшей производительности  
- **Error Handling**: Отслеживает ошибки удаления каждого job
- **Logging**: Подробные логи всех этапов операции
- **Statistics**: Возвращает полную статистику удаления

#### Frontend (UI Component)
- **Progress States**: 
  - `scanning` - сканирование DynamoDB
  - `deleting` - удаление tasks
  - `complete` - успешно завершено
  - `error` - произошла ошибка
- **Real-time Display**:
  - Jobs Found (синий)
  - Deleted (зеленый)
  - Failed (оранжевый)
- **Visual Feedback**:
  - Progress bar shows completion percentage
  - Success rate calculation
  - Color-coded statistics
- **Dark Mode**: Полная поддержка темного/светлого режима

## Response Examples

### Success - All Deleted
```json
{
  "success": true,
  "message": "✨ Successfully deleted 1500/1500 jobs! Database cleanup complete.",
  "deletedCount": 1500,
  "failedCount": 0,
  "jobsFound": 1500,
  "successRate": "100.0"
}
```

### Success - Partial Failure
```json
{
  "success": true,
  "message": "✨ Successfully deleted 1498/1500 jobs (2 failed)! Database cleanup complete.",
  "deletedCount": 1498,
  "failedCount": 2,
  "jobsFound": 1500,
  "failedJobs": ["job-123", "job-456"],
  "successRate": "99.9"
}
```

### No Jobs Found
```json
{
  "success": true,
  "message": "Database is already clean! No jobs found. ✨",
  "deletedCount": 0,
  "failedCount": 0,
  "jobsFound": 0
}
```

### Error
```json
{
  "success": false,
  "message": "❌ Error clearing jobs: Connection timeout",
  "deletedCount": 0,
  "failedCount": 0,
  "jobsFound": 0
}
```

## Server Console Output
API логирует детальный прогресс:
```
🔍 Scanning for jobs in DynamoDB (with pagination)...
📡 Scanned page 1, found 150 jobs so far...
📡 Scanned page 2, found 300 jobs so far...
📡 Scanned page 3, found 450 jobs so far...
📊 Found 1500 total jobs to delete (in 3 pages)
🗑️  Starting deletion of 1500 jobs in batches...
📦 Processing batch 1/60 (25 items)...
   ✅ Progress: 25/1500 deleted (1%)
📦 Processing batch 2/60 (25 items)...
   ✅ Progress: 50/1500 deleted (3%)
...
🎉 OPERATION COMPLETE!
   ✅ Successfully deleted: 1500 jobs
   ❌ Failed to delete: 0 jobs
   📊 Total jobs found: 1500
   💯 Success rate: 100.0%
```

## Safety Features
1. ✅ Double confirmation dialogs prevent accidental deletions
2. ✅ Clear warning messages in Russian and English
3. ✅ Red button indicates danger operation
4. ✅ Detailed progress tracking
5. ✅ Success/failure statistics displayed
6. ✅ Auto-close modal after operation
7. ✅ Console logging for debugging

## Notes
- Operation is **IRREVERSIBLE** - убедитесь что вы хотите удалить все tasks перед подтверждением
- Large datasets may take time to process - не закрывайте браузер во время операции
- Failed deletions are tracked and reported in response
- Server console logging provides real-time progress updates
- Modal prevents user interaction until operation is complete
- Automatic refresh of runs list after completion

