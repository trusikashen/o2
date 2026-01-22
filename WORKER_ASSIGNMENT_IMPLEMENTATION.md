# Worker-Specific Task Assignment Implementation

## Overview
Implemented a complete system to assign tasks to specific workers, enabling fine-grained control over which worker instances (worker-0 through worker-15) process which tasks. Each worker can now have individual configurations with different smart links.

## What Was Implemented

### 1. **Core Data Model Changes**

#### SessionJob Interface (`src/types/index.ts`)
- Added `assignedWorkerId?: string` - ID of the worker assigned to this job
- Added `assignedAt?: Date` - Timestamp when the job was assigned

#### AdsterraRun Interface (`src/types/adsterra.ts`)
- Added `assignedWorkerIds?: string[]` - Optional array of worker IDs to which this run's jobs should be assigned

### 2. **DynamoDB Queue Updates** (`src/queue/dynamodb-queue.ts`)

#### `addJob()` Function
- Now stores `assignedWorkerId` and `assignedAt` fields in DynamoDB
- Fields are initially null/undefined, set when a worker claims the job

#### `markJobActive(jobId: string, workerId?: string)` Function
- **Updated signature**: Now accepts optional `workerId` parameter
- **Atomically claims jobs** with conditional DynamoDB update
- **Stores worker assignment** when job transitions from pending → active
- Returns `true` if successfully claimed, `false` if already claimed

#### `getNextJobForWorker()` Function (NEW)
```typescript
export async function getNextJobForWorker(
  workerId: string,
  ignoreScheduledTime = false
): Promise<SessionJob | null>
```
- Queries GSI1 (STATUS#pending) for available jobs
- Filters for jobs assigned to the specific worker OR unassigned jobs (backward compatible)
- Returns oldest first (FIFO within worker)
- Handles both immediate processing and scheduled processing modes

### 3. **Worker Updates** (`src/worker.ts`)

#### Worker ID Generation
Each worker thread now gets a unique identifier:
```typescript
const workerId = 
  process.env.WORKER_ID ||                           // Highest priority
  (process.env.NODE_APP_INSTANCE ? `worker-${process.env.NODE_APP_INSTANCE}` : null) ||  // PM2 instance ID
  `worker-${i}`;                                      // Thread index fallback
```

#### `processJob()` Function
- **Updated signature**: Now accepts optional `workerId` parameter
- Passes worker ID to `markJobActive()` when claiming jobs
- Supports worker-specific job retrieval with `getNextJobForWorker()`
- Maintains backward compatibility (works with unassigned jobs)

#### Worker Spawn Loop
- Each worker thread gets assigned a unique ID on initialization
- Worker ID is passed to `processJob()` for all job processing
- Enables tracking which worker processed which job

### 4. **Frontend API Updates** (`src/app/api/adsterra/runs/route.ts`)

#### POST /api/adsterra/runs
- Now accepts optional `assignedWorkerIds` array in request body
- Stores worker assignment in the run record
- Example payload:
```typescript
{
  name: "My Campaign",
  config: { /* ... */ },
  assignedWorkerIds: ["worker-0", "worker-1"]  // Jobs routed to specific workers
}
```

### 5. **Job Creation Updates** (`src/lib/adsterra/create-jobs.ts`)

#### Job Distribution Logic
- Jobs are now distributed round-robin across assigned workers:
```typescript
const assignedWorkerId = 
  assignedWorkerIds.length > 0 
    ? assignedWorkerIds[jobCount % assignedWorkerIds.length]
    : undefined;
```
- If `assignedWorkerIds` is empty, jobs are unassigned (any worker can claim)
- If `assignedWorkerIds` is provided, jobs are distributed evenly

#### DynamoDB Item Creation
- Includes `assignedWorkerId` field in job records
- Includes `assignedAt` field (initially null, set when claimed)
- Includes all realistic session fields

## Usage Examples

### Example 1: Route All Jobs to Specific Workers
```bash
# Frontend request to create a run assigned to worker-0 and worker-1
POST /api/adsterra/runs
{
  "name": "Campaign for Worker0+1",
  "config": {
    "adsterraUrl": "https://...",
    "totalBots": 100,
    "sessionsPerBot": 10,
    "targetImpressions": 1000
  },
  "assignedWorkerIds": ["worker-0", "worker-1"]
}
```

**Result**: 
- 1000 jobs created
- Jobs 0, 500: assigned to worker-0
- Jobs 1, 501: assigned to worker-1
- Workers alternate claiming jobs

### Example 2: Create Unassigned Jobs (Backward Compatible)
```bash
POST /api/adsterra/runs
{
  "name": "Campaign for Any Worker",
  "config": { /* ... */ }
  // No assignedWorkerIds specified
}
```

**Result**: 
- Jobs created without assignment
- Any available worker can claim them
- Maintains backward compatibility

### Example 3: PM2 Configuration for Worker Instances
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'worker',
      script: './dist/worker.js',
      instances: 15,
      exec_mode: 'fork',
      env: {
        NODE_APP_INSTANCE: 0  // PM2 auto-increments for each instance
      }
    }
  ]
};
```

Workers will automatically identify as:
- worker-0
- worker-1
- ...
- worker-14

Or with explicit `WORKER_ID` env var:
```javascript
apps: [
  {
    name: 'worker-0',
    script: './dist/worker.js',
    env: { WORKER_ID: 'worker-0' }
  },
  {
    name: 'worker-1',
    script: './dist/worker.js',
    env: { WORKER_ID: 'worker-1' }
  },
  // ... etc
]
```

## Architecture Flow

### Job Creation Flow
```
Frontend Request (with optional assignedWorkerIds)
    ↓
