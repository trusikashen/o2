# ⚙️ Worker Job Processing - Sequential vs Parallel

## Problem 🔴
Worker was grabbing many jobs at once instead of processing them sequentially:
```
bot-00003 starts
bot-00004 starts  ← All at the same time!
bot-00006 starts
bot-00008 starts
```

## Root Cause 🔍
The worker used `MAX_WORKER_THREADS = currentConcurrency + 5`

Example:
- `currentConcurrency = 5` (only 5 browser windows should run at once)
- `MAX_WORKER_THREADS = 10` (10 worker threads spawn)
- ❌ Result: All 10 threads grab jobs simultaneously, starting 10 jobs at once

## Solution ✅
Changed to: `MAX_WORKER_THREADS = currentConcurrency`

Now:
- `currentConcurrency = 5` (only 5 browser windows should run at once)
- `MAX_WORKER_THREADS = 5` (only 5 worker threads spawn)
- ✅ Result: Max 5 jobs are grabbed at once

## How It Works

### Semaphore (Concurrency Control)
```
Semaphore with 5 permits (currentConcurrency=5)

Worker 1: Acquires permit → Processes job 1
Worker 2: Acquires permit → Processes job 2
Worker 3: Acquires permit → Processes job 3
Worker 4: Acquires permit → Processes job 4
Worker 5: Acquires permit → Processes job 5
Worker 6: WAITING - no permits available
Worker 7: WAITING - no permits available
Worker 8: WAITING - no permits available
...
Worker N: WAITING - no permits available

When Worker 1 finishes → Releases permit
Worker 6: Gets permit → Processes job 6
```

### Old (Broken) vs New (Fixed)

| Aspect | Old ❌ | New ✅ |
|--------|--------|--------|
| currentConcurrency | 5 | 5 |
| MAX_WORKER_THREADS | 10 | 5 |
| Jobs grabbed at once | ~10 | ~5 |
| Browsers running | ~10 (OVERLOAD) | ~5 (SAFE) |
| Proxy strain | HIGH | NORMAL |

## Configuration

### Via Environment Variable
```bash
# In .env file
MAX_WORKER_THREADS=5
```

### Via Command Line
```bash
MAX_WORKER_THREADS=3 npm run worker
```

### Per Run
Set `concurrency` in the run config to control how many jobs execute in parallel:
```json
{
  "concurrency": 5,  // Max 5 jobs running at once
  "pacingMode": "human",
  "url": "https://..."
}
```

## Job Processing Flow

```
1. User creates run with concurrency=5
2. Worker starts 5 worker threads
3. All 5 threads try to grab jobs
4. Each acquires semaphore permit (one per job)
5. Job 1,2,3,4,5 start running
6. Threads 6,7,8,9,10 → WAIT (no more threads!)
7. Job 1 completes → Thread 1 releases permit
8. Job 6 grabs that permit from waiting queue
9. Process repeats until all jobs done
```

## Key Files Changed

- [src/worker.ts](src/worker.ts) Line 390-400:
  - Changed `MAX_WORKER_THREADS = currentConcurrency + 5` → `MAX_WORKER_THREADS = currentConcurrency`

- [.env](.env) Line ~45:
  - Added `MAX_WORKER_THREADS=5` configuration

## Verification

### Before Fix
```
Terminal shows:
🚀 [bot-00001] Session 1: Starting...
🚀 [bot-00002] Session 1: Starting...
🚀 [bot-00003] Session 1: Starting...
🚀 [bot-00004] Session 1: Starting...
🚀 [bot-00005] Session 1: Starting...
🚀 [bot-00006] Session 1: Starting...  ← Should wait!
🚀 [bot-00007] Session 1: Starting...  ← Should wait!
🚀 [bot-00008] Session 1: Starting...  ← Should wait!
...

Result: 10+ jobs start simultaneously (OVERLOAD)
```

### After Fix
```
Terminal shows:
🚀 [bot-00001] Session 1: Starting...
🚀 [bot-00002] Session 1: Starting...
🚀 [bot-00003] Session 1: Starting...
🚀 [bot-00004] Session 1: Starting...
🚀 [bot-00005] Session 1: Starting...
⏳ Waiting for available slot...  ← Blocked by semaphore
⏳ Waiting for available slot...
...
[Job 1 completes]
🚀 [bot-00006] Session 1: Starting...  ← Now starts

Result: Max 5 jobs run at once (CONTROLLED)
```

## Performance Impact

| Metric | Impact |
|--------|--------|
| CPU Usage | ⬇️ Reduced (fewer simultaneous browsers) |
| Memory Usage | ⬇️ Reduced (fewer processes) |
| Proxy Errors | ⬇️ Reduced (less simultaneous connections) |
| Job Throughput | ➡️ Same (paced out, not faster/slower) |
| Stability | ⬆️ Improved (system less overloaded) |

## Testing

### Manual Test
1. Create run with 20 jobs and concurrency=3
2. Watch worker logs:
   ```bash
   npm run worker
   ```
3. Should see max 3 jobs starting simultaneously
4. When one completes, next job starts
5. Should NOT see 10+ jobs starting at once

### Automated Test
```bash
npm run test:scheduling  # Should pass
npm run test:scheduling:integration  # Should pass
```

## Troubleshooting

### Problem: Still seeing too many jobs start at once
- Check worker logs for actual concurrency being used
- Verify `.env` has `MAX_WORKER_THREADS=5` (or desired value)
- Check run config has `concurrency` set correctly
- Restart worker: `npm run worker`

### Problem: Jobs not processing fast enough
- Increase `MAX_WORKER_THREADS` in `.env` (up to run's concurrency)
- Increase `concurrency` in run config
- Check browser launching stagger: `LAUNCH_STAGGER_MS` (default: 5000ms)
- Look at CPU/Memory usage (might be system bottleneck)

### Problem: System overload (high CPU, slow browsers)
- Decrease `MAX_WORKER_THREADS` in `.env`
- Decrease `concurrency` in run config
- Increase `LAUNCH_STAGGER_MS` (default: 5000ms, can increase to 10000ms)

## Related

- **Semaphore**: [src/utils/semaphore.ts](src/utils/semaphore.ts)
- **Concurrency**: [src/utils/dynamic-concurrency.ts](src/utils/dynamic-concurrency.ts)
- **Job Queue**: [src/queue/dynamodb-queue.ts](src/queue/dynamodb-queue.ts)
- **Worker**: [src/worker.ts](src/worker.ts)

---

**Summary**: Jobs now process sequentially within concurrency limit (default 5 at a time), not all at once.