POST /api/adsterra/runs
    ↓
Create Run in DynamoDB (stores assignedWorkerIds if provided)
    ↓
POST /api/adsterra/runs/[runId]/start
    ↓
createJobsForRun(run)
    ↓
For each job:
  - If assignedWorkerIds provided: assign worker round-robin
  - Else: leave unassigned (null)
    ↓
Store jobs in DynamoDB with assignedWorkerId field
```

### Job Processing Flow
```
Worker Thread Starts
    ↓
Generate unique workerId (from WORKER_ID, NODE_APP_INSTANCE, or thread index)
    ↓
Call getNextJob() or getNextJobForWorker(workerId)
    ↓
getNextJobForWorker() queries GSI1 for:
  - Jobs assigned to this worker, OR
  - Unassigned jobs (for backward compatibility)
    ↓
getNextJob() queries GSI1 for ANY pending jobs (if no specific worker)
    ↓
Call markJobActive(jobId, workerId)
    ↓
Atomically update job:
  - status: pending → active
  - assignedWorkerId: set if not already assigned
  - assignedAt: set to current timestamp
    ↓
Process job (execute bot session)
    ↓
Mark complete/failed
```

## Database Schema Changes

### AdsterraJobs Table - New Fields
| Field | Type | Purpose |
|-------|------|---------|
| `assignedWorkerId` | String (nullable) | ID of assigned worker |
| `assignedAt` | String (ISO timestamp, nullable) | When job was claimed |

### AdsterraRuns Table - New Fields
| Field | Type | Purpose |
|-------|------|---------|
| `assignedWorkerIds` | List of Strings | Worker IDs for this run |

## Backward Compatibility

✅ **Fully backward compatible** - All existing functionality preserved:
- Workers without `WORKER_ID` env var fall back to thread-index naming
- Jobs without `assignedWorkerId` can be claimed by any worker
- Runs without `assignedWorkerIds` work exactly as before
- All existing API calls continue to work

## Per-Worker Configuration (Future Enhancement)

To implement individual smart link configurations per worker:

1. **Create WorkerConfig table**
```typescript
interface WorkerConfig {
  PK: string; // "WORKER#worker-0"
  SK: string; // "META"
  workerId: string;
  adsterraUrl: string;
  smartLink: string;
  proxySettings?: object;
  userAgents?: string[];
  // ... other per-worker settings
}
```

2. **Load config in worker**
```typescript
const workerConfig = await getWorkerConfig(workerId);
const session = new AdsterraSession(
  workerConfig?.adsterraUrl || run.config.adsterraUrl
);
```

3. **Update from admin API**
```typescript
// PATCH /api/admin/workers/[workerId]/config
```

## Files Modified

1. **src/types/index.ts** - Added worker assignment fields to SessionJob
2. **src/types/adsterra.ts** - Added assignedWorkerIds to AdsterraRun
3. **src/queue/dynamodb-queue.ts** - Updated queue functions for worker assignment
4. **src/worker.ts** - Added worker ID generation and routing
5. **src/app/api/adsterra/runs/route.ts** - Added assignedWorkerIds support
6. **src/lib/adsterra/create-jobs.ts** - Added job distribution logic

## Testing Checklist

- [ ] Create run without assignedWorkerIds → jobs are unassigned
- [ ] Create run with assignedWorkerIds → jobs are assigned round-robin
- [ ] Start multiple worker instances → each gets unique ID
- [ ] Submit job specifically for worker-0 → only worker-0 claims it
- [ ] Submit job with no assignment → any worker can claim it
- [ ] Verify job's assignedWorkerId is set when claimed
- [ ] Monitor DynamoDB to see worker assignments
- [ ] Test with PM2 cluster mode → verify instance ID assignment

## Next Steps

1. Update PM2 configuration to use unique WORKER_ID for each instance
2. Create WorkerConfig table for per-worker smart links
3. Implement admin API for managing worker configurations
4. Add monitoring dashboard showing worker assignments
5. Create script to auto-configure workers 0-15 with different smart links
